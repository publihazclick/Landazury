-- ============================================================
-- LANDAZURY — Estado guia_generada + auto-generación por vendedor
-- ============================================================
-- Cambios:
--   1. pedidos.estado acepta 'guia_generada' (nuevo estado entre
--      pendiente y los estados de la transportadora).
--   2. registrar_guia_mipaquete:
--        - Permite que el propio vendedor (rol 'usuario') llame
--          el RPC para su pedido (para auto-generación desde el modal).
--        - Fija estado = 'guia_generada' en vez de 'despachado'.
-- ============================================================

-- ── 1. Ampliar el CHECK constraint de estado ────────────────────────────────

ALTER TABLE pedidos
  DROP CONSTRAINT IF EXISTS pedidos_estado_check;

ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN (
    'pendiente','guia_generada','confirmado','despachado',
    'en_ruta','entregado','devuelto','cancelado'
  ));

-- ── 2. Actualizar RPC registrar_guia_mipaquete ──────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_guia_mipaquete(
  p_pedido_id      UUID,
  p_sending_id     TEXT,
  p_guia           TEXT,
  p_transportadora TEXT
)
RETURNS JSON AS $$
DECLARE
  v_rol       TEXT;
  v_vendedor  UUID;
BEGIN
  v_rol := public.obtener_rol();

  IF v_rol NOT IN ('admin','inventario','usuario') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Para rol usuario: solo puede registrar en sus propios pedidos
  IF v_rol = 'usuario' THEN
    SELECT vendedor_id INTO v_vendedor
      FROM pedidos WHERE id = p_pedido_id;
    IF v_vendedor IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'No autorizado para este pedido';
    END IF;
  END IF;

  UPDATE pedidos SET
    mipaquete_sending_id = p_sending_id,
    guia                 = p_guia,
    transportadora       = COALESCE(p_transportadora, transportadora),
    -- Siempre avanza a guia_generada (independiente del rol que genera)
    estado = CASE
      WHEN estado IN ('pendiente','confirmado') THEN 'guia_generada'
      ELSE estado
    END
  WHERE id = p_pedido_id;

  RETURN json_build_object('status','ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.registrar_guia_mipaquete TO authenticated;
