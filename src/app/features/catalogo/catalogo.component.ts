import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { CatalogoService } from '../../core/services/catalogo.service';
import { CreativosService } from '../../core/services/creativos.service';
import { AuthService } from '../../core/services/auth.service';
import { CatalogoFiltrosService } from '../../core/services/catalogo-filtros.service';
import { ProductoDetalleModalComponent } from './producto-detalle-modal.component';
import type { Producto, Creativo, TipoCreativo } from '../../core/models/producto.model';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, ProductoDetalleModalComponent],
  templateUrl: './catalogo.component.html',
})
export class CatalogoComponent implements OnInit {
  private readonly catalogoService = inject(CatalogoService);
  private readonly creativosService = inject(CreativosService);
  readonly auth = inject(AuthService);
  readonly filtros = inject(CatalogoFiltrosService);

  readonly productos = signal<Producto[]>([]);
  readonly favoritos = signal<Set<string>>(new Set());
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly productoModal = signal<Producto | null>(null);

  busqueda = '';

  abrirModal(producto: Producto) { this.productoModal.set(producto); }
  cerrarModal() { this.productoModal.set(null); }

  readonly productosFiltrados = computed(() => {
    let result = this.productos();
    const filtro = this.filtros.filtroAsset();
    const cat = this.filtros.categoriaSeleccionada();

    if (cat) result = result.filter((p) => (p as any).categoria_id === cat || p.categoria?.id === cat);

    if (filtro === 'todos') return result;
    return result.filter((p) => {
      if (!p.creativos || p.creativos.length === 0) return false;
      if (filtro === 'video')   return p.creativos.some((c) => c.tipo === 'video');
      if (filtro === 'copy')    return p.creativos.some((c) => c.tipo === 'documento' || c.tipo === 'otro');
      if (filtro === 'imagen')  return p.creativos.some((c) => c.tipo === 'imagen');
      if (filtro === 'ganador') return p.ganador || calcularMargen(p) >= 40;
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
      const data = await this.catalogoService.obtenerProductos({ busqueda: this.busqueda || undefined });
      this.productos.set(data);
    } catch {
      this.error.set('No se pudieron cargar los productos. Intenta de nuevo.');
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarCategorias() {
    if (this.filtros.categorias().length > 0) return;
    try {
      const data = await this.catalogoService.obtenerCategorias();
      this.filtros.categorias.set(data);
    } catch { /* silencioso */ }
  }

  async cargarFavoritos() {
    try {
      const favs = await this.catalogoService.obtenerFavoritos();
      this.favoritos.set(new Set(favs.map((f) => f.producto_id)));
    } catch { /* silencioso */ }
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
    } catch { /* silencioso */ }
  }

  esFavorito(id: string) { return this.favoritos().has(id); }

  calcularMargen(producto: Producto): number { return calcularMargen(producto); }

  async descargarCreativo(creativo: Creativo) {
    try {
      const url = await this.creativosService.obtenerUrlDescarga(creativo.archivo_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = creativo.nombre;
      a.click();
    } catch { /* silencioso */ }
  }

  iconoMaterial(tipo: TipoCreativo): string {
    const map: Record<TipoCreativo, string> = {
      video: 'videocam', imagen: 'image', pdf: 'picture_as_pdf', documento: 'article', otro: 'folder_zip',
    };
    return map[tipo] ?? 'download';
  }

  onBuscar() { this.cargarProductos(); }
}

function calcularMargen(producto: Producto): number {
  if (!producto.precio_sugerido || producto.precio_sugerido === 0) return 0;
  return Math.round(((producto.precio_sugerido - producto.precio_base) / producto.precio_base) * 100);
}
