-- ============================================================
-- MIGRACIÓN LANDAZURY — Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar columnas ganador y exclusivo a productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS ganador  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS exclusivo BOOLEAN NOT NULL DEFAULT false;

-- 2. Actualizar constraint de rol en perfiles (si aún usa 'vendedor')
ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE perfiles ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('usuario', 'inventario', 'admin'));

-- 3. Eliminar políticas antiguas que puedan causar conflicto
DROP POLICY IF EXISTS "productos_inventario_insertar"    ON productos;
DROP POLICY IF EXISTS "productos_inventario_actualizar"  ON productos;
DROP POLICY IF EXISTS "productos_inventario_eliminar"    ON productos;
DROP POLICY IF EXISTS "admin_lectura_perfiles"           ON perfiles;
DROP POLICY IF EXISTS "admin_actualizacion_perfiles"     ON perfiles;
DROP POLICY IF EXISTS "perfil_propio_lectura"            ON perfiles;
DROP POLICY IF EXISTS "perfil_propio_escritura"          ON perfiles;
DROP POLICY IF EXISTS "perfil_propio_actualizacion"      ON perfiles;

-- 4. Políticas de perfiles
CREATE POLICY "perfil_propio_lectura" ON perfiles
  FOR SELECT USING (true);  -- todos los autenticados pueden ver perfiles (para RLS de otras tablas)

CREATE POLICY "perfil_propio_escritura" ON perfiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "perfil_propio_actualizacion" ON perfiles
  FOR UPDATE USING (
    auth.uid() = id OR
    (SELECT rol FROM perfiles WHERE id = auth.uid()) = 'admin'
  );

-- 5. Políticas de productos — inventario y admin pueden escribir
CREATE POLICY "productos_inventario_insertar" ON productos
  FOR INSERT WITH CHECK (
    (SELECT rol FROM perfiles WHERE id = auth.uid()) IN ('inventario', 'admin')
  );

CREATE POLICY "productos_inventario_actualizar" ON productos
  FOR UPDATE USING (
    (SELECT rol FROM perfiles WHERE id = auth.uid()) IN ('inventario', 'admin')
  );

CREATE POLICY "productos_inventario_eliminar" ON productos
  FOR DELETE USING (
    (SELECT rol FROM perfiles WHERE id = auth.uid()) IN ('inventario', 'admin')
  );

-- 6. Creativos: inventario y admin pueden gestionar
ALTER TABLE IF EXISTS creativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creativos_lectura"    ON creativos;
DROP POLICY IF EXISTS "creativos_escritura"  ON creativos;
DROP POLICY IF EXISTS "creativos_eliminar"   ON creativos;

CREATE POLICY "creativos_lectura" ON creativos
  FOR SELECT USING (publico = true OR (SELECT rol FROM perfiles WHERE id = auth.uid()) IN ('inventario', 'admin'));

CREATE POLICY "creativos_escritura" ON creativos
  FOR INSERT WITH CHECK (
    (SELECT rol FROM perfiles WHERE id = auth.uid()) IN ('inventario', 'admin')
  );

CREATE POLICY "creativos_eliminar" ON creativos
  FOR DELETE USING (
    (SELECT rol FROM perfiles WHERE id = auth.uid()) IN ('inventario', 'admin')
  );

-- ============================================================
-- 10 PRODUCTOS ADICIONALES DE PRUEBA
-- ============================================================

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Masajeador Facial Microcorriente',
       'Dispositivo de microcorriente para tonificar y reafirmar la piel. 5 intensidades, resistente al agua.',
       14.00, 59.99,
       ARRAY['https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600'],
       id, 'BeautyPro AR', true, true, true
FROM categorias WHERE slug = 'belleza-salud'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Purificador de Aire USB Mini',
       'Filtro HEPA + difusor de aromas. Silencioso, ideal para escritorio o auto.',
       9.50, 34.99,
       ARRAY['https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600'],
       id, 'HogarDeco CO', true, false, true
FROM categorias WHERE slug = 'hogar-cocina'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Gafas de Sol Aviador Gold',
       'Montura metálica dorada y cristal polarizado UV400. Unisex.',
       7.00, 39.99,
       ARRAY['https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600'],
       id, 'ModaLatam', true, true, true
FROM categorias WHERE slug = 'moda-ropa'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Lámpara LED Escritorio Flexible',
       'Cuello de cisne flexible, 3 temperaturas de luz, puerto USB cargador integrado.',
       11.00, 42.99,
       ARRAY['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600'],
       id, 'HogarDeco CO', true, false, true
FROM categorias WHERE slug = 'hogar-cocina'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Banda de Resistencia Set 5 Niveles',
       'Kit 5 bandas elásticas de látex. Incluye bolsa, manijas y anclaje de puerta.',
       6.50, 27.99,
       ARRAY['https://images.unsplash.com/photo-1598289431512-b97b0917affc?w=600'],
       id, 'SportMax CL', true, true, false
FROM categorias WHERE slug = 'deportes'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Auriculares Gamer RGB 7.1',
       'Headset gaming surround 7.1 virtual, micrófono con cancelación de ruido y luz RGB.',
       16.00, 54.99,
       ARRAY['https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=600'],
       id, 'TechSupply MX', true, true, false
FROM categorias WHERE slug = 'electronica'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Set Skincare Vitamina C Completo',
       'Kit 4 pasos: limpiador, tónico, sérum 20% vitamina C y crema hidratante SPF.',
       19.00, 74.99,
       ARRAY['https://images.unsplash.com/photo-1601049676869-702ea24cfd58?w=600'],
       id, 'BeautyPro AR', true, true, true
FROM categorias WHERE slug = 'belleza-salud'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Teclado Mecánico Compacto 75%',
       'Switches blue, retroiluminación RGB por tecla, carcasa aluminio.',
       28.00, 89.99,
       ARRAY['https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600'],
       id, 'TechSupply MX', true, false, false
FROM categorias WHERE slug = 'electronica'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Juego de Sábanas Bambú 1800 Hilos',
       'Set 4 piezas microfibra ultrafina efecto bambú. Suave, transpirable y antialérgica.',
       12.00, 45.99,
       ARRAY['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600'],
       id, 'HogarDeco CO', true, false, false
FROM categorias WHERE slug = 'hogar-cocina'
;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible, ganador, exclusivo)
SELECT 'Cámara Acción 4K Waterproof',
       '4K 60fps, estabilización EIS, resistente al agua 30m. Kit de accesorios incluido.',
       32.00, 99.99,
       ARRAY['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600'],
       id, 'TechSupply MX', true, true, true
FROM categorias WHERE slug = 'electronica'
;

-- Marcar algunos de los productos originales como ganadores/exclusivos
UPDATE productos SET ganador = true, exclusivo = false WHERE nombre = 'Auriculares Bluetooth Pro X';
UPDATE productos SET ganador = true, exclusivo = false WHERE nombre = 'Smartwatch Fit Pro';
UPDATE productos SET ganador = false, exclusivo = false WHERE nombre = 'Camiseta Premium Oversize';
UPDATE productos SET ganador = false, exclusivo = false WHERE nombre = 'Set de Organizadores de Cocina';
UPDATE productos SET ganador = true,  exclusivo = false WHERE nombre = 'Suero Vitamina C Facial';
UPDATE productos SET ganador = true,  exclusivo = false WHERE nombre = 'Mancuernas Ajustables 20kg';
