import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface CuentaAcceso {
  rol: 'Admin' | 'Inventario' | 'Usuario';
  icono: string;
  color: string;
  email: string;
  contrasena: string;
  ruta: string;
}

@Component({
  selector: 'app-acceso-rapido',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 bg-white">
      <main class="w-full max-w-xl">
        <div class="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-10">

          <div class="text-center mb-6 sm:mb-8">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4">
              <span class="material-symbols-outlined text-3xl text-primary-dark">vpn_key</span>
            </div>
            <p class="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-primary-dark mb-1">
              Acceso rápido interno
            </p>
            <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Cuentas de prueba
            </h1>
            <p class="text-slate-500 text-sm sm:text-base mt-1.5">
              Toca el rol para entrar al instante. Solo tú tienes esta URL.
            </p>
          </div>

          @if (error()) {
            <div class="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
              <span class="material-symbols-outlined text-xl shrink-0 mt-0.5 text-red-500">error</span>
              <p class="flex-1 leading-relaxed font-medium">{{ error() }}</p>
            </div>
          }

          <div class="space-y-3">
            @for (cuenta of cuentas; track cuenta.rol) {
              <button type="button"
                      (click)="ingresar(cuenta)"
                      [disabled]="cargando() === cuenta.rol"
                      class="w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-primary hover:bg-amber-50 transition-all text-left disabled:opacity-60 disabled:cursor-wait">
                <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0"
                     [class]="cuenta.color">
                  <span class="material-symbols-outlined text-2xl sm:text-3xl">{{ cuenta.icono }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-base sm:text-lg font-black text-slate-900 uppercase tracking-wider">
                    {{ cuenta.rol }}
                  </p>
                  <p class="text-xs sm:text-sm text-slate-500 truncate font-medium">{{ cuenta.email }}</p>
                </div>
                @if (cargando() === cuenta.rol) {
                  <svg class="animate-spin w-5 h-5 text-primary-dark shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                } @else {
                  <span class="material-symbols-outlined text-primary-dark shrink-0">arrow_forward</span>
                }
              </button>
            }
          </div>

          <div class="mt-7 text-center">
            <a routerLink="/" class="text-xs sm:text-sm text-slate-400 hover:text-slate-700 transition-colors font-semibold">
              ← Volver al inicio
            </a>
          </div>
        </div>
      </main>
    </div>
  `,
})
export class AccesoRapidoComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly cargando = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly cuentas: CuentaAcceso[] = [
    { rol: 'Admin',      icono: 'shield_person', color: 'bg-red-100 text-red-700',     email: 'admin@landazury.com',      contrasena: 'Admin2024!', ruta: '/admin' },
    { rol: 'Inventario', icono: 'inventory_2',   color: 'bg-amber-100 text-amber-700', email: 'inventario@landazury.com', contrasena: 'Inv2024!',   ruta: '/inventario' },
    { rol: 'Usuario',    icono: 'person',        color: 'bg-slate-100 text-slate-700', email: 'usuario@landazury.com',    contrasena: 'User2024!',  ruta: '/catalogo' },
  ];

  async ingresar(cuenta: CuentaAcceso) {
    if (this.cargando()) return;
    this.cargando.set(cuenta.rol);
    this.error.set(null);
    try {
      await this.auth.iniciarSesion(cuenta.email, cuenta.contrasena);
      await this.router.navigate([cuenta.ruta]);
    } catch (e: any) {
      this.error.set('No se pudo iniciar sesión: ' + (e?.message ?? 'error desconocido'));
      this.cargando.set(null);
    }
  }
}
