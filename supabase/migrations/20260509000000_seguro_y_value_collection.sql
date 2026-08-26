-- ═══════════════════════════════════════════════════════════════════
-- LANDAZURY — Seguro antidevoluciones en crear_pedido
--
-- Problema: el RPC crear_pedido no aceptaba p_seguro_antidevoluciones,
-- por lo que los 5.000 COP del seguro nunca se debitaban del wallet
-- ni se guardaban en la tabla pedidos. Esta migración corrige eso.
--
-- Cambios:
--   1. Recrear crear_pedido con el parámetro p_seguro_antidevoluciones
--   2. Debitar 5.000 COP adicionales cuando el seguro está activo
--   3. Guardar seguro_antidevoluciones = true y costo_seguro = 5000
-- ═══════════════════════════════════════════════════════════════════

-- Eliminar versión anterior (firma sin seguro)
DROP FUNCTION IF EXISTS public.crear_pedido(
  UUID, INT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL
);

CREATE OR REPLACE FUNCTION public.crear_pedido(
  p_producto_id               UUID,
  p_cantidad                  INT,
  p_atributos                 JSONB,
  p_tipo_pago                 TEXT,
  p_cliente_nombre            TEXT,
  p_cliente_cedula            TEXT,
  p_cliente_telefono          TEXT,
  p_cliente_direccion         TEXT,
  p_cliente_ciudad            TEXT,
  p_cliente_departamento      TEXT,
  p_cliente_observaciones     TEXT,
  p_destino_dane_code         TEXT,
  p_delivery_company_id       TEXT,
  p_delivery_company_name     TEXT,
  p_mipaquete_quote_id        TEXT,
  p_flete_mipaquete           DECIMAL,   -- hint del cliente; se valida/reemplaza con el cache
  p_precio_venta_cliente      DECIMAL    DEFAULT NULL,
  p_seguro_antidevoluciones   BOOLEAN    DEFAULT false
)
RETURNS JSON AS $$
DECLARE
  v_vendedor_id     UUID;
  v_precio          DECIMAL(10,2);
  v_precio_costo    DECIMAL(10,2);
  v_flete_ganancia  DECIMAL(10,2);
  v_flete_mipaquete DECIMAL(10,2);
  v_flete_total     DECIMAL(10,2);   -- flete_mipaquete + ganancia
  v_costo_seguro    DECIMAL(10,2);   -- 5000 si seguro activo, 0 si no
  v_subtotal        DECIMAL(12,2);
  v_total           DECIMAL(12,2);   -- total a debitar del wallet
  v_saldo_actual    DECIMAL(12,2);
  v_saldo_nuevo     DECIMAL(12,2);
  v_pedido_id       UUID;
  v_pedido_numero   BIGINT;
  v_origen_dane     TEXT;
  v_cache_id        UUID;
  v_cache_flete_mp  DECIMAL(10,2);
  v_cache_flete_cl  DECIMAL(10,2);
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

  IF p_delivery_company_id IS NULL OR p_mipaquete_quote_id IS NULL THEN
    RAISE EXCEPTION 'Falta información de transportadora';
  END IF;

  -- ── Ganancia de la plataforma (configurable) ─────────────────────────────
  SELECT (valor #>> '{}')::numeric INTO v_flete_ganancia
    FROM config_plataforma WHERE clave = 'ganancia_flete';
  v_flete_ganancia := COALESCE(v_flete_ganancia, 3000);

  SELECT (valor #>> '{}') INTO v_origen_dane
    FROM config_plataforma WHERE clave = 'origen_dane_code';

  -- ── Costo del seguro antidevoluciones ────────────────────────────────────
  -- 5.000 COP fijos si el vendedor lo activó, 0 si no.
  -- Este valor NO va a Mipaquete; es un cargo interno de la plataforma
  -- que cubre el flete de regreso en caso de devolución.
  v_costo_seguro := CASE WHEN p_seguro_antidevoluciones THEN 5000 ELSE 0 END;

  -- ── Buscar cotización en cache (server-authoritative) ────────────────────
  SELECT id, flete_mipaquete, flete_cliente
    INTO v_cache_id, v_cache_flete_mp, v_cache_flete_cl
    FROM cotizaciones_cache
   WHERE vendedor_id         = v_vendedor_id
     AND quote_id            = p_mipaquete_quote_id
     AND delivery_company_id = p_delivery_company_id
     AND expira_en           > NOW()
     AND usado               = false
   LIMIT 1
   FOR UPDATE;

  IF v_cache_id IS NOT NULL THEN
    v_flete_mipaquete := v_cache_flete_mp;
    v_flete_total     := v_cache_flete_cl;  -- ya incluye ganancia
    UPDATE cotizaciones_cache SET usado = true WHERE id = v_cache_id;
  ELSE
    IF p_flete_mipaquete IS NULL OR p_flete_mipaquete < 3000 THEN
      RAISE EXCEPTION 'La cotización expiró. Selecciona una transportadora nuevamente.'
        USING ERRCODE = 'P0002';
    END IF;
    v_flete_mipaquete := p_flete_mipaquete;
    v_flete_total     := p_flete_mipaquete + v_flete_ganancia;
  END IF;

  -- ── Precio del producto (siempre desde la DB, nunca del cliente) ──────────
  SELECT COALESCE(precio_final, precio_sugerido, precio_base), precio_base
    INTO v_precio, v_precio_costo
    FROM productos
   WHERE id = p_producto_id AND disponible = true;

  IF v_precio IS NULL THEN
    RAISE EXCEPTION 'Producto no disponible';
  END IF;

  -- ── Total a debitar del wallet ────────────────────────────────────────────
  -- COD:        el cliente paga el producto → plataforma solo adelanta el flete + seguro
  -- Anticipado: el vendedor ya cobró → debe cubrir flete + producto + seguro
  v_subtotal := v_precio * p_cantidad;
  v_total := CASE
    WHEN p_tipo_pago = 'cod' THEN v_flete_total + v_costo_seguro
    ELSE v_flete_total + v_subtotal + v_costo_seguro
  END;

  -- ── Validar y descontar saldo (FOR UPDATE previene condición de carrera) ──
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

  -- ── Crear pedido ──────────────────────────────────────────────────────────
  INSERT INTO pedidos (
    vendedor_id, producto_id, cantidad, atributos_seleccionados, tipo_pago,
    cliente_nombre, cliente_cedula, cliente_telefono,
    cliente_direccion, cliente_ciudad, cliente_departamento, cliente_observaciones,
    precio_unitario, precio_costo_unitario, subtotal, flete, precio_venta_cliente, total_debitado,
    destino_dane_code, origen_dane_code, delivery_company_id, delivery_company_name,
    transportadora, mipaquete_quote_id, flete_mipaquete, flete_ganancia,
    seguro_antidevoluciones, costo_seguro
  ) VALUES (
    v_vendedor_id, p_producto_id, p_cantidad, p_atributos, p_tipo_pago,
    p_cliente_nombre, p_cliente_cedula, p_cliente_telefono,
    p_cliente_direccion, p_cliente_ciudad, p_cliente_departamento, p_cliente_observaciones,
    v_precio, v_precio_costo, v_subtotal, v_flete_total, p_precio_venta_cliente, v_total,
    p_destino_dane_code, v_origen_dane, p_delivery_company_id, p_delivery_company_name,
    p_delivery_company_name, p_mipaquete_quote_id, v_flete_mipaquete, v_flete_ganancia,
    p_seguro_antidevoluciones, v_costo_seguro
  )
  RETURNING id, numero INTO v_pedido_id, v_pedido_numero;

  -- ── Registrar movimiento en wallet ────────────────────────────────────────
  INSERT INTO movimientos_wallet (
    perfil_id, tipo, monto, saldo_despues, referencia, descripcion
  ) VALUES (
    v_vendedor_id,
    CASE WHEN p_tipo_pago = 'cod' THEN 'debito_flete' ELSE 'debito_anticipado' END,
    -v_total,
    v_saldo_nuevo,
    v_pedido_id::text,
    'Pedido #' || v_pedido_numero || ' (' || p_tipo_pago || ')' ||
    CASE WHEN p_seguro_antidevoluciones THEN ' + seguro antidevoluciones' ELSE '' END ||
    ' vía ' || p_delivery_company_name
  );

  RETURN json_build_object(
    'pedido_id',                v_pedido_id,
    'numero',                   v_pedido_numero,
    'total_debitado',           v_total,
    'saldo_nuevo',              v_saldo_nuevo,
    'flete',                    v_flete_total,
    'flete_mipaquete',          v_flete_mipaquete,
    'flete_ganancia',           v_flete_ganancia,
    'subtotal',                 v_subtotal,
    'costo_seguro',             v_costo_seguro,
    'seguro_antidevoluciones',  p_seguro_antidevoluciones,
    'transportadora',           p_delivery_company_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.crear_pedido(
  UUID, INT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL, BOOLEAN
) TO authenticated;
