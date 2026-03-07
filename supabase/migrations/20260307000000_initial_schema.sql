-- ============================================================
-- LANDAZURY — Esquema de base de datos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Tabla de categorías
CREATE TABLE IF NOT EXISTS categorias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icono TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS productos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_base DECIMAL(10,2) NOT NULL,
  precio_sugerido DECIMAL(10,2),
  imagenes TEXT[] DEFAULT '{}',
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  proveedor TEXT,
  disponible BOOLEAN DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de perfiles (extiende auth.users)
CREATE TABLE IF NOT EXISTS perfiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('vendedor', 'admin')),
  pais TEXT,
  telefono TEXT,
  avatar_url TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de favoritos
CREATE TABLE IF NOT EXISTS favoritos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, producto_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE favoritos ENABLE ROW LEVEL SECURITY;

-- Categorías: lectura pública
CREATE POLICY "categorias_lectura_publica" ON categorias
  FOR SELECT USING (true);

-- Productos: lectura pública de productos disponibles
CREATE POLICY "productos_lectura_publica" ON productos
  FOR SELECT USING (disponible = true);

-- Perfiles: cada usuario gestiona el suyo
CREATE POLICY "perfil_propio_lectura" ON perfiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "perfil_propio_escritura" ON perfiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "perfil_propio_actualizacion" ON perfiles
  FOR UPDATE USING (auth.uid() = id);

-- Favoritos: cada usuario gestiona los suyos
CREATE POLICY "favoritos_propios_lectura" ON favoritos
  FOR SELECT USING (auth.uid() = usuario_id);

CREATE POLICY "favoritos_propios_insercion" ON favoritos
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "favoritos_propios_eliminacion" ON favoritos
  FOR DELETE USING (auth.uid() = usuario_id);

-- ============================================================
-- TRIGGER: crear perfil automáticamente al registrarse
-- ============================================================

CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    'vendedor'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER al_crear_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_usuario();

-- ============================================================
-- DATOS DE EJEMPLO
-- ============================================================

INSERT INTO categorias (nombre, slug, icono) VALUES
  ('Electrónica', 'electronica', '📱'),
  ('Moda y ropa', 'moda-ropa', '👗'),
  ('Hogar y cocina', 'hogar-cocina', '🏠'),
  ('Belleza y salud', 'belleza-salud', '💄'),
  ('Deportes', 'deportes', '⚽'),
  ('Juguetes', 'juguetes', '🧸')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible)
SELECT
  'Auriculares Bluetooth Pro X',
  'Auriculares inalámbricos con cancelación de ruido activa, 30 horas de batería y audio de alta fidelidad.',
  18.50, 49.99,
  ARRAY['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400'],
  id, 'TechSupply MX', true
FROM categorias WHERE slug = 'electronica';

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible)
SELECT
  'Smartwatch Fit Pro',
  'Reloj inteligente con monitor cardíaco, GPS integrado, resistente al agua y pantalla AMOLED.',
  22.00, 64.99,
  ARRAY['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'],
  id, 'TechSupply MX', true
FROM categorias WHERE slug = 'electronica';

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible)
SELECT
  'Camiseta Premium Oversize',
  'Camiseta de algodón 100% oversize, ideal para todos los géneros. Disponible en 12 colores.',
  4.50, 19.99,
  ARRAY['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400'],
  id, 'ModaLatam', true
FROM categorias WHERE slug = 'moda-ropa';

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible)
SELECT
  'Set de Organizadores de Cocina',
  'Juego de 6 organizadores de bambú para cajones y gavetas. Ecológicos y resistentes.',
  8.00, 28.99,
  ARRAY['https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400'],
  id, 'HogarDeco CO', true
FROM categorias WHERE slug = 'hogar-cocina';

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible)
SELECT
  'Suero Vitamina C Facial',
  'Suero concentrado con 20% vitamina C, ácido hialurónico y niacinamida. 30ml.',
  6.00, 24.99,
  ARRAY['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400'],
  id, 'BeautyPro AR', true
FROM categorias WHERE slug = 'belleza-salud';

INSERT INTO productos (nombre, descripcion, precio_base, precio_sugerido, imagenes, categoria_id, proveedor, disponible)
SELECT
  'Mancuernas Ajustables 20kg',
  'Par de mancuernas con discos intercambiables de 1 a 10kg por lado. Mango antideslizante.',
  35.00, 89.99,
  ARRAY['https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400'],
  id, 'SportMax CL', true
FROM categorias WHERE slug = 'deportes';
