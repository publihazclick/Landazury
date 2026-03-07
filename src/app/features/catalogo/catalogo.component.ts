import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { CatalogoService } from '../../core/services/catalogo.service';
import { CreativosService } from '../../core/services/creativos.service';
import { AuthService } from '../../core/services/auth.service';
import type { Producto, Categoria, Creativo, TipoCreativo } from '../../core/models/producto.model';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './catalogo.component.html',
})
export class CatalogoComponent implements OnInit {
  private readonly catalogoService = inject(CatalogoService);
  private readonly creativosService = inject(CreativosService);
  readonly auth = inject(AuthService);

  readonly productos = signal<Producto[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly favoritos = signal<Set<string>>(new Set());
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly filtroAsset = signal<string>('todos');

  busqueda = '';
  categoriaSeleccionada = '';

  readonly productosFiltrados = computed(() => {
    const todos = this.productos();
    const filtro = this.filtroAsset();
    if (filtro === 'todos') return todos;
    return todos.filter((p) => {
      if (!p.creativos || p.creativos.length === 0) return false;
      if (filtro === 'video') return p.creativos.some((c) => c.tipo === 'video');
      if (filtro === 'copy') return p.creativos.some((c) => c.tipo === 'documento' || c.tipo === 'otro');
      if (filtro === 'imagen') return p.creativos.some((c) => c.tipo === 'imagen');
      if (filtro === 'ganador') return calcularMargen(p) >= 40;
      return true;
    });
  });

  readonly productoDestacado = computed(() => this.productosFiltrados()[0] ?? null);

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
        if (esFavorito) nuevo.add(productoId);
        else nuevo.delete(productoId);
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
    return calcularMargen(producto);
  }

  async descargarCreativo(creativo: Creativo) {
    try {
      const url = await this.creativosService.obtenerUrlDescarga(creativo.archivo_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = creativo.nombre;
      a.click();
    } catch {
      // silencioso
    }
  }

  iconoTipo(creativo: Creativo): string {
    return this.creativosService.iconoTipo(creativo.tipo);
  }

  iconoMaterial(tipo: TipoCreativo): string {
    const map: Record<TipoCreativo, string> = {
      video: 'videocam',
      imagen: 'image',
      pdf: 'picture_as_pdf',
      documento: 'article',
      otro: 'folder_zip',
    };
    return map[tipo] ?? 'download';
  }

  onBuscar() {
    this.cargarProductos();
  }

  onCategoriaChange() {
    this.cargarProductos();
  }
}

function calcularMargen(producto: Producto): number {
  if (!producto.precio_sugerido || producto.precio_sugerido === 0) return 0;
  return Math.round(
    ((producto.precio_sugerido - producto.precio_base) / producto.precio_base) * 100
  );
}
