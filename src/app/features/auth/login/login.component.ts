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

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    contrasena: ['', [Validators.required, Validators.minLength(6)]],
  });

  async onSubmit() {
    if (this.form.invalid || this.cargando()) return;

    this.cargando.set(true);
    this.error.set(null);

    try {
      const { email, contrasena } = this.form.value;
      await this.auth.iniciarSesion(email!, contrasena!);
      this.router.navigate(['/catalogo']);
    } catch (err: any) {
      this.error.set(this.traducirError(err.message));
    } finally {
      this.cargando.set(false);
    }
  }

  private traducirError(mensaje: string): string {
    if (mensaje.includes('Invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (mensaje.includes('Email not confirmed')) {
      return 'Confirma tu correo antes de iniciar sesión.';
    }
    return 'Ocurrió un error. Inténtalo de nuevo.';
  }
}
