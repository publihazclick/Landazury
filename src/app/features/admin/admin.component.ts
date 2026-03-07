import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';
import type { Perfil, Rol } from '../../core/models/usuario.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin.component.html',
})
export class AdminComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  readonly usuarios = signal<Perfil[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);

  busqueda = '';

  readonly roles: { valor: Rol; etiqueta: string; descripcion: string }[] = [
    { valor: 'admin', etiqueta: 'Admin', descripcion: 'Acceso total' },
    { valor: 'inventario', etiqueta: 'Inventario', descripcion: 'Sube y gestiona creativos' },
    { valor: 'usuario', etiqueta: 'Usuario', descripcion: 'Solo ve el catálogo' },
  ];

  async ngOnInit() {
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

  get usuariosFiltrados(): Perfil[] {
    const q = this.busqueda.toLowerCase().trim();
    if (!q) return this.usuarios();
    return this.usuarios().filter((u) => u.nombre.toLowerCase().includes(q));
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

  badgeRol(rol: Rol): string {
    const clases: Record<Rol, string> = {
      admin: 'bg-red-900/40 text-red-300 border border-red-700/30',
      inventario: 'bg-amber-900/40 text-amber-300 border border-amber-700/30',
      usuario: 'bg-slate-700/50 text-slate-300 border border-slate-600/30',
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
