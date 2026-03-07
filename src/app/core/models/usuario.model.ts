export type Rol = 'admin' | 'inventario' | 'usuario';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  pais?: string;
  telefono?: string;
  avatar_url?: string;
  creado_en: string;
}

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  pais?: string;
  telefono?: string;
  avatar_url?: string;
  creado_en: string;
}
