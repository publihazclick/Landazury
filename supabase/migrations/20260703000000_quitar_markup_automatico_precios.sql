-- ============================================================
-- LANDAZURY — Eliminar lógica de aumento automático de precios
-- ============================================================
-- Nueva regla de negocio: el precio que escribe el subidor (precio_base)
-- es el precio que ve el dropshipper (precio_final), sin recargos
-- automáticos. El precio sugerido de venta también es el que escribe
-- el subidor (precio_sugerido), sin fórmulas ni márgenes fijos.
--
-- Esto elimina el trigger que sumaba +15.000 (precio_final) y +68.000
-- (precio_sugerido) automáticamente para la categoría "calzado".
--
-- No se modifican precios ya guardados en productos existentes.
-- ============================================================

DROP TRIGGER IF EXISTS trg_aplicar_markup_calzado ON public.productos;
DROP FUNCTION IF EXISTS public.aplicar_markup_calzado();
