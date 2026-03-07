-- ============================================================
-- Agrega columna plataforma a perfiles
-- Actualiza trigger para leer pais, telefono y plataforma
-- desde raw_user_meta_data al momento del registro
-- ============================================================

ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS plataforma TEXT;

-- Actualizar trigger para capturar todos los datos del registro
CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, rol, pais, telefono, plataforma)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    'usuario',
    NEW.raw_user_meta_data->>'pais',
    NEW.raw_user_meta_data->>'telefono',
    NEW.raw_user_meta_data->>'plataforma'
  )
  ON CONFLICT (id) DO UPDATE SET
    nombre     = EXCLUDED.nombre,
    pais       = COALESCE(EXCLUDED.pais, perfiles.pais),
    telefono   = COALESCE(EXCLUDED.telefono, perfiles.telefono),
    plataforma = COALESCE(EXCLUDED.plataforma, perfiles.plataforma);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Política para que admin pueda leer todos los perfiles
CREATE POLICY IF NOT EXISTS "admin_lee_todos_perfiles" ON perfiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- Política para que admin pueda actualizar cualquier perfil
CREATE POLICY IF NOT EXISTS "admin_actualiza_perfiles" ON perfiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- Política para que admin pueda eliminar perfiles
CREATE POLICY IF NOT EXISTS "admin_elimina_perfiles" ON perfiles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );
