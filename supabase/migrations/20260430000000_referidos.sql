-- ============================================================
-- LANDAZURY — Programa de referidos
-- ============================================================
--   * Cada perfil tiene referral_code (8 chars, sin ambiguos)
--   * referido_por en perfiles (1 nivel — solo directos)
--   * config_plataforma:
--       referral_commission_pct  (% de comisión, 0 = desactivado)
--       referral_commission_base (subtotal | flete_total | flete_ganancia | total_debitado)
--   * Tabla comisiones_referidos (ledger de comisiones)
--   * Trigger: cuando un pedido pasa a 'entregado' → acredita comisión
--     al referidor del vendedor (si existe), idempotente vía UNIQUE(pedido_id)
--   * RPC set_referrer(codigo) — el usuario asocia su referidor (solo si
--     aún no tiene uno; valida código y evita auto-referencia)
-- ============================================================

-- ============================================================
-- 1. Columnas en perfiles
-- ============================================================

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS referral_code  VARCHAR(8) UNIQUE,
  ADD COLUMN IF NOT EXISTS referido_por   UUID REFERENCES perfiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_perfiles_referido_por
  ON perfiles(referido_por)
  WHERE referido_por IS NOT NULL;

-- ============================================================
-- 2. Generador de códigos cortos (sin caracteres ambiguos)
-- ============================================================

CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS TEXT AS $$
DECLARE
  v_chars CONSTANT TEXT := 'abcdefghjkmnpqrstuvwxyz23456789'; -- sin 0,1,i,l,o
  v_code TEXT;
  v_i INT;
BEGIN
  LOOP
    v_code := '';
    FOR v_i IN 1..7 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM perfiles WHERE referral_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Backfill: perfiles existentes obtienen referral_code
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM perfiles WHERE referral_code IS NULL LOOP
    UPDATE perfiles SET referral_code = public.gen_referral_code() WHERE id = r.id;
  END LOOP;
END $$;

-- ============================================================
-- 4. Trigger BEFORE INSERT en perfiles → asignar código
-- ============================================================

CREATE OR REPLACE FUNCTION public.asignar_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.gen_referral_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_asignar_referral_code ON perfiles;
CREATE TRIGGER trg_asignar_referral_code
  BEFORE INSERT ON perfiles
  FOR EACH ROW EXECUTE FUNCTION public.asignar_referral_code();

-- ============================================================
-- 5. Configuración (% y base de cálculo)
-- ============================================================

