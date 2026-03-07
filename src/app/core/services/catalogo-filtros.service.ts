import { Injectable, signal } from '@angular/core';
import type { Categoria } from '../models/producto.model';

export type FiltroAsset = 'todos' | 'video' | 'copy' | 'imagen' | 'ganador';

@Injectable({ providedIn: 'root' })
export class CatalogoFiltrosService {
  readonly filtroAsset = signal<FiltroAsset>('todos');
  readonly categoriaSeleccionada = signal<string>('');
  readonly categorias = signal<Categoria[]>([]);
}
