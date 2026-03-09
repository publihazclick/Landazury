import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { CreativosService } from '../../core/services/creativos.service';
import { CatalogoService } from '../../core/services/catalogo.service';
import { AuthService } from '../../core/services/auth.service';
import type { Creativo, Producto, TipoCreativo, Categoria, EstadoProducto } from '../../core/models/producto.model';

interface FormProducto {
  nombre: string;
  descripcion: string;
  precio_base: number;
  precio_sugerido: number;
  precio_final: number;
  proveedor: string;
  categoria_id: string;
  disponible: boolean;
}

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './inventario.component.html',
})
export class InventarioComponent implements OnInit {
  private readonly creativosService = inject(CreativosService);
  private readonly catalogoService = inject(CatalogoService);
  readonly auth = inject(AuthService);

  readonly productos = signal<Producto[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);

  // Modal
  readonly mostrarModal = signal(false);
  readonly productoEnModal = signal<Producto | null>(null);
  readonly creativosEnModal = signal<Creativo[]>([]);
  readonly guardandoProducto = signal(false);
  readonly subiendoImagenCreativo = signal(false);
  readonly subiendoVideoCreativo = signal(false);
  readonly subiendoImagen = signal(false);
  readonly cargandoModal = signal(false);
  readonly confirmandoEliminar = signal<Producto | null>(null);

  // Imágenes del producto (edición local antes de guardar)
  imagenesEnModal: string[] = [];
  urlsAEliminar: string[] = [];

  // Forms
  formProducto: FormProducto = this.formVacio();

  // Creativo — imágenes
  archivoImagenModal: File | null = null;
  nombreImagenModal = '';
  descripcionImagenModal = '';
  publicoImagenModal = true;

  // Creativo — videos
  archivoVideoModal: File | null = null;
  nombreVideoModal = '';
  descripcionVideoModal = '';
  publicoVideoModal = true;

  // Stats
  readonly totalProductos = computed(() => this.productos().length);
  readonly productosPendientes = computed(() => this.productos().filter(p => p.estado === 'pendiente').length);
  readonly productosPublicados = computed(() => this.productos().filter(p => p.estado === 'aprobado' && p.disponible).length);
  readonly totalCreativos = computed(() => this.productos().reduce((acc, p) => acc + (p.creativos?.length ?? 0), 0));

