import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import type { Perfil, Rol } from '../../core/models/usuario.model';

interface FormEdicion {
  nombre: string;
  pais: string;
  telefono: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin.component.html',
})
export class AdminComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);

  readonly usuarios = signal<Perfil[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);
  readonly tabActivo = signal<'usuarios' | 'estadisticas'>('usuarios');
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
    { valor: 'todos' as const,     etiqueta: 'Todos',      count: this.usuarios().length,        icono: 'group' },
    { valor: 'admin' as const,     etiqueta: 'Admin',      count: this.contarRol('admin'),       icono: 'shield_person' },
    { valor: 'inventario' as const, etiqueta: 'Inventario', count: this.contarRol('inventario'), icono: 'inventory_2' },
    { valor: 'usuario' as const,   etiqueta: 'Usuario',    count: this.contarRol('usuario'),     icono: 'person' },
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

  async ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.tabActivo.set(params['tab'] === 'estadisticas' ? 'estadisticas' : 'usuarios');
    });
    await this.cargarUsuarios();
  }

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

  cancelarEdicion() {
    this.usuarioEditando.set(null);
  }

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

  confirmarEliminar(u: Perfil) {
    this.confirmandoEliminar.set(u);
  }

  cancelarEliminar() {
    this.confirmandoEliminar.set(null);
  }

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

  badgeRol(rol: Rol): string {
    const clases: Record<Rol, string> = {
      admin:      'bg-red-900/40 text-red-300 border border-red-700/30',
      inventario: 'bg-amber-900/40 text-amber-300 border border-amber-700/30',
      usuario:    'bg-slate-700/50 text-slate-300 border border-slate-600/30',
    };
    return clases[rol];
  }

  contarRol(rol: Rol): number {
    return this.usuarios().filter((u) => u.rol === rol).length;
  }

  formatearFecha(fecha: string): string {
    return new Date(fecha).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
