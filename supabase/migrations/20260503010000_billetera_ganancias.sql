-- ═══════════════════════════════════════════════════════════════════
-- Billetera de Ganancias — acreditación automática en entregas
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ───────────────────────────────────────────────────────────────────

-- Saldo de ganancias por vendedor (1 fila por usuario)
CREATE TABLE IF NOT EXISTS billetera_ganancias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id    uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  saldo          DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id)
);

-- Historial de movimientos de ganancias
CREATE TABLE IF NOT EXISTS movimientos_ganancias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  pedido_id   uuid REFERENCES pedidos(id) ON DELETE SET NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('acreditacion','retiro','ajuste')),
  monto       DECIMAL(12,2) NOT NULL,
  descripcion TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_ganancias_vendedor
  ON movimientos_ganancias (vendedor_id, creado_en DESC);

-- Métodos de pago para retiro (Nequi, Daviplata, banco)
CREATE TABLE IF NOT EXISTS metodos_pago_vendedor (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id  uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN ('nequi','daviplata','bancolombia','otro_banco')),
  titular      TEXT NOT NULL,
  numero       TEXT NOT NULL,
  banco        TEXT,
  tipo_cuenta  TEXT,
  activo       BOOLEAN NOT NULL DEFAULT true,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solicitudes de retiro
CREATE TABLE IF NOT EXISTS retiros_ganancias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id     uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  monto           DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago_id  uuid NOT NULL REFERENCES metodos_pago_vendedor(id),
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','procesado','rechazado')),
  notas_admin     TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  procesado_en    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_retiros_estado
  ON retiros_ganancias (estado, creado_en DESC);

-- ───────────────────────────────────────────────────────────────────
-- 2. RLS
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE billetera_ganancias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_ganancias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE metodos_pago_vendedor    ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_ganancias        ENABLE ROW LEVEL SECURITY;

