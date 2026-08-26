-- ============================================================
-- LANDAZURY — Markup automático para categoría CALZADO
-- ============================================================
-- Regla de negocio:
--   Para productos de categoría "calzado", sobre los valores que
--   sube el subidor se aplica automáticamente:
--     precio_final    = precio_base + 15.000 COP
--     precio_sugerido = precio_sugerido (subido) + 68.000 COP
--   Se aplica en INSERT y UPDATE, tanto desde el formulario manual
--   como desde la importación masiva por Excel.
-- ============================================================

-- 1) Asegurar que la categoría "calzado" exista
INSERT INTO public.categorias (nombre, slug, icono) VALUES
  ('Calzado', 'calzado', '👟')
ON CONFLICT (slug) DO NOTHING;

-- 2) Función de trigger: aplicar markup si la categoría es calzado
CREATE OR REPLACE FUNCTION public.aplicar_markup_calzado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  es_calzado BOOLEAN;
BEGIN
  IF NEW.categoria_id IS NULL OR NEW.precio_base IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (slug = 'calzado')
    INTO es_calzado
    FROM public.categorias
    WHERE id = NEW.categoria_id;

  IF COALESCE(es_calzado, FALSE) THEN
    NEW.precio_final    := NEW.precio_base + 15000;
    NEW.precio_sugerido := COALESCE(NEW.precio_sugerido, NEW.precio_base) + 68000;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Trigger BEFORE INSERT OR UPDATE sobre productos
DROP TRIGGER IF EXISTS trg_aplicar_markup_calzado ON public.productos;

CREATE TRIGGER trg_aplicar_markup_calzado
  BEFORE INSERT OR UPDATE OF precio_base, precio_sugerido, precio_final, categoria_id
  ON public.productos
  FOR EACH ROW
  EXECUTE FUNCTION public.aplicar_markup_calzado();

-- 4) Backfill: corregir productos calzado ya existentes
UPDATE public.productos p
SET
  precio_final    = p.precio_base + 15000,
  precio_sugerido = COALESCE(p.precio_sugerido, p.precio_base) + 68000
FROM public.categorias c
WHERE p.categoria_id = c.id
  AND c.slug = 'calzado';
