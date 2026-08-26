-- ============================================================
-- LANDAZURY — Avisos de plataforma (campanita)
-- Admin envía mensajes a todos los usuarios desde el panel.
-- ============================================================

CREATE TABLE IF NOT EXISTS avisos (
  id        UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo    TEXT        NOT NULL,
  mensaje   TEXT        NOT NULL,
  tipo      TEXT        NOT NULL DEFAULT 'info'
              CHECK (tipo IN ('info', 'promo', 'alerta', 'novedad')),
  activo    BOOLEAN     NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE avisos ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados leen avisos activos
CREATE POLICY "avisos_lectura" ON avisos
  FOR SELECT USING (auth.uid() IS NOT NULL AND activo = true);

-- Admin gestiona todo (incluyendo ver los inactivos)
CREATE POLICY "avisos_admin_todo" ON avisos
  FOR ALL USING (public.obtener_rol() = 'admin');

-- ── Tracking de avisos leídos por usuario ──────────────────
CREATE TABLE IF NOT EXISTS avisos_vistos (
  aviso_id   UUID REFERENCES avisos(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  visto_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aviso_id, usuario_id)
);

ALTER TABLE avisos_vistos ENABLE ROW LEVEL SECURITY;

-- Cada usuario gestiona sus propios registros
CREATE POLICY "avisos_vistos_usuario" ON avisos_vistos
  FOR ALL USING (usuario_id = auth.uid());

-- Admin puede leer todos
CREATE POLICY "avisos_vistos_admin" ON avisos_vistos
  FOR SELECT USING (public.obtener_rol() = 'admin');

-- Índice para contar no-leídos rápido
CREATE INDEX IF NOT EXISTS idx_avisos_vistos_usuario
  ON avisos_vistos (usuario_id, aviso_id);