-- billetera_ganancias
CREATE POLICY bg_select ON billetera_ganancias FOR SELECT
  USING (vendedor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin'));

-- movimientos_ganancias
CREATE POLICY mg_select ON movimientos_ganancias FOR SELECT
  USING (vendedor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin'));

-- metodos_pago_vendedor
CREATE POLICY mpv_select ON metodos_pago_vendedor FOR SELECT
  USING (vendedor_id = auth.uid());
CREATE POLICY mpv_insert ON metodos_pago_vendedor FOR INSERT
  WITH CHECK (vendedor_id = auth.uid());
CREATE POLICY mpv_update ON metodos_pago_vendedor FOR UPDATE
  USING (vendedor_id = auth.uid());
CREATE POLICY mpv_delete ON metodos_pago_vendedor FOR DELETE
  USING (vendedor_id = auth.uid());

-- retiros_ganancias
CREATE POLICY rg_select ON retiros_ganancias FOR SELECT
  USING (vendedor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin'));

-- ───────────────────────────────────────────────────────────────────
-- 3. RPC: acreditar ganancias cuando se entrega un pedido
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.acreditar_ganancias_pedido(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v      RECORD;
  v_neto DECIMAL;
  v_prod DECIMAL;
  v_tot  DECIMAL;
BEGIN
  SELECT id, vendedor_id, estado, numero,
         COALESCE(flete_mipaquete, 0)      AS flete_neto,
         COALESCE(subtotal, 0)             AS subtotal,
         precio_venta_cliente
    INTO v
  FROM pedidos
  WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Sólo acreditar en entregas exitosas (idempotente)
  IF v.estado != 'entregado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no entregado');
  END IF;

  IF EXISTS (
    SELECT 1 FROM movimientos_ganancias
    WHERE pedido_id = p_pedido_id AND tipo = 'acreditacion'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'ya_acreditado', true);
  END IF;

  -- Flete neto Mipaquete (lo que cobró Mipaquete sin nuestro markup de $3.000)
  v_neto := v.flete_neto;

  -- Excedente producto: precio de venta - costo dropshipper
  v_prod := CASE
    WHEN v.precio_venta_cliente IS NOT NULL
      THEN GREATEST(0, v.precio_venta_cliente - v.subtotal)
    ELSE 0
  END;

  v_tot := v_neto + v_prod;

  IF v_tot <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin ganancias calculables');
  END IF;

  -- Crear billetera si no existe
  INSERT INTO billetera_ganancias (vendedor_id, saldo)
    VALUES (v.vendedor_id, 0)
    ON CONFLICT (vendedor_id) DO NOTHING;

  -- Acreditar saldo
  UPDATE billetera_ganancias
    SET saldo = saldo + v_tot, actualizado_en = now()
    WHERE vendedor_id = v.vendedor_id;

  -- Registrar movimiento
  INSERT INTO movimientos_ganancias (vendedor_id, pedido_id, tipo, monto, descripcion)
    VALUES (
      v.vendedor_id, p_pedido_id, 'acreditacion', v_tot,
      format('Pedido #%s entregado • Flete neto $%s + Ganancia producto $%s',
             v.numero, v_neto::bigint, v_prod::bigint)
    );

  RETURN jsonb_build_object(
    'ok', true,
    'total', v_tot,
    'flete_neto', v_neto,
    'ganancia_producto', v_prod
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 4. Trigger automático al marcar entregado
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_acreditar_ganancias()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.estado = 'entregado' AND (OLD.estado IS DISTINCT FROM 'entregado') THEN
    PERFORM public.acreditar_ganancias_pedido(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_entregado ON pedidos;
CREATE TRIGGER trg_pedido_entregado
  AFTER UPDATE ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_acreditar_ganancias();

-- ───────────────────────────────────────────────────────────────────
-- 5. RPC: solicitar retiro
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.solicitar_retiro_ganancias(
  p_monto         DECIMAL,
  p_metodo_pago_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_saldo  DECIMAL;
  v_metodo RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF p_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El monto debe ser mayor a cero');
  END IF;

  -- Validar método de pago
  SELECT * INTO v_metodo
  FROM metodos_pago_vendedor
  WHERE id = p_metodo_pago_id AND vendedor_id = v_uid AND activo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Método de pago no encontrado');
  END IF;

  -- Verificar saldo
  SELECT saldo INTO v_saldo
  FROM billetera_ganancias
  WHERE vendedor_id = v_uid
  FOR UPDATE;

  IF v_saldo IS NULL OR v_saldo < p_monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  -- Descontar saldo
  UPDATE billetera_ganancias
    SET saldo = saldo - p_monto, actualizado_en = now()
    WHERE vendedor_id = v_uid;

  -- Registrar movimiento de retiro
  INSERT INTO movimientos_ganancias (vendedor_id, tipo, monto, descripcion)
    VALUES (v_uid, 'retiro', -p_monto,
            format('Retiro solicitado → %s %s', v_metodo.tipo, v_metodo.numero));

  -- Crear solicitud
  INSERT INTO retiros_ganancias (vendedor_id, monto, metodo_pago_id)
    VALUES (v_uid, p_monto, p_metodo_pago_id);

  RETURN jsonb_build_object('ok', true, 'monto', p_monto);
END;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 6. RPC admin: procesar / rechazar retiro
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.procesar_retiro_ganancia(
  p_retiro_id uuid,
  p_notas     text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_retiro RECORD;
BEGIN
  IF (SELECT rol FROM perfiles WHERE id = auth.uid()) != 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT * INTO v_retiro FROM retiros_ganancias WHERE id = p_retiro_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Retiro no encontrado'); END IF;
  IF v_retiro.estado != 'pendiente' THEN RETURN jsonb_build_object('ok', false, 'error', 'Ya procesado'); END IF;

  UPDATE retiros_ganancias
    SET estado = 'procesado', notas_admin = p_notas, procesado_en = now()
    WHERE id = p_retiro_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rechazar_retiro_ganancia(
  p_retiro_id uuid,
  p_notas     text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_retiro RECORD;
BEGIN
  IF (SELECT rol FROM perfiles WHERE id = auth.uid()) != 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT * INTO v_retiro FROM retiros_ganancias WHERE id = p_retiro_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Retiro no encontrado'); END IF;
  IF v_retiro.estado != 'pendiente' THEN RETURN jsonb_build_object('ok', false, 'error', 'Ya procesado'); END IF;

  -- Devolver el saldo al vendedor
  UPDATE billetera_ganancias
    SET saldo = saldo + v_retiro.monto, actualizado_en = now()
    WHERE vendedor_id = v_retiro.vendedor_id;

  INSERT INTO movimientos_ganancias (vendedor_id, tipo, monto, descripcion)
    VALUES (v_retiro.vendedor_id, 'ajuste', v_retiro.monto,
            format('Retiro rechazado — reembolso de $%s', v_retiro.monto::bigint));

  UPDATE retiros_ganancias
    SET estado = 'rechazado', notas_admin = p_notas, procesado_en = now()
    WHERE id = p_retiro_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 7. Vista admin: retiros pendientes con datos del vendedor
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vista_retiros_admin AS
  SELECT
    r.id,
    r.monto,
    r.estado,
    r.notas_admin,
    r.creado_en,
    r.procesado_en,
    p.nombre  AS vendedor_nombre,
    p.email   AS vendedor_email,
    p.telefono AS vendedor_telefono,
    mp.tipo   AS metodo_tipo,
    mp.titular,
    mp.numero,
    mp.banco,
    mp.tipo_cuenta,
    r.vendedor_id,
    r.metodo_pago_id
  FROM retiros_ganancias r
  JOIN perfiles p ON p.id = r.vendedor_id
  JOIN metodos_pago_vendedor mp ON mp.id = r.metodo_pago_id
  ORDER BY r.creado_en DESC;
