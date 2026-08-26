-- ═══════════════════════════════════════════════════════════════════
-- Creativos: búsqueda web automática (Pexels + YouTube)
-- ═══════════════════════════════════════════════════════════════════

-- archivo_path es null para creativos externos (sin bucket)
ALTER TABLE creativos ALTER COLUMN archivo_path DROP NOT NULL;

ALTER TABLE creativos
  ADD COLUMN IF NOT EXISTS fuente TEXT NOT NULL DEFAULT 'upload'
    CHECK (fuente IN ('upload', 'web')),
  ADD COLUMN IF NOT EXISTS estado_revision TEXT NOT NULL DEFAULT 'aprobado'
    CHECK (estado_revision IN ('sugerido', 'aprobado', 'rechazado')),
  ADD COLUMN IF NOT EXISTS fuente_nombre TEXT;

CREATE INDEX IF NOT EXISTS idx_creativos_sugeridos
  ON creativos (producto_id, estado_revision)
  WHERE fuente = 'web';

CREATE OR REPLACE FUNCTION aprobar_sugerido(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT obtener_rol()) NOT IN ('admin', 'inventario') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE creativos SET estado_revision = 'aprobado', publico = true WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION rechazar_sugerido(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT obtener_rol()) NOT IN ('admin', 'inventario') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  DELETE FROM creativos WHERE id = p_id AND fuente = 'web';
END;
$$;
