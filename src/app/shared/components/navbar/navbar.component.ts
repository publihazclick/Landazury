import { Component, inject, signal, effect, OnDestroy, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { AvisosService } from '../../../core/services/avisos.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, DatePipe, NgTemplateOutlet],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements OnDestroy {
  readonly auth   = inject(AuthService);
  readonly avisos = inject(AvisosService);

  readonly menuAbierto         = signal(false);
  readonly campanaPanelAbierto = signal(false);

  private realtimeSub: any = null;

  constructor() {
    effect(() => {
      if (this.auth.estaAutenticado()) {
        this.avisos.cargar();
        if (!this.realtimeSub) {
          this.realtimeSub = this.avisos.suscribirRealtime();
        }
      }
    });
  }

  ngOnDestroy() {
    this.realtimeSub?.unsubscribe();
  }

  toggleMenu() { this.menuAbierto.update(v => !v); }

  toggleCampana() {
    const abriendo = !this.campanaPanelAbierto();
    this.campanaPanelAbierto.set(abriendo);
    if (abriendo) this.avisos.marcarTodosLeidos();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-campana]')) {
      this.campanaPanelAbierto.set(false);
    }
  }

  tipoColor(tipo: string): string {
    return ({
      info:    'bg-sky-100 text-sky-700 border-sky-200',
      promo:   'bg-amber-100 text-amber-700 border-amber-200',
      alerta:  'bg-red-100 text-red-700 border-red-200',
      novedad: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    } as any)[tipo] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  }

  tipoIcono(tipo: string): string {
    return ({
      info:    'info',
      promo:   'local_offer',
      alerta:  'warning',
      novedad: 'auto_awesome',
    } as any)[tipo] ?? 'notifications';
  }
}
