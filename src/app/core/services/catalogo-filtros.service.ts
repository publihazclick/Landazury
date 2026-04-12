import { Injectable, signal, computed } from '@angular/core';
import type { Categoria, Producto } from '../models/producto.model';

export type FiltroAsset = 'todos' | 'video' | 'copy' | 'imagen' | 'ganador';
export type BodegaFiltro = 'todas' | 'importaciones' | 'moda';

function bodegaDeProducto(p: Producto): 'importaciones' | 'moda' {
  const slug = (p.categoria?.slug ?? '').toLowerCase();
  return slug === 'moda-ropa' ? 'moda' : 'importaciones';
}

@Injectable({ providedIn: 'root' })
export class CatalogoFiltrosService {
  readonly filtroAsset = signal<FiltroAsset>('todos');
  readonly categoriaSeleccionada = signal<string>('');
  readonly categorias = signal<Categoria[]>([]);
  readonly bodegaFiltro = signal<BodegaFiltro>('todas');

  readonly productosCatalogo = signal<Producto[]>([]);

  readonly categoriasConProductos = computed<Categoria[]>(() => {
    const bodega = this.bodegaFiltro();
    const prods = this.productosCatalogo().filter(p => {
      if (!p.imagenes?.some(img => !!img?.trim())) return false;
      if (bodega !== 'todas' && bodegaDeProducto(p) !== bodega) return false;
      return true;
    });
    const catMap = new Map<string, Categoria>();
    for (const p of prods) {
      const cat = p.categoria;
      if (cat?.id && cat.nombre) catMap.set(cat.id, cat);
    }
    return Array.from(catMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  });
}