INSERT INTO config_plataforma (clave, valor) VALUES
  ('referral_commission_pct',  '5'::jsonb),
  ('referral_commission_base', '"flete_ganancia"'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- ============================================================
-- 6. Aceptar el nuevo tipo de movimiento en el ledger
-- ============================================================

ALTER TABLE movimientos_wallet
  DROP CONSTRAINT IF EXISTS movimientos_wallet_tipo_check;

ALTER TABLE movimientos_wallet
  ADD CONSTRAINT movimientos_wallet_tipo_check
  CHECK (tipo IN (
    'recarga',
    'debito_flete',
    'debito_anticipado',
    'reembolso',
    'ajuste_admin',
    'comision_referido'
  ));

-- ============================================================
-- 7. Tabla comisiones_referidos
-- ============================================================

CREATE TABLE IF NOT EXISTS comisiones_referidos (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referidor_id         UUID REFERENCES perfiles(id) ON DELETE CASCADE NOT NULL,
  referido_id          UUID REFERENCES perfiles(id) ON DELETE CASCADE NOT NULL,
  pedido_id            UUID REFERENCES pedidos(id)  ON DELETE CASCADE NOT NULL UNIQUE,
  monto                DECIMAL(12,2) NOT NULL CHECK (monto >= 0),
  porcentaje_aplicado  DECIMAL(5,2)  NOT NULL,
  base_calculo         DECIMAL(12,2) NOT NULL,
  base_tipo            TEXT NOT NULL,
  creado_en            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comisiones_referidor
  ON comisiones_referidos(referidor_id, creado_en DESC);

ALTER TABLE comisiones_referidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comisiones_propias_lectura" ON comisiones_referidos;
CREATE POLICY "comisiones_propias_lectura" ON comisiones_referidos
  FOR SELECT USING (auth.uid() = referidor_id);

DROP POLICY IF EXISTS "comisiones_admin_lectura" ON comisiones_referidos;
CREATE POLICY "comisiones_admin_lectura" ON comisiones_referidos
  FOR SELECT USING (public.obtener_rol() = 'admin');

-- ============================================================
-- 8. RPC set_referrer — el usuario asocia su referidor
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_referrer(p_codigo TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id       UUID;
  v_referidor_id  UUID;
  v_perfil        RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_codigo IS NULL OR length(trim(p_codigo)) = 0 THEN
    RAISE EXCEPTION 'Código requerido';
  END IF;

  SELECT id, referido_por INTO v_perfil FROM perfiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF v_perfil.referido_por IS NOT NULL THEN
    RETURN json_build_object('status', 'ya_tiene_referidor');
  END IF;

  SELECT id INTO v_referidor_id FROM perfiles
   WHERE lower(referral_code) = lower(trim(p_codigo))
   LIMIT 1;

  IF v_referidor_id IS NULL THEN
    RAISE EXCEPTION 'Código de referido inválido';
  END IF;

  IF v_referidor_id = v_user_id THEN
    RAISE EXCEPTION 'No puedes referirte a ti mismo';
  END IF;

  UPDATE perfiles SET referido_por = v_referidor_id WHERE id = v_user_id;

  RETURN json_build_object('status', 'ok', 'referidor_id', v_referidor_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.set_referrer TO authenticated;

-- ============================================================
-- 9. Procesador de comisión cuando un pedido se entrega
--    Idempotente vía UNIQUE(pedido_id) en comisiones_referidos
-- ============================================================

CREATE OR REPLACE FUNCTION public.procesar_comision_referido(p_pedido_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pedido        RECORD;
  v_referidor_id  UUID;
  v_pct           NUMERIC;
  v_base_tipo     TEXT;
  v_base          NUMERIC;
  v_monto         NUMERIC;
  v_saldo_nuevo   DECIMAL(12,2);
BEGIN
  IF EXISTS (SELECT 1 FROM comisiones_referidos WHERE pedido_id = p_pedido_id) THEN
    RETURN;
  END IF;

  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id;
  IF NOT FOUND OR v_pedido.estado <> 'entregado' THEN
    RETURN;
  END IF;

  SELECT referido_por INTO v_referidor_id FROM perfiles WHERE id = v_pedido.vendedor_id;
  IF v_referidor_id IS NULL THEN
    RETURN;
  END IF;

  SELECT (valor #>> '{}')::numeric INTO v_pct
    FROM config_plataforma WHERE clave = 'referral_commission_pct';
  IF v_pct IS NULL OR v_pct <= 0 THEN
    RETURN;
  END IF;

  SELECT (valor #>> '{}') INTO v_base_tipo
    FROM config_plataforma WHERE clave = 'referral_commission_base';
  v_base_tipo := COALESCE(v_base_tipo, 'flete_ganancia');

  v_base := CASE v_base_tipo
    WHEN 'subtotal'        THEN COALESCE(v_pedido.subtotal, 0)
    WHEN 'flete_total'     THEN COALESCE(v_pedido.flete, 0)
    WHEN 'total_debitado'  THEN COALESCE(v_pedido.total_debitado, 0)
    ELSE                        COALESCE(v_pedido.flete_ganancia, 0)
  END;

  IF v_base <= 0 THEN
    RETURN;
  END IF;

  v_monto := round(v_base * v_pct / 100.0, 2);
  IF v_monto <= 0 THEN
    RETURN;
  END IF;

  UPDATE perfiles SET saldo = saldo + v_monto
    WHERE id = v_referidor_id
    RETURNING saldo INTO v_saldo_nuevo;

  IF v_saldo_nuevo IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO movimientos_wallet (
    perfil_id, tipo, monto, saldo_despues, referencia, descripcion
  ) VALUES (
    v_referidor_id, 'comision_referido', v_monto, v_saldo_nuevo,
    'comision_' || p_pedido_id::text,
    'Comisión por referido — pedido #' || v_pedido.numero
  );

  INSERT INTO comisiones_referidos (
    referidor_id, referido_id, pedido_id, monto,
    porcentaje_aplicado, base_calculo, base_tipo
  ) VALUES (
    v_referidor_id, v_pedido.vendedor_id, p_pedido_id, v_monto,
    v_pct, v_base, v_base_tipo
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 10. Trigger AFTER UPDATE OF estado ON pedidos
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_pedido_comision_referido_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'entregado' AND (OLD.estado IS DISTINCT FROM 'entregado') THEN
    PERFORM public.procesar_comision_referido(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_pedidos_comision_referido ON pedidos;
CREATE TRIGGER trg_pedidos_comision_referido
  AFTER UPDATE OF estado ON pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedido_comision_referido_fn();

-- ============================================================
-- 11. RPC stats_referidos — para el dashboard del usuario
-- ============================================================

CREATE OR REPLACE FUNCTION public.stats_referidos()
RETURNS JSON AS $$
DECLARE
  v_user_id       UUID;
  v_total_ref     INT;
  v_total_ganado  DECIMAL(12,2);
  v_pendientes    INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT COUNT(*) INTO v_total_ref
    FROM perfiles WHERE referido_por = v_user_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_total_ganado
    FROM comisiones_referidos WHERE referidor_id = v_user_id;

  SELECT COUNT(*) INTO v_pendientes
    FROM pedidos p
    JOIN perfiles pf ON pf.id = p.vendedor_id
   WHERE pf.referido_por = v_user_id
     AND p.estado IN ('pendiente','confirmado','despachado','en_ruta');

  RETURN json_build_object(
    'total_referidos', v_total_ref,
    'total_ganado',    v_total_ganado,
    'pedidos_pendientes', v_pendientes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.stats_referidos TO authenticated;

-- ============================================================
-- 12. RLS extra: permitir que el referidor vea (limitado) a sus referidos
--    Solo nombre, email, creado_en y país — vía vista
-- ============================================================

CREATE OR REPLACE VIEW public.mis_referidos AS
SELECT
  p.id,
  p.nombre,
  p.email,
  p.pais,
  p.creado_en,
  COALESCE(stats.entregados, 0) AS pedidos_entregados,
  COALESCE(stats.pendientes, 0) AS pedidos_pendientes,
  COALESCE(c.total, 0)          AS comisiones_generadas
FROM perfiles p
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE estado = 'entregado')                                                AS entregados,
    COUNT(*) FILTER (WHERE estado IN ('pendiente','confirmado','despachado','en_ruta'))         AS pendientes
  FROM pedidos WHERE vendedor_id = p.id
) stats ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(monto), 0) AS total
  FROM comisiones_referidos WHERE referido_id = p.id
) c ON true
WHERE p.referido_por = auth.uid();

GRANT SELECT ON public.mis_referidos TO authenticated;
