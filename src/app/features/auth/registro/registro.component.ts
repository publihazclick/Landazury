import { Component, computed, inject, signal } from '@angular/core';
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
  readonly emailExiste = signal(false);

  private errorTimeout?: ReturnType<typeof setTimeout>;

  readonly form = this.fb.group({
    nombre:     ['', [Validators.required, Validators.minLength(2)]],
    email:      ['', [Validators.required, Validators.email]],
    pais:       ['', Validators.required],
    telefono:   ['', Validators.required],
    plataforma: ['', Validators.required],
    contrasena: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly paises = [
    'México', 'Colombia', 'Argentina', 'Chile', 'Perú', 'Venezuela',
    'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'Guatemala', 'Honduras',
    'El Salvador', 'Nicaragua', 'Costa Rica', 'Panamá', 'Cuba', 'República Dominicana',
  ];

  readonly indicativosPais: Record<string, string> = {
    'México': '+52', 'Colombia': '+57', 'Argentina': '+54',
    'Chile': '+56', 'Perú': '+51', 'Venezuela': '+58',
    'Ecuador': '+593', 'Bolivia': '+591', 'Paraguay': '+595',
    'Uruguay': '+598', 'Guatemala': '+502', 'Honduras': '+504',
    'El Salvador': '+503', 'Nicaragua': '+505', 'Costa Rica': '+506',
    'Panamá': '+507', 'Cuba': '+53', 'República Dominicana': '+1',
  };

  get indicativoActual(): string {
    return this.indicativosPais[this.form.get('pais')?.value ?? ''] ?? '';
  }

  get fuerzaContrasena(): { nivel: number; label: string; color: string } {
    const v = this.form.get('contrasena')?.value ?? '';
    let nivel = 0;
    if (v.length >= 6) nivel++;
    if (v.length >= 10) nivel++;
    if (/[A-Z]/.test(v) && /[0-9]/.test(v)) nivel++;
    if (/[^A-Za-z0-9]/.test(v)) nivel++;
    const configs = [
      { label: '', color: '' },
      { label: 'Débil', color: 'bg-red-500' },
      { label: 'Regular', color: 'bg-amber-400' },
      { label: 'Buena', color: 'bg-emerald-400' },
      { label: 'Fuerte', color: 'bg-emerald-500' },
    ];
    return { nivel, ...configs[nivel] };
  }

  cerrarError() {
    this.error.set(null);
    clearTimeout(this.errorTimeout);
  }

  private mostrarError(msg: string) {
    this.error.set(msg);
    clearTimeout(this.errorTimeout);
    this.errorTimeout = setTimeout(() => this.error.set(null), 7000);
  }

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.cargando()) return;

    this.cargando.set(true);
    this.error.set(null);
    this.emailExiste.set(false);

    try {
      const { email, contrasena, nombre, pais, telefono, plataforma } = this.form.value;
      const whatsapp = telefono
        ? (this.indicativoActual ? `${this.indicativoActual} ${telefono}` : telefono)
        : undefined;
      await this.auth.registrar(email!, contrasena!, nombre!, {
        pais: pais ?? undefined,
        telefono: whatsapp,
        plataforma: plataforma ?? undefined,
      });
      this.exitoso.set(true);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        this.emailExiste.set(true);
      } else {
        this.mostrarError(this.traducirError(msg));
      }
    } finally {
      this.cargando.set(false);
    }
  }

  private traducirError(mensaje: string): string {
    if (mensaje.includes('Password should be at least'))
      return 'La contraseña debe tener al menos 6 caracteres.';
    if (mensaje.includes('Too many requests') || mensaje.includes('rate limit') || mensaje.includes('over_email_send_rate_limit'))
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    if (mensaje.includes('Failed to fetch') || mensaje.includes('network') || mensaje.includes('NetworkError'))
      return 'Sin conexión a internet. Verifica tu red e intenta de nuevo.';
    if (mensaje.includes('invalid email') || mensaje.includes('Unable to validate'))
      return 'El formato del correo electrónico no es válido.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  }
}
