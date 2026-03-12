-- Permite a inventario eliminar sus propios creativos (antes solo admin podía)
DROP POLICY IF EXISTS "creativos_eliminacion" ON creativos;
CREATE POLICY "creativos_eliminacion" ON creativos
  FOR DELETE USING (
    public.obtener_rol() = 'admin' OR
    (public.obtener_rol() = 'inventario' AND subido_por = auth.uid())
  );

-- Storage: permite a inventario eliminar archivos del bucket creativos
DROP POLICY IF EXISTS "storage_creativos_eliminacion" ON storage.objects;
CREATE POLICY "storage_creativos_eliminacion" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'creativos' AND
    public.obtener_rol() IN ('admin', 'inventario')
  );
