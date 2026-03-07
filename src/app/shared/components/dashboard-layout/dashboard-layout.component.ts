import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CatalogoFiltrosService } from '../../../core/services/catalogo-filtros.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './dashboard-layout.component.html',
})
export class DashboardLayoutComponent {
  readonly auth = inject(AuthService);
  readonly filtros = inject(CatalogoFiltrosService);
  private readonly router = inject(Router);
  readonly menuAbierto = signal(false);
  readonly urlActual = signal(this.router.url);

  constructor() {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.urlActual.set(e.urlAfterRedirects);
        this.menuAbierto.set(false);
      }
    });
  }

  esRutaActiva(ruta: string, tab?: string): boolean {
    const url = this.urlActual();
    if (!url.startsWith(ruta)) return false;
    if (tab) return url.includes(`tab=${tab}`);
    return !url.includes('tab=');
  }

  badgeRolClass(): string {
    const rol = this.auth.perfil()?.rol;
    if (rol === 'admin') return 'bg-red-900/30 text-red-300 border border-red-700/30';
    if (rol === 'inventario') return 'bg-amber-900/30 text-amber-300 border border-amber-700/30';
    return 'bg-slate-800/50 text-slate-300 border border-slate-600/30';
  }

  iconoRol(): string {
    const rol = this.auth.perfil()?.rol;
    if (rol === 'admin') return 'shield_person';
    if (rol === 'inventario') return 'inventory_2';
    return 'person';
  }
}
