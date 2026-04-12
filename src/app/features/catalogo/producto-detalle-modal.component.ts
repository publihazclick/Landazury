import { Component, Input, Output, EventEmitter, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DecimalPipe } from '@angular/common';
import { CreativosService } from '../../core/services/creativos.service';
import type { Producto, Creativo } from '../../core/models/producto.model';

@Component({
  selector: 'app-producto-detalle-modal',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './producto-detalle-modal.component.html',
})
export class ProductoDetalleModalComponent implements OnInit {
  @Input() producto!: Producto;
  @Output() cerrar = new EventEmitter<void>();

  private readonly creativosService = inject(CreativosService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly descargando = signal<string[]>([]);
  readonly descargandoLote = signal<'imagenes' | 'videos' | null>(null);
  readonly copiado = signal<'nombre' | 'descripcion' | null>(null);
  // signed URLs: se cargan al vuelo cuando la URL pública falla
  readonly urlsSigned = signal<Record<string, string>>({});
  readonly urlsFailed = new Set<string>();
  readonly creativoVisor = signal<Creativo | null>(null);

  // Galería de fotos del producto (producto.imagenes[])
  readonly imagenPrincipalIdx = signal(0);
  readonly fotoLightboxIdx = signal<number | null>(null);

  get fotosProducto(): string[] {
    return (this.producto.imagenes ?? []).filter(url => !!url?.trim());
  }

  /** Atributo de colores del producto (si existe), coincidiendo por nombre. */
  get atributoColores(): { nombre: string; valores: string[] } | null {
    const attrs = this.producto.atributos ?? [];
    return attrs.find(a => /colou?r/i.test(a.nombre ?? '')) ?? null;
  }

  /** Categoría elegible para mostrar colores por imagen (moda o calzado). */
  get categoriaUsaColorPorImagen(): boolean {
    const slug = (this.producto.categoria?.slug ?? '').toLowerCase();
    return slug.includes('moda') || slug.includes('ropa') || slug.includes('calzado');
  }

  /** True cuando tiene sentido mapear imagen ↔ color 1 a 1. */
  get tieneColoresPorImagen(): boolean {
    const attr = this.atributoColores;
    if (!attr) return false;
    if (!this.categoriaUsaColorPorImagen) return false;
    return attr.valores.length === this.fotosProducto.length && attr.valores.length > 0;
  }

  colorDeImagen(idx: number): string | null {
    if (!this.tieneColoresPorImagen) return null;
    return this.atributoColores?.valores[idx] ?? null;
  }

  seleccionarColor(idx: number) {
    if (!this.tieneColoresPorImagen) return;
    this.imagenPrincipalIdx.set(idx);
  }

  abrirLightbox(idx: number) { this.fotoLightboxIdx.set(idx); }
  cerrarLightbox() { this.fotoLightboxIdx.set(null); }

  navegarLightbox(dir: 1 | -1) {
    const actual = this.fotoLightboxIdx();
    if (actual === null) return;
    const n = this.fotosProducto.length;
    if (n === 0) return;
    this.fotoLightboxIdx.set((actual + dir + n) % n);
  }

  seleccionarImagenPrincipal(idx: number) { this.imagenPrincipalIdx.set(idx); }

  abrirVisor(creativo: Creativo) { this.creativoVisor.set(creativo); }
  cerrarVisor() { this.creativoVisor.set(null); }

  navegarVisor(dir: 1 | -1) {
    const actual = this.creativoVisor();
    if (!actual) return;
    const lista = actual.tipo === 'imagen' ? this.imagenes : this.videos;
    const idx = lista.findIndex(c => c.id === actual.id);
    const siguiente = lista[(idx + dir + lista.length) % lista.length];
    this.creativoVisor.set(siguiente);
  }

  ngOnInit() {}

  displayUrl(creativo: Creativo): string {
    return this.urlsSigned()[creativo.id] ?? creativo.archivo_url;
  }

  // Llamado desde (error) en <img> y <video> cuando la URL pública falla
  async onMediaError(creativo: Creativo, el: HTMLImageElement | HTMLVideoElement) {
    if (this.urlsFailed.has(creativo.id)) return; // ya intentamos, evitar bucle
    this.urlsFailed.add(creativo.id);
    try {
      const url = await this.creativosService.obtenerUrlDescarga(creativo.archivo_path);
      this.urlsSigned.update(prev => ({ ...prev, [creativo.id]: url }));
      el.src = url;
    } catch { /* silencioso */ }
  }

  get imagenes(): Creativo[] {
    return (this.producto.creativos ?? []).filter(c => c.tipo === 'imagen');
  }

  get videos(): Creativo[] {
    return (this.producto.creativos ?? []).filter(c => c.tipo === 'video');
  }

  get margen(): number {
    const base = this.producto.precio_final ?? 0;
    if (base === 0) return 0;
    const ganancia = this.precioSugerido - base;
    return Math.max(0, Math.round((ganancia / base) * 100));
  }

  get precioSugerido(): number {
    const slug = (this.producto.categoria?.slug ?? '').toLowerCase();
    if (slug === 'calzado') {
      return (this.producto.precio_base ?? 0) + 68000;
    }
    return (this.producto.precio_final ?? 0) * 1.5;
  }

  get stockAparente(): number {
    const hoy = new Date().toISOString().slice(0, 10);
    const seed = this.producto.id + hoy;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return 180 + Math.abs(hash) % 221;
  }

  tamano(bytes?: number): string {
    return this.creativosService.formatearTamano(bytes);
  }

  estaDescargando(id: string) { return this.descargando().includes(id); }

  async descargar(creativo: Creativo) {
    if (this.estaDescargando(creativo.id)) return;
    this.descargando.update(ids => [...ids, creativo.id]);
    try {
      await this.ejecutarDescarga(creativo);
    } catch { /* silencioso */ } finally {
      this.descargando.update(ids => ids.filter(id => id !== creativo.id));
    }
  }

  async descargarTodos(tipo: 'imagenes' | 'videos') {
    if (this.descargandoLote()) return;
    const lista = tipo === 'imagenes' ? this.imagenes : this.videos;
    if (lista.length === 0) return;
    this.descargandoLote.set(tipo);
    try {
      for (const creativo of lista) {
        await this.ejecutarDescarga(creativo);
        await new Promise(r => setTimeout(r, 300));
      }
    } catch { /* silencioso */ } finally {
      this.descargandoLote.set(null);
    }
  }

  private async ejecutarDescarga(creativo: Creativo) {
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
  }

  async copiar(campo: 'nombre' | 'descripcion') {
    if (!isPlatformBrowser(this.platformId)) return;
    const texto = campo === 'nombre' ? this.producto.nombre : (this.producto.descripcion ?? '');
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(campo);
      setTimeout(() => this.copiado.set(null), 2000);
    } catch { /* silencioso */ }
  }

  onBackdrop(event: MouseEvent) {
    if ((event.target as HTMLElement).dataset['backdrop']) this.cerrar.emit();
  }

  abrirLink(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
