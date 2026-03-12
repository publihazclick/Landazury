-- Aprobar automáticamente todos los productos pendientes con margen del 30%
-- precio_final = ROUND(precio_base * 1.30) para que el admin pueda editarlo luego
UPDATE productos
SET
  estado     = 'aprobado',
  disponible = true,
  precio_final = ROUND(precio_base * 1.30)
WHERE estado = 'pendiente';
