-- ============================================================
-- LANDAZURY — Configuración del botón "Mentoría" en el sidebar
-- ============================================================
-- Permite al admin cambiar desde el panel:
--   * mentoria_telefono : número WhatsApp destino (formato internacional sin +)
--   * mentoria_mensaje  : texto plano del mensaje (el front lo url-encodea al armar wa.me)
-- ============================================================

INSERT INTO config_plataforma (clave, valor) VALUES
  ('mentoria_telefono', '"573202241463"'::jsonb),
  ('mentoria_mensaje',  '"Hola *HARLEY* estoy interesad@ en recibir mentoria para aprender a vender los productos de *MODA LANDAZURY* y DE *LANDAZURY IMPORTACIONES* quiero que me enseñes Gracias"'::jsonb)
ON CONFLICT (clave) DO NOTHING;
