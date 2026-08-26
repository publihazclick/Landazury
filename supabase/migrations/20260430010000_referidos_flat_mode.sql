-- ============================================================
-- LANDAZURY — Referidos: agregar modo "monto fijo" (flat)
-- ============================================================
-- Hasta ahora la comisión solo era % sobre una base. Añadimos:
--   * referral_commission_mode  ('pct' | 'flat')
--   * referral_commission_flat  (monto fijo en COP por entrega)
-- Y reescribimos procesar_comision_referido para soportar ambos.
-- Setea por defecto: mode = 'flat', flat = 500 COP por entrega.
-- ============================================================

INSERT INTO config_plataforma (clave, valor) VALUES
  ('referral_commission_mode', '"flat"'::jsonb),
  ('referral_commission_flat', '500'::jsonb)
ON CONFLICT (clave) DO UPDATE SET
  valor = EXCLUDED.valor,
  actualizado_en = NOW();

-- Reemplazar la función para soportar ambos modos
CREATE OR REPLACE FUNCTION public.procesar_comision_referido(p_pedido_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pedido        RECORD;
  v_referidor_id  UUID;
  v_mode          TEXT;
  v_pct           NUMERIC;
  v_flat          NUMERIC;
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

  SELECT (valor #>> '{}') INTO v_mode
    FROM config_plataforma WHERE clave = 'referral_commission_mode';
  v_mode := COALESCE(v_mode, 'pct');

  IF v_mode = 'flat' THEN
    SELECT (valor #>> '{}')::numeric INTO v_flat
      FROM config_plataforma WHERE clave = 'referral_commission_flat';
    v_monto := COALESCE(v_flat, 0);
    v_base := v_monto;
    v_base_tipo := 'flat';
    v_pct := 0;
  ELSE
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
  END IF;

  IF v_monto IS NULL OR v_monto <= 0 THEN
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
    COALESCE(v_pct, 0), v_base, v_base_tipo
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
