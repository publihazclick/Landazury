import { Injectable, signal } from '@angular/core';
import type { Categoria } from '../models/producto.model';

export type FiltroAsset = 'todos' | 'video' | 'copy' | 'imagen' | 'ganador';
export type BodegaFiltro = 'todas' | 'importaciones' | 'moda';

@Injectable({ providedIn: 'root' })
export class CatalogoFiltrosService {
  readonly filtroAsset = signal<FiltroAsset>('todos');
  readonly categoriaSeleccionada = signal<string>('');
  readonly categorias = signal<Categoria[]>([]);
  readonly bodegaFiltro = signal<BodegaFiltro>('todas');
}