  readonly tiposConfig: { valor: TipoCreativo; icono: string; label: string; iconColor: string; bgClass: string; chipClass: string }[] = [
    { valor: 'imagen', icono: 'image',    label: 'Imágenes', iconColor: 'text-sky-400',    bgClass: 'bg-sky-400/10 border border-sky-400/20',       chipClass: 'text-sky-400 bg-sky-400/10 border-sky-400/20' },
    { valor: 'video',  icono: 'videocam', label: 'Videos',   iconColor: 'text-purple-400', bgClass: 'bg-purple-400/10 border border-purple-400/20', chipClass: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  ];

  async ngOnInit() {
    await Promise.all([this.cargarProductos(), this.cargarCategorias()]);
  }

  async cargarProductos() {
    this.cargando.set(true);
    try {
      // Inventario solo ve sus propios productos; admin ve todos
      const bodegaId = this.auth.esInventario() ? (this.auth.usuario()?.id ?? undefined) : undefined;
      const data = await this.catalogoService.obtenerTodosProductos({ bodegaId });
      this.productos.set(data);
    } catch {
      this.error.set('No se pudieron cargar los productos.');
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarCategorias() {
    try {
      const data = await this.catalogoService.obtenerCategorias();
      this.categorias.set(data);
    } catch {}
  }

  // ── Modal ───────────────────────────────────────────

  abrirCrear() {
    this.formProducto = this.formVacio();
    this.productoEnModal.set(null);
    this.creativosEnModal.set([]);
    this.imagenesEnModal = [];
    this.urlsAEliminar = [];
    this.limpiarArchivoModal();
    this.mostrarModal.set(true);
  }

  async abrirEditar(producto: Producto) {
    this.formProducto = {
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      precio_base: producto.precio_base,
      precio_sugerido: producto.precio_sugerido ?? 0,
      precio_final: producto.precio_final ?? 0,
      proveedor: producto.proveedor ?? '',
      categoria_id: producto.categoria_id ?? '',
      disponible: producto.disponible,
    };
    this.productoEnModal.set(producto);
    this.creativosEnModal.set(producto.creativos ?? []);
    this.imagenesEnModal = [...(producto.imagenes ?? [])];
    this.urlsAEliminar = [];
    this.limpiarArchivoModal();
    this.mostrarModal.set(true);
    this.cargandoModal.set(true);
    try {
      const creativos = await this.creativosService.obtenerCreativos({ productoId: producto.id });
      this.creativosEnModal.set(creativos);
    } catch {} finally {
      this.cargandoModal.set(false);
    }
  }

  cerrarModal() {
    this.mostrarModal.set(false);
    setTimeout(() => {
      this.productoEnModal.set(null);
      this.creativosEnModal.set([]);
      this.limpiarArchivoModal();
    }, 200);
  }

  async guardarProducto() {
    if (!this.formProducto.nombre.trim() || !this.formProducto.precio_base) {
      this.error.set('Nombre y precio base son obligatorios.');
      return;
    }
    this.guardandoProducto.set(true);
    this.error.set(null);
    try {
      const existente = this.productoEnModal();
      const esAdmin = this.auth.esAdmin();
      const userId = this.auth.usuario()?.id;

      // Estado: admin auto-aprueba; inventario → pendiente (o vuelve a pendiente si edita)
      const estadoNuevo: EstadoProducto = esAdmin ? 'aprobado' : 'pendiente';

      const payload = {
        nombre: this.formProducto.nombre.trim(),
        descripcion: this.formProducto.descripcion || undefined,
        precio_base: Number(this.formProducto.precio_base),
        precio_sugerido: Number(this.formProducto.precio_sugerido) || undefined,
        precio_final: esAdmin && Number(this.formProducto.precio_final) ? Number(this.formProducto.precio_final) : undefined,
        proveedor: this.formProducto.proveedor || undefined,
        categoria_id: this.formProducto.categoria_id || undefined,
        disponible: esAdmin ? this.formProducto.disponible : false, // inventario no controla visibilidad
        ganador: existente?.ganador ?? false,
        exclusivo: existente?.exclusivo ?? false,
        imagenes: this.imagenesEnModal,
        estado: existente ? (esAdmin ? existente.estado : 'pendiente' as EstadoProducto) : estadoNuevo,
        bodega_id: existente?.bodega_id ?? userId,
        vistas: existente?.vistas ?? 0,
        descargas: existente?.descargas ?? 0,
      };

      let mensaje: string;
      if (existente) {
        await this.catalogoService.actualizarProducto(existente.id, payload);
        const cat = this.categorias().find(c => c.id === payload.categoria_id);
        this.productos.update(list => list.map(p =>
          p.id === existente.id ? { ...p, ...payload, categoria: cat } : p
        ));
        mensaje = esAdmin ? 'Producto actualizado correctamente.' : 'Producto actualizado y enviado a revisión.';
      } else {
        const creado = await this.catalogoService.crearProducto(payload);
        const cat = this.categorias().find(c => c.id === payload.categoria_id);
        this.productos.update(list => [{ ...creado, categoria: cat, creativos: [] as Creativo[] }, ...list]);
        mensaje = esAdmin ? 'Producto creado y aprobado.' : 'Producto enviado a revisión.';
      }
      // Limpiar imágenes eliminadas del storage en background
      for (const url of this.urlsAEliminar) {
        this.catalogoService.eliminarImagenProducto(url).catch(() => {});
      }
      this.urlsAEliminar = [];
      this.cerrarModal();
      this.exito.set(mensaje);
      setTimeout(() => this.exito.set(null), 4000);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al guardar el producto.');
    } finally {
      this.guardandoProducto.set(false);
    }
  }

  // ── Creativos en modal ──────────────────────────────

  onArchivoImagenModal(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.archivoImagenModal = file;
    if (!this.nombreImagenModal) {
      this.nombreImagenModal = file.name.replace(/\.[^.]+$/, '');
    }
    (event.target as HTMLInputElement).value = '';
  }

  onArchivoVideoModal(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.archivoVideoModal = file;
    if (!this.nombreVideoModal) {
      this.nombreVideoModal = file.name.replace(/\.[^.]+$/, '');
    }
    (event.target as HTMLInputElement).value = '';
  }

  async subirImagenCreativoModal() {
    const producto = this.productoEnModal();
    if (!this.archivoImagenModal || !this.nombreImagenModal.trim() || !producto) return;
    this.subiendoImagenCreativo.set(true);
    this.error.set(null);
    try {
      const creativo = await this.creativosService.subirCreativo(this.archivoImagenModal, {
        nombre: this.nombreImagenModal.trim(),
        descripcion: this.descripcionImagenModal || undefined,
        productoId: producto.id,
        publico: this.publicoImagenModal,
      });
      this.creativosEnModal.update(list => [creativo, ...list]);
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, creativos: [creativo, ...(p.creativos ?? [])] } : p
      ));
      this.archivoImagenModal = null;
      this.nombreImagenModal = '';
      this.descripcionImagenModal = '';
      this.publicoImagenModal = true;
      this.exito.set('Imagen subida correctamente.');
      setTimeout(() => this.exito.set(null), 2000);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al subir la imagen.');
    } finally {
      this.subiendoImagenCreativo.set(false);
    }
  }

