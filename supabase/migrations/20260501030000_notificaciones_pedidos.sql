-- ============================================================
-- LANDAZURY — Notificaciones automáticas de pedidos por WhatsApp
-- ============================================================
-- Cuando un pedido cambia de estado (o es creado), el sistema:
--   1. Encola una notificación para el VENDEDOR
--   2. Encola una notificación para el CLIENTE FINAL
--   3. Dispara la edge function `notificar-pedido-evento` vía pg_net
--      para que envíe los mensajes por WhatsApp (Evolution API).
--
-- Si la edge function falla o WhatsApp no está configurado, las
-- notificaciones quedan en `pendiente` y se pueden reenviar manual-
-- mente desde el panel admin.
-- ============================================================

-- Extensión http (pg_net ya activado en migración previa)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================
-- 1. Tabla de notificaciones (ledger + cola de envío)
-- ============================================================

CREATE TABLE IF NOT EXISTS notificaciones_pedidos (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id          UUID REFERENCES pedidos(id) ON DELETE CASCADE NOT NULL,
  evento             TEXT NOT NULL,
  destinatario_tipo  TEXT NOT NULL CHECK (destinatario_tipo IN ('vendedor','cliente')),
  destinatario_nombre  TEXT,
  destinatario_telefono TEXT NOT NULL,
  mensaje            TEXT NOT NULL,
  estado             TEXT NOT NULL DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente','enviado','fallido','desactivado')),
  intentos           INT NOT NULL DEFAULT 0,
  ultimo_error       TEXT,
  evolution_response JSONB,
  creado_en          TIMESTAMPTZ DEFAULT NOW(),
  enviado_en         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notif_pedidos_pedido
  ON notificaciones_pedidos(pedido_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_notif_pedidos_pendiente
  ON notificaciones_pedidos(estado, creado_en)
  WHERE estado = 'pendiente';

ALTER TABLE notificaciones_pedidos ENABLE ROW LEVEL SECURITY;

-- Admin ve todas las notificaciones
CREATE POLICY "notif_admin_lectura" ON notificaciones_pedidos
  FOR SELECT USING (public.obtener_rol() = 'admin');

-- Inventario ve notificaciones de pedidos de productos que él subió
CREATE POLICY "notif_inventario_lectura_propias" ON notificaciones_pedidos
  FOR SELECT
  USING (
    public.obtener_rol() = 'inventario'
    AND EXISTS (
      SELECT 1 FROM pedidos pe
      JOIN productos pr ON pr.id = pe.producto_id
      WHERE pe.id = notificaciones_pedidos.pedido_id
        AND pr.subido_por = auth.uid()
    )
  );

-- Vendedor ve notificaciones de sus propios pedidos
CREATE POLICY "notif_vendedor_lectura_propias" ON notificaciones_pedidos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos pe
      WHERE pe.id = notificaciones_pedidos.pedido_id
        AND pe.vendedor_id = auth.uid()
    )
  );

-- ============================================================
-- 2. Config: toggle global + nombre instancia Evolution
-- ============================================================

