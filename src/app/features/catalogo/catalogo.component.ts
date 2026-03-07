import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { CatalogoService } from '../../core/services/catalogo.service';
import type { Producto, Categoria } from '../../core/models/producto.model';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './catalogo.component.html',
})
export class CatalogoComponent implements OnInit {
  private readonly catalogoService = inject(CatalogoService);

  readonly productos = signal<Producto[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly favoritos = signal<Set<string>>(new Set());
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  busqueda = '';
  categoriaSeleccionada = '';

  async ngOnInit() {
    await Promise.all([this.cargarProductos(), this.cargarCategorias(), this.cargarFavoritos()]);
  }

  async cargarProductos() {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const data = await this.catalogoService.obtenerProductos({
        categoriaId: this.categoriaSeleccionada || undefined,
        busqueda: this.busqueda || undefined,
      });
      this.productos.set(data);
    } catch {
      this.error.set('No se pudieron cargar los productos. Intenta de nuevo.');
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarCategorias() {
    try {
      const data = await this.catalogoService.obtenerCategorias();
      this.categorias.set(data);
    } catch {
      // silencioso
    }
  }

  async cargarFavoritos() {
    try {
      const favs = await this.catalogoService.obtenerFavoritos();
      this.favoritos.set(new Set(favs.map((f) => f.producto_id)));
    } catch {
      // silencioso
    }
  }

  async toggleFavorito(productoId: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const esFavorito = await this.catalogoService.toggleFavorito(productoId);
      this.favoritos.update((set) => {
        const nuevo = new Set(set);
        if (esFavorito) {
          nuevo.add(productoId);
        } else {
          nuevo.delete(productoId);
        }
        return nuevo;
      });
    } catch {
      // silencioso
    }
  }

  esFavorito(id: string) {
    return this.favoritos().has(id);
  }

  calcularMargen(producto: Producto): number {
    if (!producto.precio_sugerido || producto.precio_sugerido === 0) return 0;
    return Math.round(
      ((producto.precio_sugerido - producto.precio_base) / producto.precio_base) * 100
    );
  }

  onBuscar() {
    this.cargarProductos();
  }

  onCategoriaChange() {
    this.cargarProductos();
  }
}
