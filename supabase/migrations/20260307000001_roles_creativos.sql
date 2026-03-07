-- ============================================================
-- LANDAZURY — Migración: Roles y Creativos
-- ============================================================

-- ============================================================
-- 1. Actualizar rol en perfiles
-- ============================================================

ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE perfiles ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('admin', 'inventario', 'usuario'));

-- Migrar rol 'vendedor' → 'usuario'
UPDATE perfiles SET rol = 'usuario' WHERE rol = 'vendedor';

-- Actualizar trigger para nuevos registros
CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    'usuario'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Función helper de rol (evita N+1 en RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_rol()
RETURNS TEXT AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. Tabla de creativos (imágenes, videos, PDFs, docs, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS creativos (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       TEXT        NOT NULL,
  descripcion  TEXT,
  tipo         TEXT        NOT NULL CHECK (tipo IN ('imagen', 'video', 'pdf', 'documento', 'otro')),
  archivo_url  TEXT        NOT NULL,
  archivo_path TEXT        NOT NULL,
  tamano       BIGINT,
  extension    TEXT,
  producto_id  UUID        REFERENCES productos(id) ON DELETE SET NULL,
  subido_por   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  publico      BOOLEAN     DEFAULT true,
  creado_en    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. RLS para creativos
-- ============================================================

ALTER TABLE creativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creativos_lectura_usuarios" ON creativos
  FOR SELECT USING (auth.uid() IS NOT NULL AND publico = true);

CREATE POLICY "creativos_lectura_admin_inventario" ON creativos
  FOR SELECT USING (public.obtener_rol() IN ('admin', 'inventario'));

CREATE POLICY "creativos_insercion" ON creativos
  FOR INSERT WITH CHECK (public.obtener_rol() IN ('admin', 'inventario'));

CREATE POLICY "creativos_actualizacion" ON creativos
  FOR UPDATE USING (public.obtener_rol() IN ('admin', 'inventario'));

CREATE POLICY "creativos_eliminacion" ON creativos
  FOR DELETE USING (public.obtener_rol() = 'admin');

-- ============================================================
-- 5. Políticas adicionales en productos (gestión por rol)
-- ============================================================

CREATE POLICY "productos_insercion_roles" ON productos
  FOR INSERT WITH CHECK (public.obtener_rol() IN ('admin', 'inventario'));

CREATE POLICY "productos_actualizacion_roles" ON productos
  FOR UPDATE USING (public.obtener_rol() IN ('admin', 'inventario'));

CREATE POLICY "productos_eliminacion_admin" ON productos
  FOR DELETE USING (public.obtener_rol() = 'admin');

-- Admin e inventario pueden ver productos no disponibles también
CREATE POLICY "productos_gestion_todos" ON productos
  FOR SELECT USING (public.obtener_rol() IN ('admin', 'inventario'));

-- ============================================================
-- 6. Políticas adicionales en perfiles (admin gestiona usuarios)
-- ============================================================

CREATE POLICY "perfiles_admin_lectura" ON perfiles
  FOR SELECT USING (public.obtener_rol() = 'admin');

CREATE POLICY "perfiles_admin_actualizacion" ON perfiles
  FOR UPDATE USING (public.obtener_rol() = 'admin');

-- ============================================================
-- 7. Storage bucket "creativos"
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'creativos',
  'creativos',
  false,
  524288000,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'video/mp4','video/webm','video/quicktime','video/x-msvideo','video/x-matroska',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip','application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "storage_creativos_subida" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'creativos' AND
    public.obtener_rol() IN ('admin', 'inventario')
  );

CREATE POLICY "storage_creativos_lectura" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'creativos' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "storage_creativos_actualizacion" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'creativos' AND
    public.obtener_rol() IN ('admin', 'inventario')
  );

CREATE POLICY "storage_creativos_eliminacion" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'creativos' AND
    public.obtener_rol() = 'admin'
  );