INSERT INTO config_plataforma (clave, valor) VALUES
  ('notificaciones_whatsapp_activas', 'true'::jsonb),
  ('evolution_instance_name',         '""'::jsonb),
  ('notificaciones_remitente_nombre', '"Landazury"'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- ============================================================
-- 3. Helper: normaliza teléfono al formato 57XXXXXXXXXX
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalizar_telefono_co(p_tel TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF p_tel IS NULL OR length(trim(p_tel)) = 0 THEN
    RETURN NULL;
  END IF;
  v_clean := regexp_replace(p_tel, '[^0-9]', '', 'g');
  IF length(v_clean) = 10 AND substring(v_clean, 1, 1) = '3' THEN
    RETURN '57' || v_clean;
  END IF;
  IF length(v_clean) = 12 AND substring(v_clean, 1, 2) = '57' THEN
    RETURN v_clean;
  END IF;
  IF length(v_clean) >= 10 THEN
    RETURN v_clean;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================================
-- 4. Construir mensaje según evento + destinatario
-- ============================================================

CREATE OR REPLACE FUNCTION public.construir_mensaje_pedido(
  p_destinatario  TEXT,
  p_evento        TEXT,
  p_pedido        pedidos,
  p_producto_nombre TEXT,
  p_motivo        TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_remitente TEXT;
  v_msg TEXT;
  v_estado_label TEXT;
  v_tracking TEXT := '';
BEGIN
  -- Mapeo de estados a etiquetas amigables
  v_estado_label := CASE p_evento
    WHEN 'creado'     THEN '🆕 PEDIDO CREADO'
    WHEN 'pendiente'  THEN '⏳ PEDIDO RECIBIDO'
    WHEN 'confirmado' THEN '✅ PEDIDO CONFIRMADO'
    WHEN 'despachado' THEN '📦 PEDIDO DESPACHADO'
    WHEN 'en_ruta'    THEN '🚚 EN RUTA HACIA TI'
    WHEN 'entregado'  THEN '🎉 PEDIDO ENTREGADO'
    WHEN 'devuelto'   THEN '↩️ PEDIDO DEVUELTO'
    WHEN 'cancelado'  THEN '❌ PEDIDO CANCELADO'
    ELSE upper(p_evento)
  END;

  -- Tracking si hay guía
  IF p_pedido.guia IS NOT NULL AND length(p_pedido.guia) > 0 THEN
    v_tracking := E'\n*Guía:* ' || p_pedido.guia ||
                  CASE WHEN p_pedido.transportadora IS NOT NULL
                       THEN ' (' || p_pedido.transportadora || ')'
                       ELSE ''
                  END;
  END IF;

  IF p_destinatario = 'vendedor' THEN
    v_msg := v_estado_label || E'\n\n' ||
             '*Pedido #' || p_pedido.numero || '*' || E'\n' ||
             '*Producto:* ' || COALESCE(p_producto_nombre, '—') || E'\n' ||
             '*Cliente:* ' || p_pedido.cliente_nombre || E'\n' ||
             '*Destino:* ' || p_pedido.cliente_ciudad || ', ' || p_pedido.cliente_departamento ||
             v_tracking;

    IF p_evento = 'cancelado' AND p_motivo IS NOT NULL THEN
      v_msg := v_msg || E'\n*Motivo:* ' || p_motivo ||
               E'\n💰 Reembolso aplicado a tu wallet.';
    ELSIF p_evento = 'entregado' THEN
      v_msg := v_msg || E'\n\n¡Felicidades por la venta! 💪';
    ELSIF p_evento = 'creado' THEN
      v_msg := v_msg || E'\n\nTe avisaremos en cada cambio de estado.';
    END IF;

  ELSE -- cliente
    v_msg := v_estado_label || E'\n\n' ||
             'Hola ' || p_pedido.cliente_nombre || ',' || E'\n' ||
             '*Pedido #' || p_pedido.numero || '*' || E'\n' ||
             '*Producto:* ' || COALESCE(p_producto_nombre, '—');

    IF p_evento IN ('despachado','en_ruta') THEN
      v_msg := v_msg || v_tracking;
    END IF;

    v_msg := v_msg ||
      CASE p_evento
        WHEN 'creado'     THEN E'\n\nRecibimos tu pedido. Pronto te confirmamos el despacho.'
        WHEN 'confirmado' THEN E'\n\nTu pedido fue confirmado y será despachado en breve.'
        WHEN 'despachado' THEN E'\n\nTu pedido ya está en manos de la transportadora.'
        WHEN 'en_ruta'    THEN E'\n\nLa transportadora ya está en camino a tu dirección.'
        WHEN 'entregado'  THEN E'\n\n¡Gracias por tu compra! 💛'
        WHEN 'devuelto'   THEN E'\n\nTu pedido fue devuelto. Si tienes preguntas, contacta al vendedor.'
        WHEN 'cancelado'  THEN COALESCE(E'\n\nMotivo: ' || p_motivo, '') || E'\n\nTu pedido fue cancelado.'
        ELSE ''
      END;
  END IF;

  RETURN v_msg;
END;
$$;

-- ============================================================
-- 5. Encolar notificaciones para un pedido + evento
-- ============================================================

CREATE OR REPLACE FUNCTION public.encolar_notificaciones_pedido(
  p_pedido_id UUID,
  p_evento    TEXT,
  p_motivo    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pedido        pedidos;
  v_producto_nombre TEXT;
  v_vendedor_tel  TEXT;
  v_vendedor_nom  TEXT;
  v_cliente_tel   TEXT;
  v_activas       BOOLEAN;
BEGIN
  -- Pedido
  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Toggle global
  SELECT (valor::text)::boolean INTO v_activas
    FROM config_plataforma WHERE clave = 'notificaciones_whatsapp_activas';
  IF v_activas IS NULL THEN v_activas := true; END IF;

  -- Producto + vendedor
  SELECT pr.nombre INTO v_producto_nombre
    FROM productos pr WHERE pr.id = v_pedido.producto_id;
  SELECT pe.telefono, pe.nombre INTO v_vendedor_tel, v_vendedor_nom
    FROM perfiles pe WHERE pe.id = v_pedido.vendedor_id;

  v_vendedor_tel := public.normalizar_telefono_co(v_vendedor_tel);
  v_cliente_tel  := public.normalizar_telefono_co(v_pedido.cliente_telefono);

  -- Insertar notificación VENDEDOR (si tiene teléfono)
  IF v_vendedor_tel IS NOT NULL THEN
    INSERT INTO notificaciones_pedidos (
      pedido_id, evento, destinatario_tipo, destinatario_nombre,
      destinatario_telefono, mensaje, estado
    ) VALUES (
      p_pedido_id, p_evento, 'vendedor', v_vendedor_nom,
      v_vendedor_tel,
      public.construir_mensaje_pedido('vendedor', p_evento, v_pedido, v_producto_nombre, p_motivo),
      CASE WHEN v_activas THEN 'pendiente' ELSE 'desactivado' END
    );
  END IF;

  -- Insertar notificación CLIENTE
  IF v_cliente_tel IS NOT NULL THEN
    INSERT INTO notificaciones_pedidos (
      pedido_id, evento, destinatario_tipo, destinatario_nombre,
      destinatario_telefono, mensaje, estado
    ) VALUES (
      p_pedido_id, p_evento, 'cliente', v_pedido.cliente_nombre,
      v_cliente_tel,
      public.construir_mensaje_pedido('cliente', p_evento, v_pedido, v_producto_nombre, p_motivo),
      CASE WHEN v_activas THEN 'pendiente' ELSE 'desactivado' END
    );
  END IF;

  -- El envío real se dispara desde el frontend o el RPC reenviar_notificacion,
  -- llamando a la edge function `notificar-pedido-evento` con el pedido_id.
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloquear el pedido por una falla de notificación
  RAISE WARNING 'Falla encolando notificaciones para pedido %: %', p_pedido_id, SQLERRM;
END;
$$;

-- ============================================================
-- 6. Triggers en pedidos
-- ============================================================

-- AFTER INSERT → notificación "creado"
CREATE OR REPLACE FUNCTION public.notif_pedido_insertado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.encolar_notificaciones_pedido(NEW.id, 'creado', NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_pedido_insertado ON pedidos;
CREATE TRIGGER trg_notif_pedido_insertado
  AFTER INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION public.notif_pedido_insertado();

-- AFTER UPDATE → notificación si cambió el estado
CREATE OR REPLACE FUNCTION public.notif_pedido_actualizado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_motivo TEXT;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    -- Si pasó a cancelado y hay notas nuevas, las usamos como motivo
    IF NEW.estado IN ('cancelado','devuelto') AND NEW.notas_admin IS NOT NULL THEN
      v_motivo := substring(NEW.notas_admin from 'CANCELADO [^:\n]*: ([^\n]*)');
    END IF;
    PERFORM public.encolar_notificaciones_pedido(NEW.id, NEW.estado, v_motivo);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_pedido_actualizado ON pedidos;
CREATE TRIGGER trg_notif_pedido_actualizado
  AFTER UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION public.notif_pedido_actualizado();

-- ============================================================
-- 7. RPC para reenviar manualmente desde el admin
-- ============================================================

CREATE OR REPLACE FUNCTION public.reenviar_notificacion(p_notif_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  v_rol := public.obtener_rol();
  IF v_rol NOT IN ('admin','inventario') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM notificaciones_pedidos WHERE id = p_notif_id) THEN
    RAISE EXCEPTION 'Notificación no encontrada';
  END IF;

  UPDATE notificaciones_pedidos
     SET estado = 'pendiente', ultimo_error = NULL
   WHERE id = p_notif_id;

  RETURN json_build_object('status', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reenviar_notificacion(UUID) TO authenticated;
