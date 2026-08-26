import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CatalogoService } from '../../core/services/catalogo.service';
import { AuthService } from '../../core/services/auth.service';
import { AvisosService, type Aviso } from '../../core/services/avisos.service';
import { environment } from '../../../environments/environment';
import type { Perfil, Rol } from '../../core/models/usuario.model';
import type { Producto, Categoria, EstadoProducto } from '../../core/models/producto.model';

interface FormEdicion {
  nombre: string;
  email: string;
  pais: string;
  telefono: string;
  rol: Rol;
  nuevaContrasena: string;
}

interface FormRevision {
  precio_base: number;
  precio_final: number;
}

interface CredencialesCreadas {
  email: string;
  contrasena: string;
  nombre: string;
  rol: Rol;
}

type EstadoPedido = 'pendiente' | 'confirmado' | 'despachado' | 'en_ruta' | 'entregado' | 'devuelto' | 'cancelado';

interface DashboardResumen {
  total_usuarios: number;
  usuarios_admin: number;
  usuarios_inventario: number;
  usuarios_normales: number;
  usuarios_nuevos_7d: number;
  usuarios_nuevos_30d: number;
  total_productos: number;
  productos_aprobados: number;
  productos_pendientes: number;
  productos_rechazados: number;
  total_pedidos: number;
  pedidos_hoy: number;
  pedidos_7d: number;
  pedidos_30d: number;
  pedidos_entregados: number;
  pedidos_perdidos: number;
  gmv_total: number;
  gmv_entregado: number;
  ingreso_margen_flete: number;
  ingreso_margen_flete_entregado: number;
  saldo_total_wallets: number;
  total_recargado: number;
  total_debitado: number;
  total_reembolsado: number;
  total_referidores: number;
  total_comisiones_referidos: number;
  pedidos_con_guia: number;
  pedidos_sin_guia: number;
}

interface TendenciaDia {
  dia: string;
  pedidos: number;
  entregados: number;
  gmv: number;
  margen: number;
}

interface RankingVendedor {
  id: string;
  nombre: string;
  email: string | null;
  pedidos: number;
  entregados: number;
  gmv: number;
  margen: number;
}

interface RankingProducto {
  id: string;
  nombre: string;
  pedidos: number;
  unidades: number;
  gmv: number;
}

interface RankingCiudad {
  ciudad: string;
  depto: string;
  pedidos: number;
  gmv: number;
}

interface RankingRecargador {
  id: string;
  nombre: string;
  email: string | null;
  total_recargado: number;
  recargas: number;
}

interface RankingReferidor {
  id: string;
  nombre: string;
  email: string | null;
  referral_code: string | null;
  referidos_directos: number;
  comisiones: number;
}

