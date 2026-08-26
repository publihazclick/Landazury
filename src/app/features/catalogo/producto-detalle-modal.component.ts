import { Component, Input, Output, EventEmitter, OnInit, inject, signal, PLATFORM_ID, HostListener } from '@angular/core';
import { isPlatformBrowser, DecimalPipe } from '@angular/common';
import { TrustedUrlPipe } from '../../core/pipes/trusted-url.pipe';
import { CreativosService } from '../../core/services/creativos.service';
import { AuthService } from '../../core/services/auth.service';
import type { Producto, Creativo } from '../../core/models/producto.model';

@Component({
  selector: 'app-producto-detalle-modal',
  standalone: true,
  imports: [DecimalPipe, TrustedUrlPipe],
  templateUrl: './producto-detalle-modal.component.html',
})
export class ProductoDetalleModalComponent implements OnInit {
  @Input() producto!: Producto;
  @Output() cerrar = new EventEmitter<void>();
  @Output() hacerPedido = new EventEmitter<Producto>();

  private readonly creativosService = inject(CreativosService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly auth = inject(AuthService);

  readonly descargando = signal<string[]>([]);
  readonly descargandoLote = signal<'imagenes' | 'videos' | null>(null);
  readonly copiado = signal<'nombre' | 'descripcion' | null>(null);
  readonly toastMsg = signal<{ texto: string; ok: boolean } | null>(null);
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

  abrirLightbox(idx: number) {
    const yaAbierto = this.fotoLightboxIdx() !== null;
    this.fotoLightboxIdx.set(idx);
    if (!yaAbierto && isPlatformBrowser(this.platformId)) {
      history.pushState({ modal: 'lightbox' }, '');
    }
  }

  cerrarLightbox() {
    if (this.fotoLightboxIdx() === null) return;
    this.fotoLightboxIdx.set(null);
    if (isPlatformBrowser(this.platformId) && history.state?.modal === 'lightbox') {
      history.back();
    }
  }

  @HostListener('window:popstate')
  onPopStateLightbox() {
    if (this.fotoLightboxIdx() !== null) {
      this.fotoLightboxIdx.set(null);
    } else if (this.creativoVisor()) {
      this.creativoVisor.set(null);
    }
  }

  navegarLightbox(dir: 1 | -1) {
    const actual = this.fotoLightboxIdx();
    if (actual === null) return;
    const n = this.fotosProducto.length;
    if (n === 0) return;
    this.fotoLightboxIdx.set((actual + dir + n) % n);
  }

  seleccionarImagenPrincipal(idx: number) { this.imagenPrincipalIdx.set(idx); }

  abrirVisor(creativo: Creativo) {
    const yaAbierto = this.creativoVisor() !== null;
    this.creativoVisor.set(creativo);
    if (!yaAbierto && isPlatformBrowser(this.platformId)) {
      history.pushState({ modal: 'visor' }, '');
    }
  }
  cerrarVisor() {
    if (!this.creativoVisor()) return;
    this.creativoVisor.set(null);
    if (isPlatformBrowser(this.platformId) && history.state?.modal === 'visor') {
      history.back();
    }
  }

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
    if (this.urlsFailed.has(creativo.id)) return;
    if (!creativo.archivo_path) return; // externo: URL pública ya es directa
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

  /** Link de WhatsApp con mensaje pre-llenado: saludo + referencia + imagen actual del producto */
  get urlWhatsapp(): string {
    const numero = '573148487506';
    const imagen = this.fotosProducto[this.imagenPrincipalIdx()] ?? this.producto.imagenes?.[0] ?? '';
    const refParts: string[] = [];
    if (this.producto.sku) refParts.push(`SKU: ${this.producto.sku}`);
    refParts.push(`Nombre: ${this.producto.nombre}`);
    const ref = refParts.join(' — ');
    const lineas = [
      'Hola LANDAZURY, estoy interesado/a en vender este producto.',
      '',
      ref,
    ];
    if (imagen) {
      lineas.push('');
      lineas.push(`Foto: ${imagen}`);
    }
    const texto = encodeURIComponent(lineas.join('\n'));
    return `https://wa.me/${numero}?text=${texto}`;
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
    return this.producto.precio_sugerido ?? this.producto.precio_final ?? 0;
  }

  get stockAparente(): number {
    const esCalzado = (this.producto.categoria?.slug ?? '').toLowerCase() === 'calzado';
    const seed = esCalzado
      ? `${this.producto.id}-${this.imagenPrincipalIdx()}`
      : this.producto.id + new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    if (esCalzado) {
      // Rango 4002 - 4999 inclusive (998 valores posibles)
      return 4002 + Math.abs(hash) % 998;
    }
    return 180 + Math.abs(hash) % 221;
  }

  tamano(bytes?: number): string {
    return this.creativosService.formatearTamano(bytes);
  }

  esYoutube(creativo: Creativo): boolean {
    return creativo.extension === 'youtube';
  }

  videoThumb(creativo: Creativo): string {
    const desc = creativo.descripcion ?? '';
    if (desc.includes('||')) return desc.split('||')[0];
    const match = creativo.archivo_url?.match(/[?&]v=([^&]+)/);
    return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : '';
  }

  ytEmbedUrl(creativo: Creativo): string {
    const match = creativo.archivo_url?.match(/[?&]v=([^&]+)/);
    const videoId = match?.[1] ?? '';
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  }

  private mostrarToast(texto: string, ok = true) {
    this.toastMsg.set({ texto, ok });
    setTimeout(() => this.toastMsg.set(null), 3500);
  }

  estaDescargando(id: string) { return this.descargando().includes(id); }

  async descargar(creativo: Creativo) {
    if (this.estaDescargando(creativo.id)) return;
    this.descargando.update(ids => [...ids, creativo.id]);
    this.mostrarToast('Descargando…', true);
    try {
      await this.ejecutarDescarga(creativo);
    } catch (e: any) {
      this.mostrarToast('Error al descargar', false);
    } finally {
      this.descargando.update(ids => ids.filter(id => id !== creativo.id));
    }
  }

  async descargarTodos(tipo: 'imagenes' | 'videos') {
    if (this.descargandoLote()) return;
    const lista = tipo === 'imagenes' ? this.imagenes : this.videos;
    if (lista.length === 0) return;
    this.descargandoLote.set(tipo);
    let completados = 0;
    let errores = 0;
    for (const creativo of lista) {
      this.mostrarToast(`Descargando ${completados + 1} de ${lista.length}…`, true);
      try {
        await this.ejecutarDescarga(creativo);
        completados++;
      } catch {
        errores++;
      }
      await new Promise(r => setTimeout(r, 400));
    }
    this.descargandoLote.set(null);
    if (errores === 0) {
      this.mostrarToast(`¡${completados} ${tipo} descargadas!`, true);
    } else {
      this.mostrarToast(`${completados} descargadas, ${errores} fallaron`, false);
    }
  }

  private async ejecutarDescarga(creativo: Creativo) {
    const ext = creativo.extension || 'jpg';
    const nombreArchivo = `${creativo.nombre.replace(/[^\w\-. ]/g, '_')}.${ext}`;

    // Videos YouTube y videos web externos: abrir en nueva pestaña
    if (this.esYoutube(creativo) || (creativo.tipo === 'video' && creativo.fuente === 'web')) {
      window.open(creativo.archivo_url, '_blank', 'noopener,noreferrer');
      this.mostrarToast('Video abierto en nueva pestaña', true);
      return;
    }

    let blob: Blob;

    if (creativo.archivo_path) {
      // Imagen/video subido a Supabase Storage → URL firmada, mismo origen
      const url = await this.creativosService.obtenerUrlDescarga(creativo.archivo_path);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blob = await res.blob();
    } else {
      // Imagen externa (Google, e-commerce, etc.) → proxy server-side para evitar CORS
      blob = await this.creativosService.descargarExterno(creativo.archivo_url, nombreArchivo);
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    this.mostrarToast('¡Descarga completa!', true);
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
