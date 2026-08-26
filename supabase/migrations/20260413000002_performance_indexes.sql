-- ============================================================
-- LANDAZURY — Índices de performance
-- ============================================================
-- Acelera listados del catálogo/inventario, inserts masivos y
-- evaluación de RLS policies. Creados con IF NOT EXISTS para
-- que la migración sea idempotente.
-- ============================================================

-- productos: filtros más comunes
CREATE INDEX IF NOT EXISTS idx_productos_bodega_id     ON public.productos(bodega_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria_id  ON public.productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_estado        ON public.productos(estado);
CREATE INDEX IF NOT EXISTS idx_productos_disponible    ON public.productos(disponible) WHERE disponible = TRUE;
CREATE INDEX IF NOT EXISTS idx_productos_creado_en     ON public.productos(creado_en DESC);

-- creativos: queries por producto
CREATE INDEX IF NOT EXISTS idx_creativos_producto_id   ON public.creativos(producto_id);

-- favoritos: joins por usuario/producto
CREATE INDEX IF NOT EXISTS idx_favoritos_usuario_id    ON public.favoritos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_producto_id   ON public.favoritos(producto_id);

-- perfiles: acelera las subqueries de RLS que buscan el rol del uid
CREATE INDEX IF NOT EXISTS idx_perfiles_rol            ON public.perfiles(rol);

-- Refrescar estadísticas para que el planner use los nuevos índices
ANALYZE public.productos;
ANALYZE public.creativos;
ANALYZE public.favoritos;
ANALYZE public.perfiles;
