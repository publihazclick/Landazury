-- ============================================================
-- LANDAZURY — Atribuir productos al usuario que los sube
-- ============================================================
-- Permite que cada usuario "inventario" vea SOLO los pedidos cuyos
-- productos él mismo subió, mientras admin sigue viendo todo.
--
-- Cambios:
--   1. productos.subido_por → UUID FK auth.users
--   2. Trigger before-insert que rellena subido_por con auth.uid()
--      cuando NULL (excepto para admin: si admin sube, queda NULL
--      o queda él mismo). El trigger no sobreescribe valores existentes.
--   3. Índice para acelerar el filtrado.
--   4. RLS: split de pedidos_admin_lectura/actualizacion.
--      - Admin sigue viendo y editando TODO.
--      - Inventario ve y edita SOLO los pedidos cuyo producto.subido_por = auth.uid().
-- ============================================================

-- 1. Columna y FK
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS subido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_productos_subido_por
  ON productos(subido_por)
  WHERE subido_por IS NOT NULL;

-- 2. Trigger: si subido_por viene NULL al INSERT, lo rellena con auth.uid().
CREATE OR REPLACE FUNCTION public.productos_set_subido_por()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subido_por IS NULL THEN
    NEW.subido_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productos_set_subido_por ON productos;
CREATE TRIGGER trg_productos_set_subido_por
  BEFORE INSERT ON productos
  FOR EACH ROW EXECUTE FUNCTION public.productos_set_subido_por();

-- 3. Backfill conservador: productos sin owner se asignan al admin (si hay
--    exactamente uno) para que pueda revisar pedidos históricos. Si hay
--    varios admins o ninguno, se dejan en NULL (solo admin los verá vía RLS).
DO $$
DECLARE
  v_admin_id UUID;
  v_admin_count INT;
BEGIN
  SELECT COUNT(*) INTO v_admin_count FROM perfiles WHERE rol = 'admin';
  IF v_admin_count = 1 THEN
    SELECT id INTO v_admin_id FROM perfiles WHERE rol = 'admin' LIMIT 1;
    UPDATE productos SET subido_por = v_admin_id WHERE subido_por IS NULL;
  END IF;
END $$;

-- 4. Reescribir las policies de pedidos para filtrar inventario por dueño
DROP POLICY IF EXISTS "pedidos_admin_lectura"      ON pedidos;
DROP POLICY IF EXISTS "pedidos_admin_actualizacion" ON pedidos;

-- Admin: ve y edita TODO
CREATE POLICY "pedidos_admin_lectura_total" ON pedidos
  FOR SELECT
  USING (public.obtener_rol() = 'admin');

CREATE POLICY "pedidos_admin_actualizacion_total" ON pedidos
  FOR UPDATE
  USING (public.obtener_rol() = 'admin');

-- Inventario: ve y edita solo pedidos de productos que él subió
CREATE POLICY "pedidos_inventario_lectura_propios" ON pedidos
  FOR SELECT
  USING (
    public.obtener_rol() = 'inventario'
    AND EXISTS (
      SELECT 1 FROM productos p
      WHERE p.id = pedidos.producto_id
        AND p.subido_por = auth.uid()
    )
  );

CREATE POLICY "pedidos_inventario_actualizacion_propios" ON pedidos
  FOR UPDATE
  USING (
    public.obtener_rol() = 'inventario'
    AND EXISTS (
      SELECT 1 FROM productos p
      WHERE p.id = pedidos.producto_id
        AND p.subido_por = auth.uid()
    )
  );
