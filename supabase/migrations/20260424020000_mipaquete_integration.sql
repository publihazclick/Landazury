-- ============================================================
-- LANDAZURY — Integración Mipaquete (flete real por transportadora)
-- ============================================================
-- Cambios:
--   1. productos gana peso_kg, alto_cm, ancho_cm, largo_cm (defaults)
--   2. pedidos gana campos Mipaquete (quote_id, delivery_company_id/name,
--      destino_dane_code, flete_mipaquete, flete_ganancia, sending_id)
--   3. config_plataforma gana origen_dane_code, ganancia_flete, sender_info
--   4. crear_pedido pasa a aceptar transportadora + flete cotizado
-- ============================================================

-- 1. Productos: peso y dimensiones para cotizar
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS peso_kg    INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS alto_cm    INT NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS ancho_cm   INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS largo_cm   INT NOT NULL DEFAULT 30;

-- 2. Pedidos: datos Mipaquete
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS destino_dane_code      TEXT,
  ADD COLUMN IF NOT EXISTS origen_dane_code       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_company_id    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_company_name  TEXT,
  ADD COLUMN IF NOT EXISTS mipaquete_quote_id     TEXT,
  ADD COLUMN IF NOT EXISTS mipaquete_sending_id   TEXT,
  ADD COLUMN IF NOT EXISTS flete_mipaquete        DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS flete_ganancia         DECIMAL(10,2);

-- 3. Config de plataforma: defaults para Mipaquete
INSERT INTO config_plataforma (clave, valor) VALUES
  ('origen_dane_code',        '"11001000"'::jsonb),        -- Bogotá por default
  ('origen_ciudad_nombre',    '"BOGOTÁ D.C."'::jsonb),
  ('ganancia_flete',          '3000'::jsonb),
  ('sender_name',             '"Landazury"'::jsonb),
  ('sender_surname',          '"Dropshipping"'::jsonb),
  ('sender_cellphone',        '"3134453649"'::jsonb),
  ('sender_email',            '"fabricadecalzadocolombia@gmail.com"'::jsonb),
  ('sender_pickup_address',   '""'::jsonb),
  ('sender_nit',              '""'::jsonb),
  ('sender_nit_type',         '"CC"'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- 4. Reemplazar crear_pedido para aceptar transportadora seleccionada + flete cotizado
DROP FUNCTION IF EXISTS public.crear_pedido(
  UUID, INT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL
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
    RAISE EXCEPTION 'Falta información de transportadora (cotización expirada o no seleccionada)';
  END IF;

  IF p_flete_mipaquete <= 0 THEN
    RAISE EXCEPTION 'Flete inválido';
  END IF;

  -- Precio del producto
  SELECT COALESCE(precio_final, precio_sugerido, precio_base)
  INTO v_precio
  FROM productos
  WHERE id = p_producto_id AND disponible = true;

  IF v_precio IS NULL THEN
    RAISE EXCEPTION 'Producto no disponible';
  END IF;

  -- Ganancia flete (margen fijo configurado por admin)
  SELECT (valor #>> '{}')::numeric INTO v_flete_ganancia
  FROM config_plataforma WHERE clave = 'ganancia_flete';
  v_flete_ganancia := COALESCE(v_flete_ganancia, 3000);

  SELECT (valor #>> '{}') INTO v_origen_dane
  FROM config_plataforma WHERE clave = 'origen_dane_code';

  -- Flete total que paga el vendedor = lo que cotizó Mipaquete + ganancia del admin
  v_flete_total := p_flete_mipaquete + v_flete_ganancia;

  v_subtotal := v_precio * p_cantidad;
  v_total := CASE
    WHEN p_tipo_pago = 'cod' THEN v_flete_total
    ELSE v_flete_total + v_subtotal
  END;

  SELECT saldo INTO v_saldo_actual
  FROM perfiles WHERE id = v_vendedor_id FOR UPDATE;

  IF v_saldo_actual IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF v_saldo_actual < v_total THEN
    RAISE EXCEPTION 'Saldo insuficiente: requiere %, disponible %', v_total, v_saldo_actual
      USING ERRCODE = 'P0001';
  END IF;

  v_saldo_nuevo := v_saldo_actual - v_total;

  UPDATE perfiles SET saldo = v_saldo_nuevo WHERE id = v_vendedor_id;

  INSERT INTO pedidos (
    vendedor_id, producto_id, cantidad, atributos_seleccionados, tipo_pago,
    cliente_nombre, cliente_cedula, cliente_telefono,
    cliente_direccion, cliente_ciudad, cliente_departamento, cliente_observaciones,
    precio_unitario, subtotal, flete, precio_venta_cliente, total_debitado,
    destino_dane_code, origen_dane_code, delivery_company_id, delivery_company_name,
    transportadora, mipaquete_quote_id, flete_mipaquete, flete_ganancia
  ) VALUES (
    v_vendedor_id, p_producto_id, p_cantidad, p_atributos, p_tipo_pago,
    p_cliente_nombre, p_cliente_cedula, p_cliente_telefono,
    p_cliente_direccion, p_cliente_ciudad, p_cliente_departamento, p_cliente_observaciones,
    v_precio, v_subtotal, v_flete_total, p_precio_venta_cliente, v_total,
    p_destino_dane_code, v_origen_dane, p_delivery_company_id, p_delivery_company_name,
    p_delivery_company_name, p_mipaquete_quote_id, p_flete_mipaquete, v_flete_ganancia
  )
  RETURNING id, numero INTO v_pedido_id, v_pedido_numero;

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

  RETURN json_build_object(
    'pedido_id',       v_pedido_id,
    'numero',          v_pedido_numero,
    'total_debitado',  v_total,
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

-- 5. RPC para guardar el resultado de crear-envío de Mipaquete en el pedido
CREATE OR REPLACE FUNCTION public.registrar_guia_mipaquete(
  p_pedido_id          UUID,
  p_sending_id         TEXT,
  p_guia               TEXT,
  p_transportadora     TEXT
)
RETURNS JSON AS $$
DECLARE
  v_rol TEXT;
BEGIN
  v_rol := public.obtener_rol();
  IF v_rol NOT IN ('admin','inventario') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE pedidos SET
    mipaquete_sending_id = p_sending_id,
    guia                 = p_guia,
    transportadora       = COALESCE(p_transportadora, transportadora),
    estado = CASE
      WHEN estado IN ('pendiente','confirmado') THEN 'despachado'
      ELSE estado
    END
  WHERE id = p_pedido_id;

  RETURN json_build_object('status','ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.registrar_guia_mipaquete TO authenticated;
