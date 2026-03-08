import { Component, inject, signal, effect } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';

const RUTAS_SIN_NAVBAR = ['/auth/', '/catalogo', '/admin', '/inventario', '/perfil', '/op'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    @if (mostrarNavbar()) {
      <app-navbar />
    }
    <main [class]="mostrarNavbar() ? 'pt-20' : ''">
      <router-outlet />
    </main>
  `,
})
export class App {
  private readonly router = inject(Router);
  readonly mostrarNavbar = signal(this.esRutaConNavbar(this.router.url));

  constructor() {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.mostrarNavbar.set(this.esRutaConNavbar(e.urlAfterRedirects));
      }
    });
  }

  private esRutaConNavbar(url: string): boolean {
    return !RUTAS_SIN_NAVBAR.some((r) => url.startsWith(r));
  }
}