  async subirVideoCreativoModal() {
    const producto = this.productoEnModal();
    if (!this.archivoVideoModal || !this.nombreVideoModal.trim() || !producto) return;
    this.subiendoVideoCreativo.set(true);
    this.error.set(null);
    try {
      const creativo = await this.creativosService.subirCreativo(this.archivoVideoModal, {
        nombre: this.nombreVideoModal.trim(),
        descripcion: this.descripcionVideoModal || undefined,
        productoId: producto.id,
        publico: this.publicoVideoModal,
      });
      this.creativosEnModal.update(list => [creativo, ...list]);
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, creativos: [creativo, ...(p.creativos ?? [])] } : p
      ));
      this.archivoVideoModal = null;
      this.nombreVideoModal = '';
      this.descripcionVideoModal = '';
      this.publicoVideoModal = true;
      this.exito.set('Video subido correctamente.');
      setTimeout(() => this.exito.set(null), 2000);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al subir el video.');
    } finally {
      this.subiendoVideoCreativo.set(false);
    }
  }

  async eliminarCreativoEnModal(creativo: Creativo) {
    try {
      await this.creativosService.eliminarCreativo(creativo.id, creativo.archivo_path);
      this.creativosEnModal.update(list => list.filter(c => c.id !== creativo.id));
      const producto = this.productoEnModal();
      if (producto) {
        this.productos.update(list => list.map(p =>
          p.id === producto.id
            ? { ...p, creativos: (p.creativos ?? []).filter(c => c.id !== creativo.id) }
            : p
        ));
      }
    } catch {
      this.error.set('No se pudo eliminar el creativo.');
    }
  }

  // ── Producto: toggle + eliminar ─────────────────────

  async toggleDisponible(producto: Producto, event: Event) {
    event.stopPropagation();
    if (!this.auth.esAdmin()) return; // solo admin controla visibilidad
    try {
      await this.catalogoService.actualizarProducto(producto.id, { disponible: !producto.disponible });
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, disponible: !p.disponible } : p
      ));
    } catch {
      this.error.set('No se pudo actualizar el estado.');
    }
  }

  async toggleGanador(producto: Producto, event: Event) {
    event.stopPropagation();
    try {
      await this.catalogoService.toggleGanador(producto.id, !producto.ganador);
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, ganador: !p.ganador } : p
      ));
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('column') || msg.includes('does not exist'))
        this.error.set('Falta ejecutar la migración SQL en Supabase (columna ganador).');
      else if (msg.includes('permission') || msg.includes('policy') || msg.includes('violates'))
        this.error.set('Sin permisos. Ejecuta supabase-migration.sql en Supabase SQL Editor.');
      else
        this.error.set('No se pudo actualizar ganador: ' + msg);
    }
  }

  async toggleExclusivo(producto: Producto, event: Event) {
    event.stopPropagation();
    try {
      await this.catalogoService.toggleExclusivo(producto.id, !producto.exclusivo);
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, exclusivo: !p.exclusivo } : p
      ));
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('column') || msg.includes('does not exist'))
        this.error.set('Falta ejecutar la migración SQL en Supabase (columna exclusivo).');
      else if (msg.includes('permission') || msg.includes('policy') || msg.includes('violates'))
        this.error.set('Sin permisos. Ejecuta supabase-migration.sql en Supabase SQL Editor.');
      else
        this.error.set('No se pudo actualizar exclusivo: ' + msg);
    }
  }

  confirmarEliminar(producto: Producto, event: Event) {
    event.stopPropagation();
    this.confirmandoEliminar.set(producto);
  }

  cancelarEliminar() {
    this.confirmandoEliminar.set(null);
  }

  async eliminarProducto() {
    const producto = this.confirmandoEliminar();
    if (!producto) return;
    try {
      await this.catalogoService.eliminarProducto(producto.id);
      this.productos.update(list => list.filter(p => p.id !== producto.id));
      this.exito.set(`"${producto.nombre}" eliminado.`);
      setTimeout(() => this.exito.set(null), 3000);
      this.confirmandoEliminar.set(null);
    } catch {
      this.error.set('No se pudo eliminar el producto.');
    }
  }

  // ── Imágenes del producto ──────────────────────────

  async subirImagen(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    this.subiendoImagen.set(true);
    this.error.set(null);
    try {
      for (const file of Array.from(files)) {
        const url = await this.catalogoService.subirImagenProducto(file);
        this.imagenesEnModal = [...this.imagenesEnModal, url];
      }
    } catch {
      this.error.set('Error al subir la imagen.');
    } finally {
      this.subiendoImagen.set(false);
      input.value = '';
    }
  }

  quitarImagen(index: number) {
    const url = this.imagenesEnModal[index];
    // Solo marcar para eliminar si es una URL de nuestro storage
    if (url.includes('imagenes-productos')) {
      this.urlsAEliminar = [...this.urlsAEliminar, url];
    }
    this.imagenesEnModal = this.imagenesEnModal.filter((_, i) => i !== index);
  }

  // ── Helpers ────────────────────────────────────────

  formVacio(): FormProducto {
    return { nombre: '', descripcion: '', precio_base: 0, precio_sugerido: 0, precio_final: 0, proveedor: '', categoria_id: '', disponible: false };
  }

  limpiarArchivoModal() {
    this.archivoImagenModal = null;
    this.nombreImagenModal = '';
    this.descripcionImagenModal = '';
    this.publicoImagenModal = true;
    this.archivoVideoModal = null;
    this.nombreVideoModal = '';
    this.descripcionVideoModal = '';
    this.publicoVideoModal = true;
  }

  primeraImagen(producto: Producto): string | null {
    return producto.creativos?.find(c => c.tipo === 'imagen')?.archivo_url
      ?? producto.imagenes?.[0]
      ?? null;
  }

  tiposConContenido(producto: Producto) {
    return this.tiposConfig.filter(t =>
      (producto.creativos ?? []).some(c => c.tipo === t.valor)
    );
  }

  contarTipo(producto: Producto, tipo: TipoCreativo): number {
    return (producto.creativos ?? []).filter(c => c.tipo === tipo).length;
  }

  tipoInfo(tipo: TipoCreativo) {
    return this.tiposConfig.find(t => t.valor === tipo) ?? this.tiposConfig[4];
  }

  tamano(bytes?: number) {
    return this.creativosService.formatearTamano(bytes);
  }

  badgeEstado(estado: string): string {
    const clases: Record<string, string> = {
      pendiente: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
      aprobado:  'bg-green-500/20 border-green-500/40 text-green-300',
      rechazado: 'bg-red-500/20 border-red-500/40 text-red-300',
    };
    return clases[estado] ?? clases['pendiente'];
  }

  iconoEstado(estado: string): string {
    const iconos: Record<string, string> = {
      pendiente: 'schedule',
      aprobado:  'check_circle',
      rechazado: 'cancel',
    };
    return iconos[estado] ?? 'schedule';
  }
}
