import { Component, inject, signal, OnInit, computed, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { TrustedUrlPipe } from '../../core/pipes/trusted-url.pipe';
import { ActivatedRoute } from '@angular/router';
import { CreativosService } from '../../core/services/creativos.service';
import { CatalogoService } from '../../core/services/catalogo.service';
import { AuthService } from '../../core/services/auth.service';
import { ImportarProductosComponent } from './importar-productos.component';
import type { AtributoProducto, Creativo, Producto, TipoCreativo, Categoria, EstadoProducto } from '../../core/models/producto.model';

interface FormProducto {
  nombre: string;
  descripcion: string;
  precio_base: number;
  precio_sugerido: number;
  precio_final: number;
  sku: string;
  stock: number;
  categoria_id: string;
  disponible: boolean;
  atributos: AtributoProducto[];
  link_creativos: string;
  // Dimensiones del paquete (internas — Mipaquete)
  alto_cm: number;
  ancho_cm: number;
  largo_cm: number;
  peso_kg: number;
  sucursal_id: string | null;
}

// Defaults por categoría cuando el subidor no llena las dimensiones.
// Coincide con el backfill de 20260430020000_dimensiones_y_cobro.sql.
const DIM_DEFAULTS_POR_SLUG: Record<string, { alto: number; ancho: number; largo: number; peso: number }> = {
  calzado:    { alto: 18, ancho: 21, largo: 29, peso: 0.800 },
  billeteras: { alto:  5, ancho: 15, largo: 18, peso: 0.200 },
};
const DIM_DEFAULT_GENERICO = { alto: 18, ancho: 29, largo: 30, peso: 1.000 };

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ImportarProductosComponent, TrustedUrlPipe],
  templateUrl: './inventario.component.html',
})
export class InventarioComponent implements OnInit {
  private readonly creativosService = inject(CreativosService);
  private readonly catalogoService = inject(CatalogoService);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  readonly productos = signal<Producto[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);

  // Modal importar
  readonly mostrarImportar = signal(false);

  onImportarCerrar(creados: Producto[]) {
    this.mostrarImportar.set(false);
    const n = creados.length;
    if (n > 0) {
      const cats = this.categorias();
      const nuevos = creados.map(p => ({
        ...p,
        categoria: p.categoria ?? cats.find(c => c.id === p.categoria_id),
        creativos: p.creativos ?? [],
      }));
      this.productos.update(list => [...nuevos, ...list]);
      this.exito.set(`${n} producto${n > 1 ? 's' : ''} importado${n > 1 ? 's' : ''} correctamente.`);
      setTimeout(() => this.exito.set(null), 4000);
    }
  }

  // Modal
  readonly mostrarModal = signal(false);
  readonly mostrarConfirmacionSalida = signal(false);
  readonly productoEnModal = signal<Producto | null>(null);
  readonly creativosEnModal = signal<Creativo[]>([]);
  readonly guardandoProducto = signal(false);
  readonly modoCreativos = signal<'sin' | 'url' | 'imagenes'>('sin');
  private readonly platformId = inject(PLATFORM_ID);
  readonly subiendoImagenCreativo = signal(false);
  readonly subiendoVideoCreativo = signal(false);
  readonly subiendoImagen = signal(false);
  readonly cargandoModal = signal(false);
  readonly confirmandoEliminar = signal<Producto | null>(null);
  readonly perfilesMap = signal<Map<string, string>>(new Map());

  // Búsqueda web de creativos
  readonly sugeridos = signal<Creativo[]>([]);
  readonly buscandoEnWeb = signal(false);

  // Preview de sugerido
  readonly sugeridoPreview = signal<Creativo | null>(null);
  readonly previewIdx = computed(() => {
    const s = this.sugeridoPreview();
    if (!s) return -1;
    return this.sugeridos().findIndex(x => x.id === s.id);
  });

  // Imágenes del producto (edición local antes de guardar)
  imagenesEnModal: string[] = [];
  urlsAEliminar: string[] = [];

