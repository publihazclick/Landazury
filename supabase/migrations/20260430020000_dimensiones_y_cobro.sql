-- ============================================================
-- LANDAZURY — Dimensiones por producto + lógica de cobro Mipaquete
-- ============================================================
-- Cambios:
--   1. peso_kg pasa de INT a DECIMAL(10,3) para soportar pesos en gramos
--      (ej. 0.200 kg para billeteras, 0.800 kg para calzado).
--   2. Backfill por categoría:
--        - calzado:    18×21×29 cm, 0.800 kg
--        - billeteras:  5×15×18 cm, 0.200 kg
--        - otras:      18×29×30 cm, 1.000 kg
--   3. pedidos guarda precio_costo_unitario para usarlo como declaredValue
--      al generar la guía Mipaquete (snapshot del costo en el momento del pedido).
--   4. crear_pedido se actualiza para guardar el costo unitario.
-- ============================================================

-- 1. Tipo decimal para peso (soporta gramos)
ALTER TABLE productos
  ALTER COLUMN peso_kg TYPE DECIMAL(10,3) USING peso_kg::DECIMAL(10,3);

-- 2. Backfill por categoría (sólo a productos que tienen dimensiones default)
UPDATE productos p
   SET alto_cm = 18, ancho_cm = 21, largo_cm = 29, peso_kg = 0.800
  FROM categorias c
 WHERE p.categoria_id = c.id
   AND c.slug = 'calzado';

UPDATE productos p
   SET alto_cm = 5, ancho_cm = 15, largo_cm = 18, peso_kg = 0.200
  FROM categorias c
 WHERE p.categoria_id = c.id
   AND c.slug = 'billeteras';

UPDATE productos p
   SET alto_cm = 18, ancho_cm = 29, largo_cm = 30, peso_kg = 1.000
  FROM categorias c
 WHERE p.categoria_id = c.id
   AND c.slug NOT IN ('calzado','billeteras')
    OR p.categoria_id IS NULL;

-- 3. Snapshot del costo en pedidos (para declaredValue al generar guía)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS precio_costo_unitario DECIMAL(10,2);

-- Backfill: pedidos viejos heredan el costo actual del producto
UPDATE pedidos p
   SET precio_costo_unitario = pr.precio_base
  FROM productos pr
 WHERE p.producto_id = pr.id
   AND p.precio_costo_unitario IS NULL;

-- 4. crear_pedido: guardar precio_costo_unitario como snapshot
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
  v_vendedor_id     UUID;
  v_precio          DECIMAL(10,2);
  v_precio_costo    DECIMAL(10,2);
  v_flete_ganancia  DECIMAL(10,2);
  v_flete_total     DECIMAL(10,2);
  v_subtotal        DECIMAL(12,2);
  v_total           DECIMAL(12,2);
  v_saldo_actual    DECIMAL(12,2);
  v_saldo_nuevo     DECIMAL(12,2);
  v_pedido_id       UUID;
  v_pedido_numero   BIGINT;
  v_origen_dane     TEXT;
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

  -- Precio del producto (precio_final que ve el vendedor) y costo (precio_base, snapshot)
  SELECT COALESCE(precio_final, precio_sugerido, precio_base), precio_base
    INTO v_precio, v_precio_costo
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
    precio_unitario, precio_costo_unitario, subtotal, flete, precio_venta_cliente, total_debitado,
    destino_dane_code, origen_dane_code, delivery_company_id, delivery_company_name,
    transportadora, mipaquete_quote_id, flete_mipaquete, flete_ganancia
  ) VALUES (
    v_vendedor_id, p_producto_id, p_cantidad, p_atributos, p_tipo_pago,
    p_cliente_nombre, p_cliente_cedula, p_cliente_telefono,
    p_cliente_direccion, p_cliente_ciudad, p_cliente_departamento, p_cliente_observaciones,
    v_precio, v_precio_costo, v_subtotal, v_flete_total, p_precio_venta_cliente, v_total,
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
