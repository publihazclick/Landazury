-- ============================================================
-- LANDAZURY — Usuarios de prueba (bypass wallet)
-- ============================================================
-- Permite marcar perfiles como "test_user" para que puedan generar
-- pedidos sin validación de saldo ni débito al wallet. Útil mientras
-- la plataforma está en pruebas con dropshippers invitados.
-- ============================================================

-- 1. Nueva columna en perfiles
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS test_user BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Marcar pedidos como prueba (trazabilidad)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS es_prueba BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pedidos_es_prueba
  ON pedidos(es_prueba) WHERE es_prueba = TRUE;

-- 3. Actualizar crear_pedido:
--    * test_user=TRUE → se salta validación de saldo + no debita + no genera movimiento
--    * test_user=FALSE → comportamiento normal
DROP FUNCTION IF EXISTS public.crear_pedido(
  UUID, INT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL
);

CREATE OR REPLACE FUNCTION public.crear_pedido(
  p_producto_id            UUID,
  p_cantidad               INT,
  p_atributos              JSONB,
  p_tipo_pago              TEXT,
  p_cliente_nombre         TEXT,
  p_cliente_cedula         TEXT,
  p_cliente_telefono       TEXT,
  p_cliente_direccion      TEXT,
  p_cliente_ciudad         TEXT,
  p_cliente_departamento   TEXT,
  p_cliente_observaciones  TEXT,
  p_destino_dane_code      TEXT,
  p_delivery_company_id    TEXT,
  p_delivery_company_name  TEXT,
  p_mipaquete_quote_id     TEXT,
  p_flete_mipaquete        DECIMAL,
  p_precio_venta_cliente   DECIMAL DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_vendedor_id    UUID;
  v_es_prueba      BOOLEAN;
  v_precio         DECIMAL(10,2);
  v_flete_ganancia DECIMAL(10,2);
  v_flete_total    DECIMAL(10,2);
  v_subtotal       DECIMAL(12,2);
  v_total          DECIMAL(12,2);
  v_saldo_actual   DECIMAL(12,2);
  v_saldo_nuevo    DECIMAL(12,2);
  v_pedido_id      UUID;
  v_pedido_numero  BIGINT;
  v_origen_dane    TEXT;
BEGIN
  v_vendedor_id := auth.uid();
  IF v_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_tipo_pago NOT IN ('cod','anticipado') THEN
    RAISE EXCEPTION 'Tipo de pago inválido';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad < 1 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  IF p_delivery_company_id IS NULL OR p_mipaquete_quote_id IS NULL OR p_flete_mipaquete IS NULL THEN
    RAISE EXCEPTION 'Falta información de transportadora';
  END IF;

  IF p_flete_mipaquete <= 0 THEN
    RAISE EXCEPTION 'Flete inválido';
  END IF;

  SELECT COALESCE(precio_final, precio_sugerido, precio_base)
  INTO v_precio
  FROM productos
  WHERE id = p_producto_id AND disponible = true;

  IF v_precio IS NULL THEN
    RAISE EXCEPTION 'Producto no disponible';
  END IF;

  SELECT (valor #>> '{}')::numeric INTO v_flete_ganancia
  FROM config_plataforma WHERE clave = 'ganancia_flete';
  v_flete_ganancia := COALESCE(v_flete_ganancia, 3000);

  SELECT (valor #>> '{}') INTO v_origen_dane
  FROM config_plataforma WHERE clave = 'origen_dane_code';

  v_flete_total := p_flete_mipaquete + v_flete_ganancia;
  v_subtotal := v_precio * p_cantidad;
  v_total := CASE
    WHEN p_tipo_pago = 'cod' THEN v_flete_total
    ELSE v_flete_total + v_subtotal
  END;

  -- Lock del perfil + chequeo de test_user
  SELECT saldo, test_user
  INTO v_saldo_actual, v_es_prueba
  FROM perfiles WHERE id = v_vendedor_id FOR UPDATE;

  IF v_saldo_actual IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF v_es_prueba THEN
    -- Usuario de prueba: no se valida saldo, no se debita
    v_saldo_nuevo := v_saldo_actual;
  ELSE
    IF v_saldo_actual < v_total THEN
      RAISE EXCEPTION 'Saldo insuficiente: requiere %, disponible %', v_total, v_saldo_actual
        USING ERRCODE = 'P0001';
    END IF;
    v_saldo_nuevo := v_saldo_actual - v_total;
    UPDATE perfiles SET saldo = v_saldo_nuevo WHERE id = v_vendedor_id;
  END IF;

  INSERT INTO pedidos (
    vendedor_id, producto_id, cantidad, atributos_seleccionados, tipo_pago,
    cliente_nombre, cliente_cedula, cliente_telefono,
    cliente_direccion, cliente_ciudad, cliente_departamento, cliente_observaciones,
    precio_unitario, subtotal, flete, precio_venta_cliente, total_debitado,
    destino_dane_code, origen_dane_code, delivery_company_id, delivery_company_name,
    transportadora, mipaquete_quote_id, flete_mipaquete, flete_ganancia,
    es_prueba
  ) VALUES (
    v_vendedor_id, p_producto_id, p_cantidad, p_atributos, p_tipo_pago,
    p_cliente_nombre, p_cliente_cedula, p_cliente_telefono,
    p_cliente_direccion, p_cliente_ciudad, p_cliente_departamento, p_cliente_observaciones,
    v_precio, v_subtotal, v_flete_total, p_precio_venta_cliente,
    CASE WHEN v_es_prueba THEN 0 ELSE v_total END,
    p_destino_dane_code, v_origen_dane, p_delivery_company_id, p_delivery_company_name,
    p_delivery_company_name, p_mipaquete_quote_id, p_flete_mipaquete, v_flete_ganancia,
    v_es_prueba
  )
  RETURNING id, numero INTO v_pedido_id, v_pedido_numero;

  -- Solo crear movimiento de wallet si NO es usuario de prueba
  IF NOT v_es_prueba THEN
    INSERT INTO movimientos_wallet (
      perfil_id, tipo, monto, saldo_despues, referencia, descripcion
    ) VALUES (
      v_vendedor_id,
      CASE WHEN p_tipo_pago = 'cod' THEN 'debito_flete' ELSE 'debito_anticipado' END,
      -v_total,
      v_saldo_nuevo,
      v_pedido_id::text,
      'Pedido #' || v_pedido_numero || ' (' || p_tipo_pago || ') vía ' || p_delivery_company_name
    );
  END IF;

  RETURN json_build_object(
    'pedido_id',       v_pedido_id,
    'numero',          v_pedido_numero,
    'es_prueba',       v_es_prueba,
    'total_debitado',  CASE WHEN v_es_prueba THEN 0 ELSE v_total END,
    'saldo_nuevo',     v_saldo_nuevo,
    'flete',           v_flete_total,
    'flete_mipaquete', p_flete_mipaquete,
    'flete_ganancia',  v_flete_ganancia,
    'subtotal',        v_subtotal,
    'transportadora',  p_delivery_company_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.crear_pedido(
  UUID, INT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL
) TO authenticated;

-- 4. RPC admin para toggle test_user (evita que el admin tenga que tocar DB)
CREATE OR REPLACE FUNCTION public.toggle_test_user(
  p_perfil_id UUID,
  p_valor     BOOLEAN
)
RETURNS JSON AS $$
BEGIN
  IF public.obtener_rol() <> 'admin' THEN
    RAISE EXCEPTION 'Solo admin';
  END IF;
  UPDATE perfiles SET test_user = p_valor WHERE id = p_perfil_id;
  RETURN json_build_object('status','ok','test_user', p_valor);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.toggle_test_user TO authenticated;
