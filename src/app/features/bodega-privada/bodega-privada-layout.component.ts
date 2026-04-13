import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { InventarioComponent } from '../inventario/inventario.component';

@Component({
  selector: 'app-bodega-privada-layout',
  standalone: true,
  imports: [CommonModule, InventarioComponent],
  template: `
    <div class="min-h-screen bg-slate-50 flex flex-col">
      <!-- Topbar privada: sin links a /admin, /catalogo, etc. -->
      <header class="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-amber-700 text-xl">warehouse</span>
            </div>
            <div class="min-w-0">
              <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary-dark">Landazury</p>
              <p class="text-sm sm:text-base font-black text-slate-900 leading-tight truncate">
                Bodega Privada
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <div class="hidden sm:flex flex-col items-end leading-tight">
              <p class="text-xs font-bold text-slate-800 truncate max-w-[12rem]">{{ auth.perfil()?.nombre || 'Subidor' }}</p>
              <p class="text-[10px] text-slate-500 truncate max-w-[12rem]">{{ auth.usuario()?.email }}</p>
            </div>
            <button (click)="auth.cerrarSesion()"
                    aria-label="Cerrar sesión"
                    class="w-11 h-11 flex items-center justify-center rounded-xl text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
                    [disabled]="auth.cerrandoSesion()">
              <span class="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Contenido: reusa el mismo componente de inventario -->
      <main class="flex-1">
        <app-inventario />
      </main>
    </div>
  `,
})
export class BodegaPrivadaLayoutComponent {
  readonly auth = inject(AuthService);
}
