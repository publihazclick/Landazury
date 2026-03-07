import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import type { Usuario } from '../../core/models/usuario.model';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './perfil.component.html',
})
export class PerfilComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);

  readonly perfil = signal<Usuario | null>(null);
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly mensajeExito = signal<string | null>(null);
  readonly error = signal<string | null>(null);

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
  }

  async cargarPerfil() {
    const usuario = this.auth.usuario();
    if (!usuario) return;

    try {
      const { data } = await this.supabase.cliente
        .from('perfiles')
        .select('*')
        .eq('id', usuario.id)
        .single();

      if (data) {
        this.perfil.set(data as Usuario);
        this.form.patchValue({
          nombre: data.nombre,
          pais: data.pais || '',
          telefono: data.telefono || '',
        });
      }
    } catch {
      // Perfil aún no existe
    } finally {
      this.cargando.set(false);
    }
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
        rol: 'vendedor',
      });

      if (error) throw error;
      this.mensajeExito.set('Perfil actualizado correctamente.');
    } catch {
      this.error.set('No se pudo actualizar el perfil. Intenta de nuevo.');
    } finally {
      this.guardando.set(false);
    }
  }
}
