export interface Categoria {
  id: string;
  nombre: string;
  slug: string;
  icono?: string;
}

export type TipoCreativo = 'imagen' | 'video' | 'pdf' | 'documento' | 'otro';

export interface Creativo {
  id: string;
  nombre: string;
  descripcion?: string;
  tipo: TipoCreativo;
  archivo_url: string;
  archivo_path: string | null;
  tamano?: number;
  extension?: string;
  producto_id?: string;
  subido_por?: string;
  publico: boolean;
  creado_en: string;
  fuente?: 'upload' | 'web';
  estado_revision?: 'sugerido' | 'aprobado' | 'rechazado';
  fuente_nombre?: string;
}

export type EstadoProducto = 'pendiente' | 'aprobado' | 'rechazado';

export interface AtributoProducto {
  nombre: string;
  valores: string[];
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion?: string;
  precio_base: number;        // Costo fijado por la bodega
  precio_sugerido?: number;   // Estimado de la bodega (referencia)
  precio_final?: number;      // Precio final fijado por el admin → lo que ve el usuario
  imagenes: string[];
  categoria_id?: string;
  categoria?: Categoria;
  sku?: string;
  stock?: number;
  disponible: boolean;
  ganador: boolean;
  exclusivo: boolean;
  atributos?: AtributoProducto[];
  link_creativos?: string | null;
  estado: EstadoProducto;
  bodega_id?: string;
  vistas: number;
  descargas: number;
  creado_en: string;
  creativos?: Creativo[];
  // Dimensiones físicas del paquete — internas, usadas para cotizar Mipaquete.
  // Defaults por categoría se aplican en el backfill de la migración cuando
  // el subidor no las llena.
  alto_cm?: number;
  ancho_cm?: number;
  largo_cm?: number;
  peso_kg?: number;
}

export interface Favorito {
  id: string;
  usuario_id: string;
  producto_id: string;
  producto?: Producto;
  creado_en: string;
}
