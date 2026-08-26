-- ============================================================
-- LANDAZURY — Auto-aprobación de productos (a nivel DB)
-- ============================================================
-- Por ahora todos los productos que suba el subidor deben quedar
-- aprobados automáticamente. El cliente ya envía estado='aprobado'
-- en ambas rutas (Excel masivo y formulario manual). Este cambio
-- añade garantía a nivel de base de datos por si algún insert
-- futuro omite el campo.
-- ============================================================

-- 1) Cambiar default de la columna estado a 'aprobado'
ALTER TABLE public.productos
  ALTER COLUMN estado SET DEFAULT 'aprobado';

-- 2) Aprobar cualquier producto que haya quedado en pendiente
UPDATE public.productos
SET
  estado     = 'aprobado',
  disponible = TRUE
WHERE estado = 'pendiente';
