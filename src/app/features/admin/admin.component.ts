import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CatalogoService } from '../../core/services/catalogo.service';
import { AuthService } from '../../core/services/auth.service';
import type { Perfil, Rol } from '../../core/models/usuario.model';
import type { Producto, Categoria, EstadoProducto } from '../../core/models/producto.model';

interface FormEdicion {
  nombre: string;
  pais: string;
  telefono: string;
}

interface FormRevision {
  precio_base: number;
  precio_final: number;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, DecimalPipe, TitleCasePipe, RouterLink],
  templateUrl: './admin.component.html',
})
export class AdminComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly catalogoService = inject(CatalogoService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  // ── Usuarios ────────────────────────────────────────
  readonly usuarios = signal<Perfil[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);
  readonly tabActivo = signal<'usuarios' | 'productos' | 'estadisticas'>('usuarios');
  readonly filtroRol = signal<Rol | 'todos'>('todos');
  readonly usuarioEditando = signal<Perfil | null>(null);
  readonly confirmandoEliminar = signal<Perfil | null>(null);
  readonly guardandoEdicion = signal(false);
  readonly eliminando = signal(false);

  busqueda = '';
  formEdicion: FormEdicion = { nombre: '', pais: '', telefono: '' };

  readonly roles: { valor: Rol; etiqueta: string; descripcion: string; icono: string }[] = [
    { valor: 'admin',      etiqueta: 'Admin',      descripcion: 'Acceso total al sistema',            icono: 'shield_person' },
    { valor: 'inventario', etiqueta: 'Inventario',  descripcion: 'Gestiona productos y creativos',     icono: 'inventory_2' },
    { valor: 'usuario',    etiqueta: 'Usuario',     descripcion: 'Visualiza el catálogo dropshipping', icono: 'person' },
  ];

  readonly totalUsuarios = computed(() => this.usuarios().length);

  readonly filtroChips = computed(() => [
    { valor: 'todos' as const,      etiqueta: 'Todos',      count: this.usuarios().length,         icono: 'group' },
    { valor: 'admin' as const,      etiqueta: 'Admin',      count: this.contarRol('admin'),        icono: 'shield_person' },
    { valor: 'inventario' as const, etiqueta: 'Inventario', count: this.contarRol('inventario'),   icono: 'inventory_2' },
    { valor: 'usuario' as const,    etiqueta: 'Usuario',    count: this.contarRol('usuario'),      icono: 'person' },
  ]);

  readonly distribucion = computed(() =>
    this.roles.map((r) => ({
      ...r,
      cantidad: this.contarRol(r.valor),
      porcentaje: this.usuarios().length
        ? Math.round((this.contarRol(r.valor) / this.usuarios().length) * 100)
        : 0,
    }))
  );

  get usuariosFiltrados(): Perfil[] {
    const q = this.busqueda.toLowerCase().trim();
    const rol = this.filtroRol();
    return this.usuarios().filter((u) => {
      const matchQ = !q || u.nombre.toLowerCase().includes(q);
      const matchRol = rol === 'todos' || u.rol === rol;
      return matchQ && matchRol;
    });
  }

  // ── Productos ────────────────────────────────────────
  readonly productos = signal<Producto[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly cargandoProductos = signal(false);
  readonly filtroEstado = signal<'todos' | EstadoProducto>('pendiente');
  readonly productoRevisando = signal<Producto | null>(null);
  readonly guardandoRevision = signal(false);
  readonly confirmandoEliminarProducto = signal<Producto | null>(null);
  readonly editandoPreciosId = signal<string | null>(null);
  readonly guardandoPrecios = signal(false);
  busquedaProductos = '';
  formRevision: FormRevision = { precio_base: 0, precio_final: 0 };
  precioFinalInput = 0;

  readonly chipsFiltroEstado = computed(() => [
    { valor: 'todos' as const,      etiqueta: 'Todos',     count: this.productos().length,                                       color: 'text-slate-300 border-slate-600',        colorActivo: 'bg-slate-600 text-white border-slate-500' },
    { valor: 'pendiente' as const,  etiqueta: 'Pendiente', count: this.contarEstado('pendiente'),  color: 'text-amber-400 border-amber-700/40',  colorActivo: 'bg-amber-500/20 text-amber-300 border-amber-500/50' },
    { valor: 'aprobado' as const,   etiqueta: 'Aprobado',  count: this.contarEstado('aprobado'),   color: 'text-green-400 border-green-700/40',  colorActivo: 'bg-green-500/20 text-green-300 border-green-500/50' },
    { valor: 'rechazado' as const,  etiqueta: 'Rechazado', count: this.contarEstado('rechazado'),  color: 'text-red-400 border-red-700/40',      colorActivo: 'bg-red-500/20 text-red-300 border-red-500/50' },
  ]);

  readonly productosFiltrados = computed(() => {
    let list = this.productos();
    const estado = this.filtroEstado();
    if (estado !== 'todos') list = list.filter(p => p.estado === estado);
    const q = this.busquedaProductos.toLowerCase().trim();
    if (q) list = list.filter(p => p.nombre.toLowerCase().includes(q));
    return list;
  });

  readonly totalPendientes = computed(() => this.contarEstado('pendiente'));

  // ── Estadísticas de productos ────────────────────────
  readonly topVistas = signal<Producto[]>([]);
  readonly topDescargas = signal<Producto[]>([]);
  readonly topFavoritos = signal<{ producto_id: string; total: number }[]>([]);
  readonly cargandoStats = signal(false);

  async ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const tab = params['tab'];
      if (tab === 'estadisticas') this.tabActivo.set('estadisticas');
      else if (tab === 'productos') this.tabActivo.set('productos');
      else this.tabActivo.set('usuarios');
    });
    await this.cargarUsuarios();
    this.cargarProductos();
    this.cargarCategorias();
  }

  // ── Métodos usuarios ─────────────────────────────────

  async cargarUsuarios() {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const { data, error } = await this.supabase.cliente
        .from('perfiles')
        .select('*')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      this.usuarios.set(data as Perfil[]);
    } catch {
      this.error.set('No se pudieron cargar los usuarios.');
    } finally {
      this.cargando.set(false);
    }
  }

  async cambiarRol(usuario: Perfil, nuevoRol: Rol) {
    if (usuario.rol === nuevoRol) return;
    this.error.set(null);
    try {
      const { error } = await this.supabase.cliente
        .from('perfiles')
        .update({ rol: nuevoRol })
        .eq('id', usuario.id);
      if (error) throw error;
      this.usuarios.update((list) =>
        list.map((u) => (u.id === usuario.id ? { ...u, rol: nuevoRol } : u))
      );
      this.exito.set(`Rol de "${usuario.nombre}" actualizado a ${nuevoRol}.`);
      setTimeout(() => this.exito.set(null), 3000);
    } catch {
      this.error.set('No se pudo cambiar el rol.');
    }
  }

  editarUsuario(u: Perfil) {
    this.formEdicion = { nombre: u.nombre, pais: u.pais ?? '', telefono: u.telefono ?? '' };
    this.usuarioEditando.set(u);
  }

  cancelarEdicion() { this.usuarioEditando.set(null); }

  async guardarEdicion() {
    const u = this.usuarioEditando();
    if (!u) return;
    this.guardandoEdicion.set(true);
    this.error.set(null);
    try {
      const patch = {
        nombre:   this.formEdicion.nombre.trim(),
        pais:     this.formEdicion.pais.trim() || undefined,
        telefono: this.formEdicion.telefono.trim() || undefined,
      };
      const { error } = await this.supabase.cliente.from('perfiles').update(patch).eq('id', u.id);
      if (error) throw error;
      this.usuarios.update((list) => list.map((x) => x.id === u.id ? { ...x, ...patch } : x));
      this.exito.set(`Perfil de "${patch.nombre}" actualizado.`);
      setTimeout(() => this.exito.set(null), 3000);
      this.usuarioEditando.set(null);
    } catch {
      this.error.set('No se pudo guardar los cambios.');
    } finally {
      this.guardandoEdicion.set(false);
    }
  }

  confirmarEliminar(u: Perfil) { this.confirmandoEliminar.set(u); }
  cancelarEliminar() { this.confirmandoEliminar.set(null); }

  async eliminarUsuario() {
    const u = this.confirmandoEliminar();
    if (!u) return;
    this.eliminando.set(true);
    try {
      const { error } = await this.supabase.cliente.from('perfiles').delete().eq('id', u.id);
      if (error) throw error;
      this.usuarios.update((list) => list.filter((x) => x.id !== u.id));
      this.exito.set(`Usuario "${u.nombre}" eliminado del sistema.`);
      setTimeout(() => this.exito.set(null), 3000);
      this.confirmandoEliminar.set(null);
    } catch {
      this.error.set('No se pudo eliminar el usuario.');
    } finally {
      this.eliminando.set(false);
    }
  }

  // ── Métodos productos ─────────────────────────────────

  async cargarProductos() {
    this.cargandoProductos.set(true);
    try {
      const data = await this.catalogoService.obtenerTodosProductos();
      this.productos.set(data);
    } catch {
      this.error.set('No se pudieron cargar los productos.');
    } finally {
      this.cargandoProductos.set(false);
    }
  }

  async cargarCategorias() {
    try {
      const data = await this.catalogoService.obtenerCategorias();
      this.categorias.set(data);
    } catch {}
  }

  abrirRevision(producto: Producto) {
    this.formRevision = {
      precio_base: producto.precio_base,
      precio_final: producto.precio_final ?? 0,
    };
    this.productoRevisando.set(producto);
  }

  cerrarRevision() { this.productoRevisando.set(null); }

  async aprobarProducto() {
    const producto = this.productoRevisando();
    if (!producto) return;
    this.guardandoRevision.set(true);
    try {
      await this.catalogoService.aprobarProducto(producto.id, {
        precio_base: Number(this.formRevision.precio_base) || undefined,
        precio_final: Number(this.formRevision.precio_final) || undefined,
      });
      this.productos.update(list => list.map(p =>
        p.id === producto.id
          ? { ...p, estado: 'aprobado' as EstadoProducto, disponible: true,
              precio_base: Number(this.formRevision.precio_base) || p.precio_base,
              precio_final: Number(this.formRevision.precio_final) || p.precio_final }
          : p
      ));
      this.exito.set(`"${producto.nombre}" aprobado y publicado.`);
      setTimeout(() => this.exito.set(null), 3000);
      this.productoRevisando.set(null);
    } catch {
      this.error.set('No se pudo aprobar el producto.');
    } finally {
      this.guardandoRevision.set(false);
    }
  }

  async rechazarProducto(producto: Producto) {
    try {
      await this.catalogoService.rechazarProducto(producto.id);
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, estado: 'rechazado' as EstadoProducto, disponible: false } : p
      ));
      this.exito.set(`"${producto.nombre}" rechazado.`);
      setTimeout(() => this.exito.set(null), 3000);
      if (this.productoRevisando()?.id === producto.id) this.productoRevisando.set(null);
    } catch {
      this.error.set('No se pudo rechazar el producto.');
    }
  }

  abrirEditorPrecios(producto: Producto, event: Event) {
    event.stopPropagation();
    this.precioFinalInput = producto.precio_final ?? producto.precio_sugerido ?? Math.ceil(producto.precio_base * 1.5);
    this.editandoPreciosId.set(producto.id);
  }

  cerrarEditorPrecios() { this.editandoPreciosId.set(null); }

  async guardarPrecioFinal(producto: Producto) {
    const precio = Number(this.precioFinalInput);
    if (!precio || precio <= 0) return;
    this.guardandoPrecios.set(true);
    try {
      await this.catalogoService.actualizarProducto(producto.id, { precio_final: precio });
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, precio_final: precio } : p
      ));
      this.exito.set('Precio actualizado correctamente.');
      setTimeout(() => this.exito.set(null), 2500);
      this.editandoPreciosId.set(null);
    } catch {
      this.error.set('No se pudo guardar el precio.');
    } finally {
      this.guardandoPrecios.set(false);
    }
  }

  ganancia(producto: Producto): number {
    return (producto.precio_final ?? 0) - producto.precio_base;
  }

  async toggleGanador(producto: Producto, event: Event) {
    event.stopPropagation();
    try {
      await this.catalogoService.toggleGanador(producto.id, !producto.ganador);
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, ganador: !p.ganador } : p
      ));
    } catch {
      this.error.set('No se pudo actualizar ganador.');
    }
  }

  async toggleExclusivo(producto: Producto, event: Event) {
    event.stopPropagation();
    try {
      await this.catalogoService.toggleExclusivo(producto.id, !producto.exclusivo);
      this.productos.update(list => list.map(p =>
        p.id === producto.id ? { ...p, exclusivo: !p.exclusivo } : p
      ));
    } catch {
      this.error.set('No se pudo actualizar exclusivo.');
    }
  }

  confirmarEliminarProducto(producto: Producto) { this.confirmandoEliminarProducto.set(producto); }
  cancelarEliminarProducto() { this.confirmandoEliminarProducto.set(null); }

  async eliminarProducto() {
    const p = this.confirmandoEliminarProducto();
    if (!p) return;
    try {
      await this.catalogoService.eliminarProducto(p.id);
      this.productos.update(list => list.filter(x => x.id !== p.id));
      this.exito.set(`"${p.nombre}" eliminado.`);
      setTimeout(() => this.exito.set(null), 3000);
      this.confirmandoEliminarProducto.set(null);
    } catch {
      this.error.set('No se pudo eliminar el producto.');
    }
  }

  // ── Estadísticas ─────────────────────────────────────

  async cargarEstadisticas() {
    if (this.topVistas().length > 0) return; // ya cargadas
    this.cargandoStats.set(true);
    try {
      const [vistas, descargas, favoritos] = await Promise.all([
        this.catalogoService.obtenerTopProductos('vistas', 5),
        this.catalogoService.obtenerTopProductos('descargas', 5),
        this.catalogoService.obtenerTopFavoritos(5),
      ]);
      this.topVistas.set(vistas);
      this.topDescargas.set(descargas);
      this.topFavoritos.set(favoritos);
    } catch {} finally {
      this.cargandoStats.set(false);
    }
  }

  setTab(tab: 'usuarios' | 'productos' | 'estadisticas') {
    this.tabActivo.set(tab);
    if (tab === 'estadisticas') this.cargarEstadisticas();
  }

  // ── Helpers ───────────────────────────────────────────

  badgeRol(rol: Rol): string {
    const clases: Record<Rol, string> = {
      admin:      'bg-red-900/40 text-red-300 border border-red-700/30',
      inventario: 'bg-amber-900/40 text-amber-300 border border-amber-700/30',
      usuario:    'bg-slate-700/50 text-slate-300 border border-slate-600/30',
    };
    return clases[rol];
  }

  badgeEstado(estado: string): string {
    const clases: Record<string, string> = {
      pendiente: 'bg-amber-500/20 border border-amber-500/40 text-amber-300',
      aprobado:  'bg-green-500/20 border border-green-500/40 text-green-300',
      rechazado: 'bg-red-500/20 border border-red-500/40 text-red-300',
    };
    return clases[estado] ?? clases['pendiente'];
  }

  iconoEstado(estado: string): string {
    return { pendiente: 'schedule', aprobado: 'check_circle', rechazado: 'cancel' }[estado] ?? 'schedule';
  }

  contarRol(rol: Rol): number {
    return this.usuarios().filter((u) => u.rol === rol).length;
  }

  contarEstado(estado: EstadoProducto): number {
    return this.productos().filter(p => p.estado === estado).length;
  }

  margen(producto: Producto): number {
    if (!producto.precio_final || producto.precio_base === 0) return 0;
    return Math.round(((producto.precio_final - producto.precio_base) / producto.precio_base) * 100);
  }

  formatearFecha(fecha: string): string {
    return new Date(fecha).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