  // Variantes / atributos
  atributoNuevoValor: Record<string, string> = {};
  atributoPersonalizadoNombre = '';

  readonly mostrarSelectorAtributo = signal(false);

  // Sucursales del subidor
  readonly sucursalesUsuario = signal<{ id: string; nombre: string; ciudad: string; direccion: string; dane_code: string }[]>([]);

  // Paleta de colores para los chips de categoría en el formulario
  private readonly PALETA_CATEGORIAS = [
    '#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4',
    '#10b981', '#84cc16', '#eab308', '#ef4444', '#14b8a6',
    '#f43f5e', '#a855f7',
  ];
  colorCategoria(i: number): string {
    return this.PALETA_CATEGORIAS[i % this.PALETA_CATEGORIAS.length];
  }
  colorCategoriaTenue(i: number): string {
    return this.colorCategoria(i) + '22';
  }

  readonly ATRIBUTOS_CONFIG: { nombre: string; icono: string; sugeridos: string[] }[] = [
    { nombre: 'Color',         icono: 'palette',      sugeridos: ['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde', 'Amarillo', 'Rosa', 'Gris', 'Dorado', 'Plateado', 'Naranja', 'Morado'] },
    { nombre: 'Talla',         icono: 'straighten',   sugeridos: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Talla única'] },
    { nombre: 'Talla Calzado', icono: 'hiking',       sugeridos: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
    { nombre: 'Material',      icono: 'texture',      sugeridos: ['Algodón', 'Poliéster', 'Cuero', 'Cuero sintético', 'Metal', 'Aluminio', 'Plástico', 'Silicona', 'Madera', 'Acero inoxidable', 'Tela'] },
    { nombre: 'Capacidad',     icono: 'water_drop',   sugeridos: ['250ml', '500ml', '1L', '2L', '5L', '64GB', '128GB', '256GB', '512GB', '1TB'] },
    { nombre: 'Pack',          icono: 'inventory_2',  sugeridos: ['1 unidad', '2 unidades', '3 unidades', '5 unidades', '10 unidades', '12 unidades', '20 unidades'] },
    { nombre: 'Voltaje',       icono: 'bolt',         sugeridos: ['110V', '220V', '110V/220V', 'USB 5V', '12V', '24V'] },
    { nombre: 'Aroma',         icono: 'spa',          sugeridos: ['Sin aroma', 'Lavanda', 'Rosa', 'Vainilla', 'Menta', 'Cítrico', 'Canela', 'Coco', 'Jazmín'] },
    { nombre: 'Estilo',        icono: 'style',        sugeridos: ['Clásico', 'Moderno', 'Casual', 'Deportivo', 'Elegante', 'Minimalista', 'Vintage', 'Urbano'] },
    { nombre: 'Género',        icono: 'wc',           sugeridos: ['Hombre', 'Mujer', 'Unisex', 'Niño', 'Niña'] },
    { nombre: 'Conectividad',  icono: 'wifi',         sugeridos: ['Bluetooth', 'WiFi', 'USB-C', 'USB-A', 'Inalámbrico', 'Con cable', 'NFC'] },
    { nombre: 'Modelo',        icono: 'devices',      sugeridos: [] },
  ];

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
    const tasks: Promise<any>[] = [this.cargarProductos(), this.cargarCategorias(), this.cargarSucursales()];
    if (this.auth.esAdmin()) tasks.push(this.cargarPerfiles());
    await Promise.all(tasks);

    // Auto-abrir modal de edición si viene de admin con ?editar=<id>
    const editarId = this.route.snapshot.queryParamMap.get('editar');
    if (editarId) {
      const producto = this.productos().find(p => p.id === editarId);
      if (producto) this.abrirEditar(producto);
    }
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

  async cargarPerfiles() {
    try {
      const data = await this.catalogoService.obtenerPerfilesInventario();
      this.perfilesMap.set(new Map(data.map(p => [p.id, p.nombre])));
    } catch {}
  }

  async cargarSucursales() {
    try {
      const suc = await this.catalogoService.obtenerSucursalesUsuario();
      this.sucursalesUsuario.set(suc);
    } catch {}
  }

  // ── Modal ───────────────────────────────────────────

  private draftKey(): string {
    return `landazury:borrador-producto:${this.auth.usuario()?.id ?? 'anon'}`;
  }

  private cargarBorradorGuardado(): { form: FormProducto; imagenes: string[] } | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const raw = localStorage.getItem(this.draftKey());
      if (!raw) return null;
      const b = JSON.parse(raw);
      if (!b?.form) return null;
      return { form: b.form as FormProducto, imagenes: Array.isArray(b.imagenes) ? b.imagenes : [] };
    } catch { return null; }
  }

