import { Component, inject, signal, effect } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { ReferidosService } from './core/services/referidos.service';
import { AuthService } from './core/services/auth.service';

const RUTAS_SIN_NAVBAR = [
  '/auth/', '/op', '/bodega-privada',
  '/catalogo', '/admin', '/inventario', '/perfil',
  '/recomienda', '/wallet', '/mis-pedidos', '/mis-ganancias',
  '/integraciones', '/admin-pedidos', '/mi-whatsapp',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    @if (mostrarNavbar()) {
      <app-navbar />
    }
    <main [class]="mostrarNavbar() ? 'pt-16 sm:pt-20' : ''">
      <router-outlet />
    </main>
  `,
})
export class App {
  private readonly router = inject(Router);
  private readonly referidos = inject(ReferidosService);
  private readonly auth = inject(AuthService);
  readonly mostrarNavbar = signal(this.esRutaConNavbar(this.router.url));

  constructor() {
    // Capturar ?ref=XXXX y guardarlo en localStorage para asociar al hacer login
    this.referidos.capturarCodigoDesdeUrl();

    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.mostrarNavbar.set(this.esRutaConNavbar(e.urlAfterRedirects));
      }
    });

    // Cuando el perfil esté cargado, aplicar el referidor pendiente (si lo hay)
    effect(() => {
      const perfil = this.auth.perfil();
      if (perfil) {
        this.referidos.aplicarReferidorPendienteSiCorresponde();
      }
    });
  }

  private esRutaConNavbar(url: string): boolean {
    return !RUTAS_SIN_NAVBAR.some((r) => url.startsWith(r));
  }
}
