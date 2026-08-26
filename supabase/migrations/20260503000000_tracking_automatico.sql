-- ═══════════════════════════════════════════════════════════════════
-- Tracking automático de guías + Seguro antidevoluciones (columnas)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Columnas seguro (ya aplicadas vía API, idempotentes)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS seguro_antidevoluciones BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS costo_seguro            DECIMAL(10,2) NOT NULL DEFAULT 0;

-- 2. Columnas de tracking automático
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS tracking_eventos         JSONB        DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tracking_actualizado_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_ultimo_estado   TEXT;

-- Índice para el job de monitoreo (ordena por pedidos más atrasados)
CREATE INDEX IF NOT EXISTS idx_pedidos_tracking_job
  ON pedidos (tracking_actualizado_en ASC NULLS FIRST)
  WHERE estado IN ('guia_generada','confirmado','despachado','en_ruta')
    AND mipaquete_sending_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────
-- 3. RPC: pedidos que necesitan actualización de tracking
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pedidos_para_tracking(p_limite integer DEFAULT 50)
RETURNS TABLE(
  id                    uuid,
  mipaquete_sending_id  text,
  estado                text,
  seguro_antidevoluciones boolean,
  delivery_company_id   text
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.mipaquete_sending_id,
    p.estado,
    p.seguro_antidevoluciones,
    p.delivery_company_id
  FROM pedidos p
  WHERE p.mipaquete_sending_id IS NOT NULL
    AND p.estado IN ('guia_generada','confirmado','despachado','en_ruta')
    AND (
      p.tracking_actualizado_en IS NULL
      OR p.tracking_actualizado_en < now() - interval '25 minutes'
    )
  ORDER BY p.tracking_actualizado_en ASC NULLS FIRST
  LIMIT p_limite;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 4. RPC: actualizar tracking + cambiar estado si corresponde
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.actualizar_tracking_pedido(
  p_pedido_id           uuid,
  p_eventos             jsonb,
  p_ultimo_estado       text,
  p_nuevo_estado_pedido text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_estado_anterior  text;
  v_vendedor_id      uuid;
  v_seguro           boolean;
  v_cambio           boolean := false;
  -- estados que ya son finales y no deben ser sobrescritos
  v_estados_finales  text[]  := ARRAY['entregado','devuelto','cancelado'];
BEGIN
  SELECT estado, vendedor_id, seguro_antidevoluciones
    INTO v_estado_anterior, v_vendedor_id, v_seguro
  FROM pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Solo cambiar si el nuevo estado es válido, distinto al actual
  -- y el pedido no está ya en un estado final
  IF p_nuevo_estado_pedido IS NOT NULL
     AND p_nuevo_estado_pedido <> v_estado_anterior
     AND NOT (v_estado_anterior = ANY(v_estados_finales))
     AND p_nuevo_estado_pedido = ANY(ARRAY[
       'guia_generada','confirmado','despachado','en_ruta','entregado','devuelto','cancelado'
     ])
  THEN
    v_cambio := true;
  END IF;

  UPDATE pedidos SET
    tracking_eventos        = p_eventos,
    tracking_actualizado_en = now(),
    tracking_ultimo_estado  = p_ultimo_estado,
    estado                  = CASE WHEN v_cambio THEN p_nuevo_estado_pedido ELSE estado END,
    actualizado_en          = now()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'estado_anterior', v_estado_anterior,
    'estado_nuevo',    CASE WHEN v_cambio THEN p_nuevo_estado_pedido ELSE v_estado_anterior END,
    'cambio',          v_cambio,
    'vendedor_id',     v_vendedor_id,
    'seguro',          v_seguro
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 5. pg_cron: ejecutar monitorear-guias cada 30 minutos
--    (requiere extensión pg_cron + pg_net, habilitadas por defecto en Supabase)
-- ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Eliminar si ya existía (idempotente)
  PERFORM cron.unschedule('monitorear-guias-tracking');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'monitorear-guias-tracking',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://tisrfefpjordcpuzyiwr.supabase.co/functions/v1/monitorear-guias',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpc3JmZWZwam9yZGNwdXp5aXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzkzOTcsImV4cCI6MjA4ODQ1NTM5N30.QMCoytVQN14fiWCnuAwxphS9HSHCyWDZSBYm7VfeWAo","x-cron-secret":"lz-cron-2026"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id
  $$
);
