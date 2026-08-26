-- ============================================================
-- LANDAZURY — Caché de cotizaciones + validación de flete en RPC
-- ============================================================
-- Problema que resuelve:
--   El RPC crear_pedido recibía p_flete_mipaquete del cliente (frontend),
--   lo que permitía que un usuario técnico manipule ese valor y pague
--   menos flete del real. Este cambio hace que el RPC lea el flete
--   desde la DB (guardado por la edge function al cotizar), eliminando
--   cualquier posibilidad de manipulación.
--
-- Flujo nuevo:
--   1. cotizar-flete-mipaquete → guarda cada cotización en cotizaciones_cache
--   2. Usuario elige transportadora y crea pedido
--   3. crear_pedido → busca el quote en cotizaciones_cache (server-authoritative)
--        Si lo encuentra: usa flete_mipaquete y flete_cliente del servidor
--        Si no (cotización expiró): falla con mensaje claro al usuario
--   4. Cache entry se marca como usado (no reutilizable)
-- ============================================================

-- ── 1. Tabla de caché ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cotizaciones_cache (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id         UUID NOT NULL,
  quote_id            TEXT NOT NULL,            -- c.id devuelto por Mipaquete (por carrier)
  delivery_company_id TEXT NOT NULL,
  flete_mipaquete     DECIMAL(10,2) NOT NULL,   -- costo real cotizado por Mipaquete
  flete_cliente       DECIMAL(10,2) NOT NULL,   -- flete_mipaquete + ganancia plataforma
  ganancia            DECIMAL(10,2) NOT NULL,   -- snapshot de ganancia_flete en el momento
  expira_en           TIMESTAMPTZ NOT NULL,
  usado               BOOLEAN NOT NULL DEFAULT false,
  creado_en           TIMESTAMPTZ DEFAULT NOW(),

  -- Un quote_id de Mipaquete es único por sesión de cotización.
  -- Incluimos vendedor_id por si Mipaquete repite IDs entre sesiones distintas.
  CONSTRAINT uq_cotizacion_cache UNIQUE (vendedor_id, quote_id, delivery_company_id)
);

-- Índice para la búsqueda del RPC (crítico para performance)
-- No usamos predicado parcial con NOW() porque Postgres exige funciones IMMUTABLE en índices.
-- El filtro expira_en > NOW() y usado = false lo aplica el RPC en runtime.
CREATE INDEX IF NOT EXISTS idx_cache_lookup
  ON cotizaciones_cache (vendedor_id, quote_id, delivery_company_id)
  WHERE NOT usado;

-- Índice para limpieza periódica de entradas expiradas
CREATE INDEX IF NOT EXISTS idx_cache_expiry
  ON cotizaciones_cache (expira_en);

-- RLS: ningún usuario puede leer/escribir directamente.
-- Solo se accede via SECURITY DEFINER (RPC) o service_role (edge functions).
ALTER TABLE cotizaciones_cache ENABLE ROW LEVEL SECURITY;

-- ── 2. RPC crear_pedido — usa valores del servidor, no del cliente ────────────

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
  p_flete_mipaquete        DECIMAL,   -- hint del cliente; se valida/reemplaza con el cache
  p_precio_venta_cliente   DECIMAL DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_vendedor_id     UUID;
  v_precio          DECIMAL(10,2);
  v_precio_costo    DECIMAL(10,2);
  v_flete_ganancia  DECIMAL(10,2);
  v_flete_mipaquete DECIMAL(10,2);   -- valor autorizado (del cache o validado)
  v_flete_total     DECIMAL(10,2);   -- = v_flete_mipaquete + v_flete_ganancia
  v_subtotal        DECIMAL(12,2);
  v_total           DECIMAL(12,2);
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

  -- ── Buscar cotización en cache (server-authoritative) ────────────────────
  -- FOR UPDATE bloquea la fila para evitar que dos pedidos simultáneos
  -- consuman el mismo quote_id.
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
    -- ✅ Valores del servidor — el cliente NO puede manipularlos
    v_flete_mipaquete := v_cache_flete_mp;
    v_flete_total     := v_cache_flete_cl;   -- ya incluye ganancia exacta del momento de cotizar

    -- Marcar como usado: un quote solo sirve para un pedido
    UPDATE cotizaciones_cache SET usado = true WHERE id = v_cache_id;

  ELSE
    -- ⚠️ Cotización no encontrada en cache: expiró o vino de un flujo legacy.
    -- Fallback con validación estricta de mínimo para no aceptar valores
    -- irrazonables. Exigimos mínimo 3000 COP (valor menor no existe en Colombia).
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
  v_subtotal := v_precio * p_cantidad;
  v_total := CASE
    WHEN p_tipo_pago = 'cod' THEN v_flete_total
    ELSE v_flete_total + v_subtotal
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
    transportadora, mipaquete_quote_id, flete_mipaquete, flete_ganancia
  ) VALUES (
    v_vendedor_id, p_producto_id, p_cantidad, p_atributos, p_tipo_pago,
    p_cliente_nombre, p_cliente_cedula, p_cliente_telefono,
    p_cliente_direccion, p_cliente_ciudad, p_cliente_departamento, p_cliente_observaciones,
    v_precio, v_precio_costo, v_subtotal, v_flete_total, p_precio_venta_cliente, v_total,
    p_destino_dane_code, v_origen_dane, p_delivery_company_id, p_delivery_company_name,
    p_delivery_company_name, p_mipaquete_quote_id, v_flete_mipaquete, v_flete_ganancia
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
    'Pedido #' || v_pedido_numero || ' (' || p_tipo_pago || ') vía ' || p_delivery_company_name
  );

  RETURN json_build_object(
    'pedido_id',       v_pedido_id,
    'numero',          v_pedido_numero,
    'total_debitado',  v_total,
    'saldo_nuevo',     v_saldo_nuevo,
    'flete',           v_flete_total,
    'flete_mipaquete', v_flete_mipaquete,
    'flete_ganancia',  v_flete_ganancia,
    'subtotal',        v_subtotal,
    'transportadora',  p_delivery_company_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.crear_pedido(
  UUID, INT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL
) TO authenticated;

-- ── 3. Limpieza automática de entradas expiradas (opcional, via pg_cron) ────
-- Si tienes pg_cron activado, descomenta esta línea:
-- SELECT cron.schedule('limpiar-cotizaciones-cache', '0 */6 * * *',
--   'DELETE FROM cotizaciones_cache WHERE expira_en < NOW() - INTERVAL ''1 hour''');
