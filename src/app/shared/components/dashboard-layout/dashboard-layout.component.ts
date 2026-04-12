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
    if (rol === 'admin') return 'bg-red-100 text-red-700 border border-red-200';
    if (rol === 'inventario') return 'bg-amber-100 text-amber-700 border border-amber-200';
    return 'bg-slate-100 text-slate-600 border border-slate-200';
  }

  iconoRol(): string {
    const rol = this.auth.perfil()?.rol;
    if (rol === 'admin') return 'shield_person';
    if (rol === 'inventario') return 'inventory_2';
    return 'person';
  }
}