interface DashboardAdmin {
  resumen: DashboardResumen;
  pedidos_por_estado: Record<string, number> | null;
  tendencia_30d: TendenciaDia[];
  top_vendedores: RankingVendedor[] | null;
  top_productos: RankingProducto[] | null;
  top_ciudades: RankingCiudad[] | null;
  top_recargadores: RankingRecargador[] | null;
  top_referidores: RankingReferidor[] | null;
  generado_en: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TitleCasePipe, RouterLink],
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
  readonly tabActivo = signal<'usuarios' | 'productos' | 'estadisticas' | 'config' | 'retiros' | 'avisos'>('usuarios');
  readonly filtroRol = signal<Rol | 'todos'>('todos');
  readonly usuarioEditando = signal<Perfil | null>(null);
  readonly confirmandoEliminar = signal<Perfil | null>(null);
  readonly guardandoEdicion = signal(false);
  readonly eliminando = signal(false);
  readonly mostrarContrasenaEdicion = signal(false);
  readonly tabEdicion = signal<'info' | 'acceso'>('info');
  readonly guardandoContrasena = signal(false);

  busqueda = '';
  formEdicion: FormEdicion = { nombre: '', email: '', pais: '', telefono: '', rol: 'usuario', nuevaContrasena: '' };

  // ── Crear usuario ─────────────────────────────────
  readonly creandoUsuario = signal(false);
  readonly cargandoCrear = signal(false);
  readonly credencialesCreadas = signal<CredencialesCreadas | null>(null);
  readonly mostrarContrasenaCrear = signal(false);
  formCrear = { nombre: '', email: '', contrasena: '', rol: 'inventario' as Rol };

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
      const matchQ = !q || u.nombre.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q);
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

  // ── Dashboard admin (datos reales) ───────────────────
  readonly dashboardData = signal<DashboardAdmin | null>(null);
  readonly cargandoDashboard = signal(false);
  readonly dashboardError = signal<string | null>(null);
  readonly dashboardActualizado = signal<Date | null>(null);

  readonly resumen = computed(() => this.dashboardData()?.resumen ?? null);
  readonly tendencia30d = computed(() => this.dashboardData()?.tendencia_30d ?? []);
  readonly topVendedores = computed(() => this.dashboardData()?.top_vendedores ?? []);
  readonly topProductosVendidos = computed(() => this.dashboardData()?.top_productos ?? []);
  readonly topCiudades = computed(() => this.dashboardData()?.top_ciudades ?? []);
  readonly topRecargadores = computed(() => this.dashboardData()?.top_recargadores ?? []);
  readonly topReferidoresRanking = computed(() => this.dashboardData()?.top_referidores ?? []);

  readonly estadosPedidos: Array<{ key: EstadoPedido; etiqueta: string; color: string; bg: string; icono: string }> = [
    { key: 'pendiente',   etiqueta: 'Pendientes',   color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200',  icono: 'schedule' },
    { key: 'confirmado',  etiqueta: 'Confirmados',  color: 'text-sky-600',    bg: 'bg-sky-50 border-sky-200',      icono: 'verified' },
    { key: 'despachado',  etiqueta: 'Despachados',  color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200',icono: 'local_shipping' },
    { key: 'en_ruta',     etiqueta: 'En ruta',      color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200',icono: 'directions_run' },
    { key: 'entregado',   etiqueta: 'Entregados',   color: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-200',icono: 'check_circle' },
    { key: 'devuelto',    etiqueta: 'Devueltos',    color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200',icono: 'undo' },
    { key: 'cancelado',   etiqueta: 'Cancelados',   color: 'text-red-600',    bg: 'bg-red-50 border-red-200',      icono: 'cancel' },
  ];

  readonly conteoEstadosPedidos = computed(() => {
    const data = this.dashboardData()?.pedidos_por_estado ?? {};
    return this.estadosPedidos.map(e => ({
      ...e,
      cantidad: Number(data[e.key] ?? 0),
    }));
  });

  readonly maxTendenciaPedidos = computed(() => {
    const t = this.tendencia30d();
    return Math.max(1, ...t.map(d => Number(d.pedidos ?? 0)));
  });

  // ── Configuración plataforma ─────────────────────────
  readonly cargandoConfig = signal(false);
  readonly guardandoConfig = signal(false);
  readonly configReferidoMode = signal<'flat' | 'pct'>('flat');
  readonly configReferidoFlat = signal<number>(500);
  readonly configReferidoPct = signal<number>(0);
  readonly configReferidoBase = signal<'flete_ganancia' | 'subtotal' | 'flete_total' | 'total_debitado'>('flete_ganancia');
  readonly totalComisionesPagadas = signal<number>(0);
  readonly totalReferidores = signal<number>(0);

  // ── Mentoría ───────────────────────────────────────
  readonly mentoriaTelefono = signal<string>('573202241463');
  readonly mentoriaMensaje = signal<string>('Hola *HARLEY* estoy interesad@ en recibir mentoria para aprender a vender los productos de *MODA LANDAZURY* y DE *LANDAZURY IMPORTACIONES* quiero que me enseñes Gracias');
  readonly guardandoMentoria = signal(false);
  readonly mentoriaPreviewUrl = computed(() => {
    const tel = (this.mentoriaTelefono() || '').replace(/\D+/g, '');
    const msg = encodeURIComponent(this.mentoriaMensaje() || '');
    if (!tel) return '';
    return `https://wa.me/${tel}?text=${msg}`;
  });

  // ── Notificaciones WhatsApp ─────────────────────────
  readonly notifWhatsappActivas = signal<boolean>(true);
  readonly evolutionInstanceName = signal<string>('');
  readonly guardandoNotif = signal(false);

  readonly opcionesBaseComision = [
    { valor: 'flete_ganancia' as const, etiqueta: 'Margen del flete (recomendado)', descripcion: 'Solo sobre los $3.000 de margen del admin. Sostenible — no toca el costo del producto.' },
    { valor: 'flete_total'    as const, etiqueta: 'Flete completo',                  descripcion: 'Sobre el flete total de Mipaquete + margen.' },
    { valor: 'subtotal'       as const, etiqueta: 'Subtotal del producto',           descripcion: 'Sobre el precio de venta del producto. Más generoso pero reduce ganancia neta.' },
    { valor: 'total_debitado' as const, etiqueta: 'Total debitado al wallet',        descripcion: 'Sobre todo lo descontado al vendedor (flete + producto si es anticipado).' },
  ];

  async ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const tab = params['tab'];
      if (tab === 'estadisticas') this.tabActivo.set('estadisticas');
      else if (tab === 'productos') this.tabActivo.set('productos');
      else if (tab === 'config') { this.tabActivo.set('config'); this.cargarConfig(); }
      else if (tab === 'retiros') { this.tabActivo.set('retiros'); this.cargarRetiros(); }
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

  editarUsuario(u: Perfil) {
    this.formEdicion = {
      nombre: u.nombre,
      email: u.email ?? '',
      pais: u.pais ?? '',
      telefono: u.telefono ?? '',
      rol: u.rol,
      nuevaContrasena: '',
    };
    this.mostrarContrasenaEdicion.set(false);
    this.tabEdicion.set('info');
    this.usuarioEditando.set(u);
  }

  cancelarEdicion() { this.usuarioEditando.set(null); }

  async toggleTestUser() {
    const u = this.usuarioEditando();
    if (!u) return;
    const nuevoValor = !u.test_user;
    try {
      const { error } = await this.supabase.cliente.rpc('toggle_test_user', {
        p_perfil_id: u.id,
        p_valor: nuevoValor,
      });
      if (error) throw error;
      this.usuarioEditando.set({ ...u, test_user: nuevoValor });
      this.usuarios.update(list => list.map(x => x.id === u.id ? { ...x, test_user: nuevoValor } : x));
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo actualizar');
    }
  }

  async guardarEdicion() {
    const u = this.usuarioEditando();
    if (!u) return;
    if (!this.formEdicion.nombre.trim()) {
      this.error.set('El nombre no puede estar vacío.');
      return;
    }
    if (this.formEdicion.nuevaContrasena && this.formEdicion.nuevaContrasena.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    this.guardandoEdicion.set(true);
    this.error.set(null);

    const emailCambio = this.formEdicion.email.trim().toLowerCase() !== (u.email ?? '').toLowerCase();
    const contrasenaSetted = !!this.formEdicion.nuevaContrasena;
    const necesitaEdgeFn = emailCambio || contrasenaSetted;

    try {
      if (necesitaEdgeFn) {
        const token = this.obtenerToken();
        const body: Record<string, string> = {
          userId: u.id,
          nombre: this.formEdicion.nombre.trim(),
          rol: this.formEdicion.rol,
          pais: this.formEdicion.pais.trim(),
          telefono: this.formEdicion.telefono.trim(),
        };
        if (emailCambio) body['email'] = this.formEdicion.email.trim().toLowerCase();
        if (contrasenaSetted) body['password'] = this.formEdicion.nuevaContrasena;

        const resp = await fetch(`${environment.supabaseUrl}/functions/v1/admin-actualizar-usuario`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error ?? 'Error al actualizar usuario');
      } else {
        // Only profile fields changed — update directly
        const patch: Record<string, string | null> = {
          nombre: this.formEdicion.nombre.trim(),
          rol: this.formEdicion.rol,
          pais: this.formEdicion.pais.trim() || null,
          telefono: this.formEdicion.telefono.trim() || null,
        };
        const { error } = await this.supabase.cliente.from('perfiles').update(patch).eq('id', u.id);
        if (error) throw error;
      }

      const updated: Partial<Perfil> = {
        nombre: this.formEdicion.nombre.trim(),
        email: emailCambio ? this.formEdicion.email.trim().toLowerCase() : u.email,
        rol: this.formEdicion.rol,
        pais: this.formEdicion.pais.trim() || undefined,
        telefono: this.formEdicion.telefono.trim() || undefined,
      };
      this.usuarios.update((list) => list.map((x) => x.id === u.id ? { ...x, ...updated } : x));

      let msg = `Perfil de "${updated.nombre}" actualizado.`;
      if (contrasenaSetted) msg += ' Contraseña cambiada.';
      if (emailCambio) msg += ' Email actualizado.';
      this.mostrarExito(msg);
      this.usuarioEditando.set(null);
    } catch (err: any) {
      this.error.set(err?.message || 'No se pudo guardar los cambios.');
    } finally {
      this.guardandoEdicion.set(false);
    }
  }

  generarContrasenaEdicion() {
    this.formEdicion.nuevaContrasena = this.generarContrasena();
    this.mostrarContrasenaEdicion.set(true);
  }

  confirmarEliminar(u: Perfil) { this.confirmandoEliminar.set(u); }
  cancelarEliminar() { this.confirmandoEliminar.set(null); }

  async eliminarUsuario() {
    const u = this.confirmandoEliminar();
    if (!u) return;
    this.eliminando.set(true);
    this.error.set(null);
    try {
      const token = this.obtenerToken();
      const resp = await fetch(`${environment.supabaseUrl}/functions/v1/admin-eliminar-usuario`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: u.id }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error ?? 'Error al eliminar usuario');
      this.usuarios.update((list) => list.filter((x) => x.id !== u.id));
      this.mostrarExito(`Usuario "${u.nombre}" eliminado del sistema.`);
      this.confirmandoEliminar.set(null);
    } catch (err: any) {
      this.error.set(err?.message || 'No se pudo eliminar el usuario.');
    } finally {
      this.eliminando.set(false);
    }
  }

  // ── Crear usuario ─────────────────────────────────

  abrirCrearUsuario() {
    this.formCrear = { nombre: '', email: '', contrasena: '', rol: 'inventario' };
    this.mostrarContrasenaCrear.set(false);
    this.creandoUsuario.set(true);
  }

  cancelarCrearUsuario() {
    this.creandoUsuario.set(false);
  }

  generarContrasena(): string {
    const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const minus = 'abcdefghjkmnpqrstuvwxyz';
    const nums  = '23456789';
    const esp   = '!@#$%';
    const todos = mayus + minus + nums + esp;
    // Garantizar al menos uno de cada tipo
    const base = [
      mayus[Math.floor(Math.random() * mayus.length)],
      minus[Math.floor(Math.random() * minus.length)],
      nums[Math.floor(Math.random() * nums.length)],
      esp[Math.floor(Math.random() * esp.length)],
    ];
    for (let i = 0; i < 6; i++) {
      base.push(todos[Math.floor(Math.random() * todos.length)]);
    }
    return base.sort(() => Math.random() - 0.5).join('');
  }

  usarContrasenaGenerada() {
    this.formCrear.contrasena = this.generarContrasena();
    this.mostrarContrasenaCrear.set(true);
  }

  async crearUsuario() {
    const { nombre, email, contrasena, rol } = this.formCrear;
    if (!nombre.trim() || !email.trim() || !contrasena) return;
    if (contrasena.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    this.cargandoCrear.set(true);
    this.error.set(null);

    try {
      const token = this.obtenerToken();

      const resp = await fetch(`${environment.supabaseUrl}/functions/v1/admin-crear-usuario`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: contrasena,
          nombre: nombre.trim(),
          rol,
        }),
      });

      const result = await resp.json();
      if (!resp.ok) {
        const msg: string = result.error ?? '';
        if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered')) {
          throw new Error('Ya existe una cuenta con ese correo electrónico.');
        }
        throw new Error(msg || 'No se pudo crear el usuario.');
      }

      const nuevoPerfil: Perfil = {
        id: result.userId,
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        rol,
        creado_en: new Date().toISOString(),
      };
      this.usuarios.update(list => [nuevoPerfil, ...list]);

      this.credencialesCreadas.set({
        email: email.trim().toLowerCase(),
        contrasena,
        nombre: nombre.trim(),
        rol,
      });
      this.creandoUsuario.set(false);
      this.formCrear = { nombre: '', email: '', contrasena: '', rol: 'inventario' };
      this.mostrarContrasenaCrear.set(false);
    } catch (err: any) {
      this.error.set(err?.message || 'No se pudo crear el usuario.');
    } finally {
      this.cargandoCrear.set(false);
    }
  }

  cerrarCredenciales() { this.credencialesCreadas.set(null); }

  async copiarTexto(texto: string, etiqueta: string) {
    try {
      await navigator.clipboard.writeText(texto);
      this.mostrarExito(`${etiqueta} copiado al portapapeles.`);
    } catch {
      this.error.set('No se pudo copiar automáticamente. Cópialo manualmente.');
    }
  }

  get linkOp(): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/op`;
    }
    return '/op';
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
      this.mostrarExito(`"${producto.nombre}" aprobado y publicado.`);
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
      this.mostrarExito(`"${producto.nombre}" rechazado.`);
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
      this.mostrarExito('Precio actualizado correctamente.');
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
      this.mostrarExito(`"${p.nombre}" eliminado.`);
      this.confirmandoEliminarProducto.set(null);
    } catch {
      this.error.set('No se pudo eliminar el producto.');
    }
  }

  // ── Estadísticas ─────────────────────────────────────

  async cargarEstadisticas() {
    await Promise.all([
      this.cargarTopProductos(),
      this.cargarDashboardAdmin(),
    ]);
  }

  private async cargarTopProductos() {
    if (this.topVistas().length > 0) return;
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

  async cargarDashboardAdmin() {
    this.cargandoDashboard.set(true);
    this.dashboardError.set(null);
    try {
      const { data, error } = await this.supabase.cliente.rpc('dashboard_admin');
      if (error) throw error;
      this.dashboardData.set(data as DashboardAdmin);
      this.dashboardActualizado.set(new Date());
    } catch (e: any) {
      this.dashboardError.set(e?.message ?? 'No se pudieron cargar las estadísticas.');
    } finally {
      this.cargandoDashboard.set(false);
    }
  }

  setTab(tab: 'usuarios' | 'productos' | 'estadisticas' | 'config' | 'retiros' | 'avisos') {
    this.tabActivo.set(tab);
    if (tab === 'estadisticas') this.cargarEstadisticas();
    if (tab === 'config') this.cargarConfig();
    if (tab === 'retiros') this.cargarRetiros();
    if (tab === 'avisos') this.avisosService.cargar();
  }

  // ── Avisos de plataforma ──────────────────────────────────────────
  readonly avisosService  = inject(AvisosService);
  readonly avisoTitulo    = signal('');
  readonly avisoMensaje   = signal('');
  readonly avisoTipo      = signal<Aviso['tipo']>('info');
  readonly enviandoAviso  = signal(false);

  async enviarAviso() {
    const titulo  = this.avisoTitulo().trim();
    const mensaje = this.avisoMensaje().trim();
    if (!titulo || !mensaje) return;
    this.enviandoAviso.set(true);
    try {
      await this.avisosService.crearAviso(titulo, mensaje, this.avisoTipo());
      this.avisoTitulo.set('');
      this.avisoMensaje.set('');
      this.exito.set('Aviso enviado a todos los usuarios.');
      setTimeout(() => this.exito.set(null), 3000);
    } catch {
      this.error.set('No se pudo enviar el aviso.');
    } finally {
      this.enviandoAviso.set(false);
    }
  }

  async eliminarAviso(id: string) {
    try {
      await this.avisosService.eliminarAviso(id);
    } catch {
      this.error.set('No se pudo eliminar el aviso.');
    }
  }

  // ── Retiros de ganancias ──────────────────────────────────────────
  readonly retiros           = signal<any[]>([]);
  readonly cargandoRetiros   = signal(false);
  readonly procesandoRetiroId = signal<string | null>(null);
  notasRetiro: Record<string, string> = {};

  async cargarRetiros() {
    this.cargandoRetiros.set(true);
    try {
      const ganancias = await import('../../core/services/ganancias.service');
      const srv = this.supabase.cliente;
      const { data, error } = await srv.from('vista_retiros_admin').select('*').order('creado_en', { ascending: false });
      if (error) throw error;
      this.retiros.set((data ?? []).map((r: any) => ({ ...r, monto: Number(r.monto) })));
    } finally {
      this.cargandoRetiros.set(false);
    }
  }

  async procesarRetiro(id: string) {
    this.procesandoRetiroId.set(id);
    try {
      const { data, error } = await this.supabase.cliente.rpc('procesar_retiro_ganancia', {
        p_retiro_id: id, p_notas: this.notasRetiro[id] ?? null,
      });
      if (error) throw error;
      await this.cargarRetiros();
    } catch (e: any) {
      alert(e?.message ?? 'Error al procesar');
    } finally {
      this.procesandoRetiroId.set(null);
    }
  }

  async rechazarRetiro(id: string) {
    if (!confirm('¿Rechazar este retiro? El saldo se devolverá al vendedor.')) return;
    this.procesandoRetiroId.set(id);
    try {
      const { data, error } = await this.supabase.cliente.rpc('rechazar_retiro_ganancia', {
        p_retiro_id: id, p_notas: this.notasRetiro[id] ?? null,
      });
      if (error) throw error;
      await this.cargarRetiros();
    } catch (e: any) {
      alert(e?.message ?? 'Error al rechazar');
    } finally {
      this.procesandoRetiroId.set(null);
    }
  }

  // ── Configuración plataforma ─────────────────────────

  async cargarConfig() {
    this.cargandoConfig.set(true);
    try {
      const { data, error } = await this.supabase.cliente
        .from('config_plataforma')
        .select('clave, valor');
      if (error) throw error;
      for (const row of data ?? []) {
        const v = row.valor;
        if (row.clave === 'referral_commission_mode') {
          const mode = String(v ?? 'flat') as 'flat' | 'pct';
          this.configReferidoMode.set(mode === 'pct' ? 'pct' : 'flat');
        } else if (row.clave === 'referral_commission_flat') {
          this.configReferidoFlat.set(Number(v ?? 0));
        } else if (row.clave === 'referral_commission_pct') {
          this.configReferidoPct.set(Number(v ?? 0));
        } else if (row.clave === 'referral_commission_base') {
          const base = String(v ?? 'flete_ganancia') as any;
          this.configReferidoBase.set(base);
        } else if (row.clave === 'mentoria_telefono') {
          if (typeof v === 'string' && v) this.mentoriaTelefono.set(v);
        } else if (row.clave === 'mentoria_mensaje') {
          if (typeof v === 'string' && v) this.mentoriaMensaje.set(v);
        } else if (row.clave === 'notificaciones_whatsapp_activas') {
          this.notifWhatsappActivas.set(v !== false);
        } else if (row.clave === 'evolution_instance_name') {
          if (typeof v === 'string') this.evolutionInstanceName.set(v);
        }
      }

      // Stats agregadas para el panel
      const [{ data: comData }, { data: refData }] = await Promise.all([
        this.supabase.cliente.from('comisiones_referidos').select('monto'),
        this.supabase.cliente.from('perfiles').select('id', { count: 'exact', head: false }).not('referido_por', 'is', null),
      ]);
      const total = (comData ?? []).reduce((acc: number, r: any) => acc + Number(r.monto ?? 0), 0);
      this.totalComisionesPagadas.set(total);
      this.totalReferidores.set((refData ?? []).length);
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo cargar la configuración.');
    } finally {
      this.cargandoConfig.set(false);
    }
  }

  async guardarConfigReferidos() {
    const mode = this.configReferidoMode();
    const pct = Number(this.configReferidoPct());
    const flat = Number(this.configReferidoFlat());

    if (mode === 'pct' && (isNaN(pct) || pct < 0 || pct > 100)) {
      this.error.set('El porcentaje debe estar entre 0 y 100.');
      return;
    }
    if (mode === 'flat' && (isNaN(flat) || flat < 0)) {
      this.error.set('El monto fijo debe ser un número positivo.');
      return;
    }

    this.guardandoConfig.set(true);
    this.error.set(null);
    try {
      const ts = new Date().toISOString();
      const rows = [
        { clave: 'referral_commission_mode', valor: mode,                              actualizado_en: ts },
        { clave: 'referral_commission_flat', valor: flat,                              actualizado_en: ts },
        { clave: 'referral_commission_pct',  valor: pct,                               actualizado_en: ts },
        { clave: 'referral_commission_base', valor: this.configReferidoBase(),         actualizado_en: ts },
      ];
      const { error } = await this.supabase.cliente
        .from('config_plataforma')
        .upsert(rows, { onConflict: 'clave' });
      if (error) throw error;

      this.mostrarExito('Configuración de referidos actualizada.');
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo guardar la configuración.');
    } finally {
      this.guardandoConfig.set(false);
    }
  }

  async guardarConfigNotificaciones() {
    this.guardandoNotif.set(true);
    this.error.set(null);
    try {
      const ts = new Date().toISOString();
      const rows = [
        { clave: 'notificaciones_whatsapp_activas', valor: this.notifWhatsappActivas(),       actualizado_en: ts },
        { clave: 'evolution_instance_name',         valor: (this.evolutionInstanceName() || '').trim(), actualizado_en: ts },
      ];
      const { error } = await this.supabase.cliente
        .from('config_plataforma')
        .upsert(rows, { onConflict: 'clave' });
      if (error) throw error;
      this.mostrarExito('Configuración de notificaciones actualizada.');
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo guardar la configuración.');
    } finally {
      this.guardandoNotif.set(false);
    }
  }

  async guardarConfigMentoria() {
    const tel = (this.mentoriaTelefono() || '').replace(/\D+/g, '');
    const msg = (this.mentoriaMensaje() || '').trim();

    if (!tel || tel.length < 8) {
      this.error.set('El número debe tener al menos 8 dígitos en formato internacional (ej: 573202241463).');
      return;
    }
    if (!msg) {
      this.error.set('El mensaje no puede estar vacío.');
      return;
    }

    this.guardandoMentoria.set(true);
    this.error.set(null);
    try {
      const ts = new Date().toISOString();
      const rows = [
        { clave: 'mentoria_telefono', valor: tel, actualizado_en: ts },
        { clave: 'mentoria_mensaje',  valor: msg, actualizado_en: ts },
      ];
      const { error } = await this.supabase.cliente
        .from('config_plataforma')
        .upsert(rows, { onConflict: 'clave' });
      if (error) throw error;

      this.mentoriaTelefono.set(tel);
      this.mostrarExito('Botón Mentoría actualizado.');
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo guardar la configuración del botón Mentoría.');
    } finally {
      this.guardandoMentoria.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────

  private mostrarExito(msg: string) {
    this.exito.set(msg);
    setTimeout(() => this.exito.set(null), 3000);
  }

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

  formatearDiaCorto(fecha: string): string {
    const d = new Date(fecha + 'T00:00:00');
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  }

  formatearHora(fecha: Date | null): string {
    if (!fecha) return '';
    return fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  porcentajeBarra(valor: number, max: number): number {
    if (!max) return 0;
    return Math.max(2, Math.round((valor / max) * 100));
  }

  tasaConversion(): number {
    const r = this.resumen();
    if (!r || !r.total_pedidos) return 0;
    return Math.round((r.pedidos_entregados / r.total_pedidos) * 100);
  }

  tasaPerdida(): number {
    const r = this.resumen();
    if (!r || !r.total_pedidos) return 0;
    return Math.round((r.pedidos_perdidos / r.total_pedidos) * 100);
  }

  /** Lee el access_token de la sesión activa */
  private obtenerToken(): string {
    const token = this.auth.sesion()?.access_token;
    if (!token) throw new Error('Sesión expirada. Por favor, vuelve a iniciar sesión.');
    return token;
  }
}
