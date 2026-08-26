-- ============================================================
-- LANDAZURY — WhatsApp por vendedor
-- ============================================================
-- Cada vendedor conecta su propio WhatsApp a la plataforma. Cuando
-- se envía una notificación al cliente final, sale del número del
-- vendedor (no de un número único de la plataforma) para que el
-- cliente reconozca al remitente y aumente la confianza.
--
-- Cambios:
--   1. perfiles gana columnas whatsapp_*
--   2. Política para que cada usuario actualice solo SU whatsapp_*
--   3. La edge function `notificar-pedido-evento` usará la instancia
--      del vendedor para mensajes al cliente, y la instancia global
--      (config_plataforma.evolution_instance_name) para mensajes al
--      vendedor mismo.
-- ============================================================

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS whatsapp_instance_name TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS whatsapp_estado        TEXT NOT NULL DEFAULT 'desconectado'
                            CHECK (whatsapp_estado IN ('desconectado','conectando','conectado','error')),
  ADD COLUMN IF NOT EXISTS whatsapp_numero        TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_conectado_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_ultimo_check  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_perfiles_whatsapp_estado
  ON perfiles(whatsapp_estado)
  WHERE whatsapp_estado = 'conectado';

-- ============================================================
-- Helper: nombre de instancia determinístico por usuario
-- ============================================================

CREATE OR REPLACE FUNCTION public.nombre_instancia_whatsapp(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'lz_' || replace(p_user_id::text, '-', '')
$$;
