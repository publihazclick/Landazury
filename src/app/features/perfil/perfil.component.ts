import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import type { Perfil } from '../../core/models/usuario.model';

interface StatsAdmin {
  totalUsuarios: number;
  admins: number;
  inventario: number;
  usuarios: number;
  totalProductos: number;
}

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './perfil.component.html',
})
export class PerfilComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);

  readonly perfil = signal<Perfil | null>(null);
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly mensajeExito = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly stats = signal<StatsAdmin | null>(null);

  readonly esAdmin = computed(() => this.auth.esAdmin());

  readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    pais: [''],
    telefono: [''],
  });

  readonly paises = [
    'México', 'Colombia', 'Argentina', 'Chile', 'Perú', 'Venezuela',
    'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'Guatemala', 'Honduras',
    'El Salvador', 'Nicaragua', 'Costa Rica', 'Panamá', 'Cuba', 'República Dominicana',
  ];

  async ngOnInit() {
    await this.cargarPerfil();
    if (this.esAdmin()) await this.cargarStats();
  }

  async cargarPerfil() {
    // Usar datos ya cargados en AuthService si están disponibles
    const perfilExistente = this.auth.perfil();
    if (perfilExistente) {
      this.perfil.set(perfilExistente);
      this.form.patchValue({
        nombre: perfilExistente.nombre,
        pais: perfilExistente.pais || '',
        telefono: perfilExistente.telefono || '',
      });
      this.cargando.set(false);
      return;
    }
    // Fallback: consultar si aún no está en el servicio
    const usuario = this.auth.usuario();
    if (!usuario) { this.cargando.set(false); return; }
    try {
      const { data } = await this.supabase.cliente
        .from('perfiles')
        .select('*')
        .eq('id', usuario.id)
        .single();
      if (data) {
        this.perfil.set(data as Perfil);
        this.form.patchValue({ nombre: data.nombre, pais: data.pais || '', telefono: data.telefono || '' });
      }
    } catch { /* perfil no existe aún */ }
    finally { this.cargando.set(false); }
  }

  async cargarStats() {
    try {
      const [{ data: perfiles }, { count: productos }] = await Promise.all([
        this.supabase.cliente.from('perfiles').select('rol'),
        this.supabase.cliente.from('productos').select('id', { count: 'exact', head: true }),
      ]);
      if (perfiles) {
        this.stats.set({
          totalUsuarios: perfiles.length,
          admins: perfiles.filter((p: any) => p.rol === 'admin').length,
          inventario: perfiles.filter((p: any) => p.rol === 'inventario').length,
          usuarios: perfiles.filter((p: any) => p.rol === 'usuario').length,
          totalProductos: productos ?? 0,
        });
      }
    } catch { /* stats opcionales */ }
  }

  async onGuardar() {
    if (this.form.invalid || this.guardando()) return;
    this.guardando.set(true);
    this.mensajeExito.set(null);
    this.error.set(null);
    const usuario = this.auth.usuario();
    if (!usuario) return;
    try {
      const { nombre, pais, telefono } = this.form.value;
      const { error } = await this.supabase.cliente.from('perfiles').upsert({
        id: usuario.id,
        nombre,
        pais,
        telefono,
        rol: this.perfil()?.rol ?? 'usuario',
      });
      if (error) throw error;
      this.mensajeExito.set('Perfil actualizado correctamente.');
      setTimeout(() => this.mensajeExito.set(null), 3000);
    } catch {
      this.error.set('No se pudo actualizar el perfil. Intenta de nuevo.');
    } finally {
      this.guardando.set(false);
    }
  }
}
