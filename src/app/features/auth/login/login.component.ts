import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly mostrarContrasena = signal(false);
  readonly emailSinConfirmar = signal(false);
  readonly intentos = signal(0);

  private errorTimeout?: ReturnType<typeof setTimeout>;

  readonly cuentasPrueba = [
    { rol: 'Admin',      icono: 'shield_person', color: 'text-red-400',   email: 'admin@landazury.com',      contrasena: 'Admin2024!' },
    { rol: 'Inventario', icono: 'inventory_2',   color: 'text-amber-400', email: 'inventario@landazury.com', contrasena: 'Inv2024!' },
    { rol: 'Usuario',    icono: 'person',         color: 'text-slate-400', email: 'usuario@landazury.com',    contrasena: 'User2024!' },
  ];

  readonly form = this.fb.group({
    email:      ['', [Validators.required, Validators.email]],
    contrasena: ['', [Validators.required, Validators.minLength(6)]],
  });

  usarCredencial(email: string, contrasena: string) {
    this.form.patchValue({ email, contrasena });
    this.limpiarErrores();
  }

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.cargando()) return;

    this.cargando.set(true);
    this.limpiarErrores();

    try {
      const { email, contrasena } = this.form.value;
      await this.auth.iniciarSesion(email!, contrasena!);
      const rol = this.auth.perfil()?.rol;
      if (rol === 'admin') this.router.navigate(['/admin']);
      else if (rol === 'inventario') this.router.navigate(['/inventario']);
      else this.router.navigate(['/catalogo']);
    } catch (err: any) {
      this.intentos.update(n => n + 1);
      const msg: string = err?.message ?? '';
      if (msg.includes('Email not confirmed')) {
        this.emailSinConfirmar.set(true);
      } else {
        this.mostrarError(this.traducirError(msg));
      }
    } finally {
      this.cargando.set(false);
    }
  }

  cerrarError() {
    this.error.set(null);
    clearTimeout(this.errorTimeout);
  }

  private limpiarErrores() {
    this.error.set(null);
    this.emailSinConfirmar.set(false);
    clearTimeout(this.errorTimeout);
  }

  private mostrarError(msg: string) {
    this.error.set(msg);
    clearTimeout(this.errorTimeout);
    this.errorTimeout = setTimeout(() => this.error.set(null), 6000);
  }

  private traducirError(mensaje: string): string {
    if (mensaje.includes('Invalid login credentials') || mensaje.includes('invalid_credentials'))
      return 'Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.';
    if (mensaje.includes('Too many requests') || mensaje.includes('rate limit') || mensaje.includes('over_email_send_rate_limit'))
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    if (mensaje.includes('Failed to fetch') || mensaje.includes('network') || mensaje.includes('NetworkError'))
      return 'Sin conexión a internet. Verifica tu red e intenta de nuevo.';
    if (mensaje.includes('User not found'))
      return 'No existe una cuenta con este correo electrónico.';
    if (mensaje.includes('disabled') || mensaje.includes('banned'))
      return 'Esta cuenta ha sido suspendida. Contacta al administrador.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  }
}
