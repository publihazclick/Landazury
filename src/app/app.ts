import { Component, inject, signal, effect } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';

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
  readonly mostrarNavbar = signal(!this.router.url.startsWith('/auth/'));

  constructor() {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.mostrarNavbar.set(!e.urlAfterRedirects.startsWith('/auth/'));
      }
    });
  }
}
