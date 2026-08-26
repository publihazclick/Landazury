-- ============================================================
-- LANDAZURY — El admin queda exento del markup de calzado
-- ============================================================
-- Motivo:
--   El trigger aplicar_markup_calzado sobrescribe precio_final y
--   precio_sugerido en INSERT y UPDATE. Esto impedía que el admin
--   pudiera ajustar manualmente los precios de productos de calzado
--   subidos por los subidores: cada vez que el admin intentaba
--   cambiar uno de esos precios, el trigger lo devolvía al valor
--   calculado.
--
--   La regla de negocio es: el markup automático aplica sólo al
--   subidor. El admin tiene la última palabra sobre cada precio.
-- ============================================================

CREATE OR REPLACE FUNCTION public.aplicar_markup_calzado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  es_calzado BOOLEAN;
BEGIN
  -- Si quien escribe es admin, respetamos los valores tal cual.
  IF public.obtener_rol() = 'admin' THEN
    RETURN NEW;
  END IF;

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
