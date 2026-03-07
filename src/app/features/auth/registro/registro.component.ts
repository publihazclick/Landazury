import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registro.component.html',
})
export class RegistroComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exitoso = signal(false);
  readonly mostrarContrasena = signal(false);

  readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    contrasena: ['', [Validators.required, Validators.minLength(6)]],
    pais: ['', Validators.required],
  });

  readonly paises = [
    'México', 'Colombia', 'Argentina', 'Chile', 'Perú', 'Venezuela',
    'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'Guatemala', 'Honduras',
    'El Salvador', 'Nicaragua', 'Costa Rica', 'Panamá', 'Cuba', 'República Dominicana',
  ];

  async onSubmit() {
    if (this.form.invalid || this.cargando()) return;

    this.cargando.set(true);
    this.error.set(null);

    try {
      const { email, contrasena, nombre } = this.form.value;
      await this.auth.registrar(email!, contrasena!, nombre!);
      this.exitoso.set(true);
    } catch (err: any) {
      this.error.set(this.traducirError(err.message));
    } finally {
      this.cargando.set(false);
    }
  }

  private traducirError(mensaje: string): string {
    if (mensaje.includes('already registered') || mensaje.includes('already been registered')) {
      return 'Este correo ya está registrado. Inicia sesión.';
    }
    if (mensaje.includes('Password should be at least')) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    return 'Ocurrió un error. Inténtalo de nuevo.';
  }
}
