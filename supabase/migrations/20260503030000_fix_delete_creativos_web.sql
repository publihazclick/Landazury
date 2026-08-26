-- Permite a inventario eliminar creativos de fuente web (subido_por = null porque
-- los inserta el Edge Function con service role, no el usuario directamente)
DROP POLICY IF EXISTS "creativos_eliminacion" ON creativos;
CREATE POLICY "creativos_eliminacion" ON creativos
  FOR DELETE USING (
    public.obtener_rol() = 'admin' OR
    (public.obtener_rol() = 'inventario' AND (
      subido_por = auth.uid() OR fuente = 'web'
    ))
  );
