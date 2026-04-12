import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { CatalogoService } from '../../core/services/catalogo.service';
import { CreativosService } from '../../core/services/creativos.service';
import { AuthService } from '../../core/services/auth.service';
import { CatalogoFiltrosService } from '../../core/services/catalogo-filtros.service';
import { ProductoDetalleModalComponent } from './producto-detalle-modal.component';
import type { Producto, Creativo, TipoCreativo } from '../../core/models/producto.model';

export type BodegaId = 'importaciones' | 'moda';

export function bodegaDeProducto(producto: Producto): BodegaId {
  const slug = (producto.categoria?.slug ?? '').toLowerCase();
  return slug === 'moda-ropa' ? 'moda' : 'importaciones';
}

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

  abrirModal(producto: Producto) {
    this.productoModal.set(producto);
    this.catalogoService.registrarVista(producto.id).catch(() => {});
  }
  cerrarModal() { this.productoModal.set(null); }

  readonly categoriasConProductos = this.filtros.categoriasConProductos;

  seleccionarCategoria(id: string) {
    this.filtros.categoriaSeleccionada.set(this.filtros.categoriaSeleccionada() === id ? '' : id);
  }

  // ── Qué bodegas tienen productos en el listado base ──────────────────
  readonly bodegasConProductos = computed(() => {
    const todos = this.productos();
    return {
      importaciones: todos.some(p => bodegaDeProducto(p) === 'importaciones'),
      moda:          todos.some(p => bodegaDeProducto(p) === 'moda'),
    };
  });

  // ── Filtrado completo ─────────────────────────────────────────────────
  readonly productosFiltrados = computed(() => {
    let result = this.productos().filter(p => p.imagenes?.some(img => !!img?.trim()));
    const filtro  = this.filtros.filtroAsset();
    const cat     = this.filtros.categoriaSeleccionada();
    const bodega  = this.filtros.bodegaFiltro();

    if (cat)    result = result.filter(p => p.categoria_id === cat || p.categoria?.id === cat);
    if (bodega !== 'todas') result = result.filter(p => bodegaDeProducto(p) === bodega);

    if (filtro === 'todos') return result;
    return result.filter(p => {
      if (!p.creativos || p.creativos.length === 0) return false;
      if (filtro === 'video')   return p.creativos.some(c => c.tipo === 'video');
      if (filtro === 'copy')    return p.creativos.some(c => c.tipo === 'documento' || c.tipo === 'otro');
      if (filtro === 'imagen')  return p.creativos.some(c => c.tipo === 'imagen');
      if (filtro === 'ganador') return p.ganador || calcularMargen(p) >= 40;
      return true;
    });
  });

  readonly productoDestacado = computed(() => this.productosFiltrados()[0] ?? null);

  // ── Helper para template ──────────────────────────────────────────────
  bodegaDe(producto: Producto): BodegaId { return bodegaDeProducto(producto); }

  seleccionarBodega(b: 'todas' | 'importaciones' | 'moda') {
    this.filtros.bodegaFiltro.set(b);
    // Si hay solo una bodega disponible, no tiene sentido filtrar "todas"
  }

  async ngOnInit() {
    await Promise.all([this.cargarProductos(), this.cargarCategorias(), this.cargarFavoritos()]);
  }

  async cargarProductos() {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const data = await this.catalogoService.obtenerProductos({ busqueda: this.busqueda || undefined });
      this.productos.set(data);
      this.filtros.productosCatalogo.set(data);
      // Si solo hay una bodega, seleccionarla automáticamente
      const imp  = data.some(p => bodegaDeProducto(p) === 'importaciones');
      const moda = data.some(p => bodegaDeProducto(p) === 'moda');
      if (imp && !moda) this.filtros.bodegaFiltro.set('importaciones');
      else if (!imp && moda) this.filtros.bodegaFiltro.set('moda');
      else this.filtros.bodegaFiltro.set('todas');
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
      this.favoritos.set(new Set(favs.map(f => f.producto_id)));
    } catch { /* silencioso */ }
  }

  async toggleFavorito(productoId: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const esFavorito = await this.catalogoService.toggleFavorito(productoId);
      this.favoritos.update(set => {
        const nuevo = new Set(set);
        if (esFavorito) nuevo.add(productoId);
        else nuevo.delete(productoId);
        return nuevo;
      });
    } catch { /* silencioso */ }
  }

  esFavorito(id: string) { return this.favoritos().has(id); }

  stockAparente(productoId: string): number {
    const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const seed = productoId + hoy;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return 180 + Math.abs(hash) % 221; // rango 180–400
  }

  calcularMargen(producto: Producto): number { return calcularMargen(producto); }

  async descargarCreativo(creativo: Creativo) {
    try {
      const url = await this.creativosService.obtenerUrlDescarga(creativo.archivo_path);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const nombreArchivo = creativo.extension
        ? `${creativo.nombre}.${creativo.extension}`
        : creativo.nombre;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = nombreArchivo;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      if (creativo.producto_id) {
        this.catalogoService.registrarDescarga(creativo.producto_id).catch(() => {});
      }
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
  return producto.precio_final ? 50 : 0; // Sugerido = precio_final * 1.5, margen siempre 50%
}
