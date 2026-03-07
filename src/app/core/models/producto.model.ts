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
  archivo_path: string;
  tamano?: number;
  extension?: string;
  producto_id?: string;
  subido_por?: string;
  publico: boolean;
  creado_en: string;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion?: string;
  precio_base: number;
  precio_sugerido?: number;
  imagenes: string[];
  categoria_id?: string;
  categoria?: Categoria;
  proveedor?: string;
  disponible: boolean;
  creado_en: string;
  creativos?: Creativo[];
}

export interface Favorito {
  id: string;
  usuario_id: string;
  producto_id: string;
  producto?: Producto;
  creado_en: string;
}
