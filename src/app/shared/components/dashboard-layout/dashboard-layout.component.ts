import { Component, computed, inject, signal, effect, OnDestroy, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { DecimalPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { AvisosService } from '../../../core/services/avisos.service';
import { CatalogoFiltrosService } from '../../../core/services/catalogo-filtros.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { GananciasService } from '../../../core/services/ganancias.service';

const MENTORIA_TELEFONO_DEFAULT = '573202241463';
const MENTORIA_MENSAJE_DEFAULT =
  'Hola *HARLEY* estoy interesad@ en recibir mentoria para aprender a vender los productos de *MODA LANDAZURY* y DE *LANDAZURY IMPORTACIONES* quiero que me enseñes Gracias';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DecimalPipe, DatePipe, NgTemplateOutlet],
  templateUrl: './dashboard-layout.component.html',
})
export class DashboardLayoutComponent implements OnDestroy {
  readonly auth    = inject(AuthService);
  readonly avisos  = inject(AvisosService);
  readonly filtros = inject(CatalogoFiltrosService);
  private readonly router    = inject(Router);
  private readonly supabase  = inject(SupabaseService);
  private readonly ganancias = inject(GananciasService);

  readonly campanaPanelAbierto = signal(false);

  readonly menuAbierto = signal(true);
  readonly urlActual = signal(this.router.url);

  readonly saldoGanancias = signal(0);
  readonly tieneMetodoPago = signal(false);
  private realtimeChannel: any = null;
  private gananciasCargadas = false;
  private realtimeAvisosSub: any = null;

  private readonly mentoriaTelefono = signal(MENTORIA_TELEFONO_DEFAULT);
  private readonly mentoriaMensaje = signal(MENTORIA_MENSAJE_DEFAULT);

  readonly mentoriaUrl = computed(() => {
    const tel = this.mentoriaTelefono().replace(/\D+/g, '') || MENTORIA_TELEFONO_DEFAULT;
    const msg = encodeURIComponent(this.mentoriaMensaje() || MENTORIA_MENSAJE_DEFAULT);
    return `https://wa.me/${tel}?text=${msg}`;
  });

  constructor() {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.menuAbierto.set(false);
    }
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.urlActual.set(e.urlAfterRedirects);
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          this.menuAbierto.set(false);
        }
      }
    });
    this.cargarConfigMentoria();

    effect(() => {
      const perfil = this.auth.perfil();
      if (perfil && !this.gananciasCargadas) {
        const rol = perfil.rol as string;
        if (rol !== 'admin' && rol !== 'inventario') {
          this.gananciasCargadas = true;
          this.cargarDatosGanancias();
        }
      }
    });

    effect(() => {
      if (this.auth.estaAutenticado()) {
        this.avisos.cargar();
        if (!this.realtimeAvisosSub) {
          this.realtimeAvisosSub = this.avisos.suscribirRealtime();
        }
      }
    });
  }

  toggleCampana() {
    const abriendo = !this.campanaPanelAbierto();
    this.campanaPanelAbierto.set(abriendo);
    if (abriendo) this.avisos.marcarTodosLeidos();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('[data-campana]')) {
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

  ngOnDestroy() {
    if (this.realtimeChannel) {
      this.supabase.cliente.removeChannel(this.realtimeChannel);
    }
    this.realtimeAvisosSub?.unsubscribe();
  }

  private async cargarDatosGanancias() {
    try {
      const [billetera, metodos] = await Promise.all([
        this.ganancias.obtenerBilletera(),
        this.ganancias.obtenerMetodosPago(),
      ]);
      this.saldoGanancias.set(billetera?.saldo ?? 0);
      this.tieneMetodoPago.set(metodos.length > 0);
    } catch {}
    this.suscribirRealtimeGanancias();
  }

  private suscribirRealtimeGanancias() {
    const userId = this.auth.usuario()?.id;
    if (!userId) return;
    this.realtimeChannel = this.supabase.cliente
      .channel('header-billetera')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'billetera_ganancias',
        filter: `vendedor_id=eq.${userId}`,
      }, (payload: any) => {
        const n = payload.new as { saldo?: number } | null;
        if (n?.saldo !== undefined) this.saldoGanancias.set(Number(n.saldo));
      })
      .subscribe();
  }

  irAGanancias() {
    const accion = this.tieneMetodoPago() ? 'retirar' : 'configurar';
    this.router.navigate(['/mis-ganancias'], { queryParams: { accion } });
  }

  private async cargarConfigMentoria() {
    try {
      const { data } = await this.supabase.cliente
        .from('config_plataforma')
        .select('clave, valor')
        .in('clave', ['mentoria_telefono', 'mentoria_mensaje']);
      for (const row of data ?? []) {
        const v = typeof row.valor === 'string' ? row.valor : String(row.valor ?? '');
        if (row.clave === 'mentoria_telefono' && v) this.mentoriaTelefono.set(v);
        if (row.clave === 'mentoria_mensaje' && v) this.mentoriaMensaje.set(v);
      }
    } catch {}
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
