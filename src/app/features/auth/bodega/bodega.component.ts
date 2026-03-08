import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-bodega',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './bodega.component.html',
})
export class BodegaComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly mostrarContrasena = signal(false);
  readonly accesoDenegado = signal(false);

  private errorTimeout?: ReturnType<typeof setTimeout>;

  readonly form = this.fb.group({
    email:      ['', [Validators.required, Validators.email]],
    contrasena: ['', [Validators.required, Validators.minLength(6)]],
  });

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.cargando()) return;

    this.cargando.set(true);
    this.error.set(null);
    this.accesoDenegado.set(false);

    try {
      const { email, contrasena } = this.form.value;
      await this.auth.iniciarSesion(email!, contrasena!);
      const rol = this.auth.perfil()?.rol;
      if (rol === 'inventario' || rol === 'admin') {
        this.router.navigate(['/inventario']);
      } else {
        await this.auth.cerrarSesion();
        this.accesoDenegado.set(true);
      }
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      this.mostrarError(this.traducirError(msg));
    } finally {
      this.cargando.set(false);
    }
  }

  cerrarError() {
    this.error.set(null);
    clearTimeout(this.errorTimeout);
  }

  private mostrarError(msg: string) {
    this.error.set(msg);
    clearTimeout(this.errorTimeout);
    this.errorTimeout = setTimeout(() => this.error.set(null), 6000);
  }

  private traducirError(mensaje: string): string {
    if (mensaje.includes('Invalid login credentials') || mensaje.includes('invalid_credentials'))
      return 'Credenciales incorrectas. Verifica tus datos e intenta de nuevo.';
    if (mensaje.includes('Too many requests') || mensaje.includes('rate limit'))
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    if (mensaje.includes('Failed to fetch') || mensaje.includes('network') || mensaje.includes('NetworkError'))
      return 'Sin conexión a internet. Verifica tu red e intenta de nuevo.';
    if (mensaje.includes('Email not confirmed'))
      return 'Cuenta sin confirmar. Contacta al administrador.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  }
}