  private eliminarBorradorGuardado() {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.removeItem(this.draftKey()); } catch {}
  }

  abrirCrear() {
    const borrador = this.cargarBorradorGuardado();
    this.formProducto = borrador?.form ?? this.formVacio();
    this.imagenesEnModal = borrador?.imagenes ?? [];
    this.productoEnModal.set(null);
    this.creativosEnModal.set([]);
    this.urlsAEliminar = [];
    this.modoCreativos.set('sin');
    this.limpiarArchivoModal();
    this.mostrarModal.set(true);
    if (borrador) {
      this.exito.set('Se restauró tu borrador. Continúa editando donde lo dejaste.');
      setTimeout(() => this.exito.set(null), 4000);
    }
  }

  async abrirEditar(producto: Producto) {
    const sucs = this.sucursalesUsuario();
    this.formProducto = {
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      precio_base: producto.precio_base,
      precio_sugerido: producto.precio_sugerido ?? 0,
      precio_final: producto.precio_final ?? 0,
      sku: producto.sku ?? '',
      stock: producto.stock ?? 0,
      categoria_id: producto.categoria_id ?? '',
      disponible: producto.disponible,
      atributos: producto.atributos ? JSON.parse(JSON.stringify(producto.atributos)) : [],
      link_creativos: producto.link_creativos ?? '',
      alto_cm:  producto.alto_cm  ?? 0,
      ancho_cm: producto.ancho_cm ?? 0,
      largo_cm: producto.largo_cm ?? 0,
      peso_kg:  producto.peso_kg  ?? 0,
      sucursal_id: (producto as any).sucursal_id ?? (sucs.length === 1 ? sucs[0].id : null),
    };
    this.atributoNuevoValor = {};
    this.mostrarSelectorAtributo.set(false);
    this.productoEnModal.set(producto);
    this.creativosEnModal.set(producto.creativos ?? []);
    this.sugeridos.set([]);
    this.imagenesEnModal = [...(producto.imagenes ?? [])];
    this.urlsAEliminar = [];
    // Derivar el modo de creativos desde el estado existente del producto
    if (producto.link_creativos) this.modoCreativos.set('url');
    else if ((producto.creativos?.length ?? 0) > 0) this.modoCreativos.set('imagenes');
    else this.modoCreativos.set('sin');
    this.limpiarArchivoModal();
    this.mostrarModal.set(true);
    // Recargar creativos aprobados frescos desde la BD (incluye los aprobados de internet)
    this.creativosService.obtenerCreativos({ productoId: producto.id })
      .then(c => this.creativosEnModal.set(c))
      .catch(() => {});
    // Cargar sugerencias web previas en background
    this.creativosService.obtenerSugeridos(producto.id).then(s => this.sugeridos.set(s)).catch(() => {});
  }

  /** Verifica si el formulario tiene contenido del usuario (solo relevante al crear nuevo) */
  private formTieneCambios(): boolean {
    const f = this.formProducto;
    return !!(
      f.nombre.trim() ||
      f.descripcion.trim() ||
      Number(f.precio_base) ||
      Number(f.precio_sugerido) ||
      f.sku.trim() ||
      Number(f.stock) ||
      f.categoria_id ||
      f.link_creativos.trim() ||
      (f.atributos && f.atributos.length > 0) ||
      this.imagenesEnModal.length > 0
    );
  }

  /** Intent de cerrar: si es un producto nuevo y hay cambios, pregunta primero */
  intentarCerrarModal() {
    const esNuevo = !this.productoEnModal();
    if (esNuevo && this.formTieneCambios()) {
      this.mostrarConfirmacionSalida.set(true);
      return;
    }
    this.cerrarModal();
  }

  cerrarModal() {
    this.mostrarModal.set(false);
    this.mostrarConfirmacionSalida.set(false);
    setTimeout(() => {
      this.productoEnModal.set(null);
      this.creativosEnModal.set([]);
      this.limpiarArchivoModal();
    }, 200);
  }

  guardarComoBorrador() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(this.draftKey(), JSON.stringify({
          form: this.formProducto,
          imagenes: this.imagenesEnModal,
          guardadoEn: Date.now(),
        }));
      } catch {}
    }
    this.cerrarModal();
    this.exito.set('Borrador guardado. Cuando vuelvas a "Nuevo producto" podrás seguir editándolo.');
    setTimeout(() => this.exito.set(null), 5000);
  }

  descartarYSalir() {
    this.eliminarBorradorGuardado();
    this.cerrarModal();
  }

  seguirEditando() {
    this.mostrarConfirmacionSalida.set(false);
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

      // Para poder publicar (disponible=true) se exige imagen y categoría.
      // Sin esto el producto rompe la primera vista del catálogo móvil
      // (placeholder sin imagen, sin etiqueta de categoría, bodega mal asignada).
      const tieneImagen = this.imagenesEnModal.some(url => !!url?.trim());
      const tieneCategoria = !!this.formProducto.categoria_id;
      const publicable = tieneImagen && tieneCategoria;

      // Todos los productos se auto-aprueban; el precio al dropshipper es el mismo
      // que escribió el subidor (sin recargos automáticos). El admin puede
      // sobreescribirlo manualmente si lo necesita.
      const precioBase = Number(this.formProducto.precio_base);
      const precioFinal = esAdmin && Number(this.formProducto.precio_final)
        ? Number(this.formProducto.precio_final)
        : precioBase;

      // Dimensiones: si el subidor dejó algún campo en 0 lo completamos con
      // el default por categoría para no romper la cotización Mipaquete.
      const cat = this.categorias().find(c => c.id === this.formProducto.categoria_id);
      const slug = (cat?.slug ?? '').toLowerCase();
      const def = DIM_DEFAULTS_POR_SLUG[slug] ?? DIM_DEFAULT_GENERICO;
      const alto  = Number(this.formProducto.alto_cm)  || def.alto;
      const ancho = Number(this.formProducto.ancho_cm) || def.ancho;
      const largo = Number(this.formProducto.largo_cm) || def.largo;
      const peso  = Number(this.formProducto.peso_kg)  || def.peso;

      const payload = {
        nombre: this.formProducto.nombre.trim(),
        descripcion: this.formProducto.descripcion || undefined,
        precio_base: precioBase,
        precio_sugerido: Number(this.formProducto.precio_sugerido) || undefined,
        precio_final: precioFinal,
        sku: this.formProducto.sku || undefined,
        stock: Number(this.formProducto.stock) || undefined,
        categoria_id: this.formProducto.categoria_id || undefined,
        disponible: esAdmin ? this.formProducto.disponible : publicable,
        ganador: existente?.ganador ?? false,
        exclusivo: existente?.exclusivo ?? false,
        imagenes: this.imagenesEnModal,
        estado: 'aprobado' as EstadoProducto,
        bodega_id: existente?.bodega_id ?? userId,
        vistas: existente?.vistas ?? 0,
        descargas: existente?.descargas ?? 0,
        atributos: this.formProducto.atributos,
        alto_cm:  alto,
        ancho_cm: ancho,
        largo_cm: largo,
        peso_kg:  peso,
        link_creativos: this.modoCreativos() === 'url'
          ? (this.formProducto.link_creativos || null)
          : null,
        sucursal_id: this.formProducto.sucursal_id || null,
      };

      let mensaje: string;
      if (existente) {
        await this.catalogoService.actualizarProducto(existente.id, payload);
        const cat = this.categorias().find(c => c.id === payload.categoria_id);
        this.productos.update(list => list.map(p =>
          p.id === existente.id ? { ...p, ...payload, categoria: cat } : p
        ));
        mensaje = 'Producto actualizado correctamente.';
      } else {
        const creado = await this.catalogoService.crearProducto(payload);
        const cat = this.categorias().find(c => c.id === payload.categoria_id);
        // Preservar en la vista del subidor los precios que él escribió,
        // aunque el trigger aplicar_markup_calzado los haya modificado en DB.
        // El trigger modifica precio_final y precio_sugerido; precio_base no se toca.
        this.productos.update(list => [
          {
            ...creado,
            precio_base: payload.precio_base,
            precio_final: payload.precio_final,
            precio_sugerido: payload.precio_sugerido ?? creado.precio_sugerido,
            categoria: cat,
            creativos: [] as Creativo[],
          },
          ...list,
        ]);
        this.eliminarBorradorGuardado();
        mensaje = 'Producto creado y aprobado automáticamente.';
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
      console.error('[guardarProducto] error', e);
      const msg = e?.message ?? e?.error?.message ?? JSON.stringify(e);
      this.error.set('Error al guardar: ' + msg);
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

  // ── Búsqueda web de creativos ────────────────────────

  async buscarCreativosEnWeb() {
    const producto = this.productoEnModal();
    if (!producto) return;
    this.buscandoEnWeb.set(true);
    this.error.set(null);
    try {
      const res = await this.creativosService.buscarEnWeb(producto.id);
      const sugeridos = await this.creativosService.obtenerSugeridos(producto.id);
      this.sugeridos.set(sugeridos);
      if (res.total === 0) {
        this.exito.set('No se encontraron resultados en internet para este producto.');
      } else {
        this.exito.set(`${res.imagenes} imagen${res.imagenes !== 1 ? 'es' : ''} y ${res.videos} video${res.videos !== 1 ? 's' : ''} encontrados. Revisa las sugerencias.`);
      }
      setTimeout(() => this.exito.set(null), 4000);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al buscar en internet.');
    } finally {
      this.buscandoEnWeb.set(false);
    }
  }

  async aprobarSugerido(sugerido: Creativo) {
    try {
      await this.creativosService.aprobarSugerido(sugerido.id);
      const aprobado: Creativo = { ...sugerido, estado_revision: 'aprobado', publico: true };
      this.sugeridos.update(list => list.filter(s => s.id !== sugerido.id));
      this.creativosEnModal.update(list => [aprobado, ...list]);
      const producto = this.productoEnModal();
      if (producto) {
        this.productos.update(list => list.map(p =>
          p.id === producto.id
            ? { ...p, creativos: [aprobado, ...(p.creativos ?? [])] }
            : p
        ));
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al aprobar.');
    }
  }

  async rechazarSugerido(sugerido: Creativo) {
    try {
      await this.creativosService.rechazarSugerido(sugerido.id);
      this.sugeridos.update(list => list.filter(s => s.id !== sugerido.id));
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al rechazar.');
    }
  }

  abrirPreview(s: Creativo) { this.sugeridoPreview.set(s); }
  cerrarPreview() { this.sugeridoPreview.set(null); }

  previewAnterior() {
    const idx = this.previewIdx();
    const list = this.sugeridos();
    if (idx > 0) this.sugeridoPreview.set(list[idx - 1]);
  }

  previewSiguiente() {
    const idx = this.previewIdx();
    const list = this.sugeridos();
    if (idx < list.length - 1) this.sugeridoPreview.set(list[idx + 1]);
  }

  async aprobarYCerrarPreview(s: Creativo) {
    await this.aprobarSugerido(s);
    const list = this.sugeridos();
    if (list.length > 0) this.sugeridoPreview.set(list[Math.min(this.previewIdx(), list.length - 1)]);
    else this.cerrarPreview();
  }

  async rechazarYCerrarPreview(s: Creativo) {
    const idx = this.previewIdx();
    await this.rechazarSugerido(s);
    const list = this.sugeridos();
    if (list.length === 0) { this.cerrarPreview(); return; }
    this.sugeridoPreview.set(list[Math.min(idx, list.length - 1)]);
  }

  onPreviewImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  ytVideoId(url: string): string {
    return url.match(/[?&]v=([^&]+)/)?.[1] ?? '';
  }

  // descripcion formato: "<thumbnail_url>||<texto>" para creativos web con video
  videoThumb(creativo: Creativo): string {
    const desc = creativo.descripcion ?? '';
    if (desc.includes('||')) return desc.split('||')[0];
    // YouTube fallback
    const match = creativo.archivo_url.match(/[?&]v=([^&]+)/);
    return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : '';
  }

  videoDesc(creativo: Creativo): string {
    const desc = creativo.descripcion ?? '';
    return desc.includes('||') ? desc.split('||')[1] : desc;
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
    const filesArr = Array.from(files);
    this.subiendoImagen.set(true);
    this.error.set(null);
    try {
      const resultados = await Promise.allSettled(
        filesArr.map(f => this.catalogoService.subirImagenProducto(f)),
      );
      const urls: string[] = [];
      const errores: string[] = [];
      resultados.forEach((r, i) => {
        const nombre = filesArr[i]?.name ?? `imagen-${i + 1}`;
        if (r.status === 'fulfilled') {
          urls.push(r.value);
        } else {
          const msg = r.reason?.message ?? r.reason?.error?.message ?? JSON.stringify(r.reason) ?? 'error desconocido';
          console.error('[subirImagen] falló', nombre, r.reason);
          errores.push(`${nombre} → ${msg}`);
        }
      });
      if (urls.length > 0) {
        this.imagenesEnModal = [...this.imagenesEnModal, ...urls];
        this.sincronizarColoresConImagenes();
      }
      if (errores.length > 0) {
        this.error.set(`No se pudieron subir ${errores.length} imagen(es): ${errores.join(' · ')}`);
      }
    } catch (e: any) {
      console.error('[subirImagen] error inesperado', e);
      this.error.set('Error inesperado: ' + (e?.message ?? JSON.stringify(e)));
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
    const i = this.indiceAtributoColor;
    if (i !== -1) {
      const attr = this.formProducto.atributos[i];
      const valores = attr.valores.filter((_, k) => k !== index);
      this.formProducto.atributos = this.formProducto.atributos.map((a, j) =>
        j === i ? { ...a, valores } : a
      );
    }
  }

  // ── Helpers ────────────────────────────────────────

  nombreSubidor(bodegaId?: string): string {
    if (!bodegaId) return '—';
    return this.perfilesMap().get(bodegaId) ?? '—';
  }

  get atributosDisponibles() {
    return this.ATRIBUTOS_CONFIG.filter(c =>
      !this.formProducto.atributos.some(a => a.nombre === c.nombre)
    );
  }

  // ── Color por imagen ───────────────────────────────
  // Cuando el producto tiene el atributo "Color", sus valores se mapean 1:1
  // con las imágenes del producto (imagenes[i] ↔ atributo.color.valores[i]).

  get indiceAtributoColor(): number {
    return this.formProducto.atributos.findIndex(a => /colou?r/i.test(a.nombre ?? ''));
  }

  get tieneAtributoColor(): boolean {
    return this.indiceAtributoColor !== -1;
  }

  colorDeImagenForm(idx: number): string {
    const i = this.indiceAtributoColor;
    if (i === -1) return '';
    return this.formProducto.atributos[i].valores[idx] ?? '';
  }

  setColorDeImagenForm(idx: number, valor: string) {
    const i = this.indiceAtributoColor;
    if (i === -1) return;
    const attr = this.formProducto.atributos[i];
    const valores = [...attr.valores];
    while (valores.length < this.imagenesEnModal.length) valores.push('');
    valores[idx] = valor;
    this.formProducto.atributos = this.formProducto.atributos.map((a, j) =>
      j === i ? { ...a, valores } : a
    );
  }

  private sincronizarColoresConImagenes() {
    const i = this.indiceAtributoColor;
    if (i === -1) return;
    const attr = this.formProducto.atributos[i];
    const valores = [...attr.valores];
    while (valores.length < this.imagenesEnModal.length) valores.push('');
    if (valores.length > this.imagenesEnModal.length) valores.length = this.imagenesEnModal.length;
    this.formProducto.atributos = this.formProducto.atributos.map((a, j) =>
      j === i ? { ...a, valores } : a
    );
  }

  atributoConfig(nombre: string) {
    return this.ATRIBUTOS_CONFIG.find(c => c.nombre === nombre);
  }

  atributosNoSeleccionados(atributo: AtributoProducto): string[] {
    const config = this.ATRIBUTOS_CONFIG.find(c => c.nombre === atributo.nombre);
    return (config?.sugeridos ?? []).filter(s => !atributo.valores.includes(s));
  }

  agregarAtributo(nombre: string) {
    if (this.formProducto.atributos.some(a => a.nombre === nombre)) return;
    const esColor = /colou?r/i.test(nombre);
    const valoresIniciales = esColor ? Array(this.imagenesEnModal.length).fill('') : [];
    this.formProducto.atributos = [...this.formProducto.atributos, { nombre, valores: valoresIniciales }];
    this.atributoNuevoValor[nombre] = '';
    this.mostrarSelectorAtributo.set(false);
  }

  agregarAtributoPersonalizado() {
    const nombre = this.atributoPersonalizadoNombre.trim();
    if (!nombre || this.formProducto.atributos.some(a => a.nombre === nombre)) return;
    this.agregarAtributo(nombre);
    this.atributoPersonalizadoNombre = '';
  }

  eliminarAtributo(nombre: string) {
    this.formProducto.atributos = this.formProducto.atributos.filter(a => a.nombre !== nombre);
  }

  agregarValor(atributoNombre: string, valor: string) {
    const v = valor.trim();
    if (!v) return;
    this.formProducto.atributos = this.formProducto.atributos.map(a =>
      a.nombre === atributoNombre && !a.valores.includes(v)
        ? { ...a, valores: [...a.valores, v] }
        : a
    );
    this.atributoNuevoValor[atributoNombre] = '';
  }

  eliminarValor(atributoNombre: string, valor: string) {
    this.formProducto.atributos = this.formProducto.atributos.map(a =>
      a.nombre === atributoNombre
        ? { ...a, valores: a.valores.filter(v => v !== valor) }
        : a
    );
  }

  formVacio(): FormProducto {
    const sucs = this.sucursalesUsuario();
    return {
      nombre: '', descripcion: '', precio_base: 0, precio_sugerido: 0, precio_final: 0,
      sku: '', stock: 0, categoria_id: '', disponible: false, atributos: [], link_creativos: '',
      alto_cm: 0, ancho_cm: 0, largo_cm: 0, peso_kg: 0,
      sucursal_id: sucs.length === 1 ? sucs[0].id : null,
    };
  }

  /** Aplica los defaults de dimensiones por categoría sobre el formulario actual,
   *  pero sólo en los campos que el subidor todavía no haya llenado. */
  aplicarDefaultsCategoria(categoriaId: string) {
    const cat = this.categorias().find(c => c.id === categoriaId);
    const slug = (cat?.slug ?? '').toLowerCase();
    const def = DIM_DEFAULTS_POR_SLUG[slug] ?? DIM_DEFAULT_GENERICO;
    if (!Number(this.formProducto.alto_cm))  this.formProducto.alto_cm  = def.alto;
    if (!Number(this.formProducto.ancho_cm)) this.formProducto.ancho_cm = def.ancho;
    if (!Number(this.formProducto.largo_cm)) this.formProducto.largo_cm = def.largo;
    if (!Number(this.formProducto.peso_kg))  this.formProducto.peso_kg  = def.peso;
  }

  seleccionarCategoria(catId: string) {
    this.formProducto.categoria_id = catId;
    if (catId) this.aplicarDefaultsCategoria(catId);
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
