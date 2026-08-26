import { Component, inject, signal, OnInit, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DecimalPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ReferidosService } from '../../core/services/referidos.service';
import { WalletService } from '../../core/services/wallet.service';
import { SupabaseService } from '../../core/services/supabase.service';
import type { ReferidoListado, StatsReferidos, ComisionReferido } from '../../core/models/referidos.model';

@Component({
  selector: 'app-recomienda',
  standalone: true,
  imports: [DecimalPipe, DatePipe],
  template: `
    <div class="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

      <!-- Header / Hero -->
      <div class="rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white p-6 sm:p-8 shadow-xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs sm:text-sm font-bold uppercase tracking-widest opacity-80 mb-2">Recomienda y gana</p>
            <h1 class="text-3xl sm:text-4xl font-black leading-tight">Invita amigos, gana comisión por cada entrega</h1>
            <p class="opacity-90 mt-2 text-sm sm:text-base">
              Comparte tu link. Cuando alguien se registre por tu invitación,
              ganas
              @if (config().mode === 'flat' && config().flat > 0) {
                <span class="font-black underline">\${{ config().flat | number:'1.0-0' }} COP</span>
              } @else if (config().mode === 'pct' && config().pct > 0) {
                <span class="font-black underline">{{ config().pct }}%</span> de comisión
              } @else {
                la comisión configurada por el admin
              }
              por cada pedido <span class="font-bold">entregado</span> que haga.
            </p>
          </div>
          <span class="material-symbols-outlined text-5xl sm:text-6xl opacity-80 hidden sm:inline">campaign</span>
        </div>
      </div>

      <!-- Link corto -->
      <div class="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <p class="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Tu link de invitación</p>

        @if (cargandoCodigo()) {
          <div class="text-slate-500 text-sm">Generando tu código…</div>
        } @else if (referralCode()) {
          <div class="flex flex-col sm:flex-row items-stretch gap-2">
            <div class="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 font-mono text-sm sm:text-base text-slate-800 break-all">
              {{ link() }}
            </div>
            <button (click)="copiarLink()" type="button"
                    class="px-5 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 active:scale-95 transition inline-flex items-center justify-center gap-2 whitespace-nowrap">
              <span class="material-symbols-outlined text-[20px]">{{ copiado() ? 'check' : 'content_copy' }}</span>
              {{ copiado() ? '¡Copiado!' : 'Copiar link' }}
            </button>
          </div>

          <p class="text-xs text-slate-500 mt-3">Tu código es <span class="font-mono font-bold text-slate-800">{{ referralCode() }}</span></p>

          <!-- Botones compartir -->
          <div class="mt-4 flex flex-wrap gap-2">
            <a [href]="urlWhatsApp()" target="_blank" rel="noopener noreferrer"
               class="px-4 py-2.5 rounded-xl bg-[#25D366] text-white font-bold hover:opacity-90 inline-flex items-center gap-2 text-sm">
              <span class="material-symbols-outlined text-[18px]">chat</span>
              WhatsApp
            </a>
            <a [href]="urlFacebook()" target="_blank" rel="noopener noreferrer"
               class="px-4 py-2.5 rounded-xl bg-[#1877F2] text-white font-bold hover:opacity-90 inline-flex items-center gap-2 text-sm">
              <span class="material-symbols-outlined text-[18px]">share</span>
              Facebook
            </a>
            <a [href]="urlTelegram()" target="_blank" rel="noopener noreferrer"
               class="px-4 py-2.5 rounded-xl bg-[#26A5E4] text-white font-bold hover:opacity-90 inline-flex items-center gap-2 text-sm">
              <span class="material-symbols-outlined text-[18px]">send</span>
              Telegram
            </a>
            @if (puedeCompartirNativo()) {
              <button (click)="compartirNativo()" type="button"
                      class="px-4 py-2.5 rounded-xl border-2 border-slate-300 text-slate-700 font-bold hover:bg-slate-50 inline-flex items-center gap-2 text-sm">
                <span class="material-symbols-outlined text-[18px]">ios_share</span>
                Más…
              </button>
            }
          </div>
        } @else {
          <div class="text-slate-500 text-sm">No se pudo cargar tu código. Intenta refrescar la página.</div>
        }
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Mis referidos</p>
          <p class="text-3xl font-black text-slate-900 mt-1">{{ stats().total_referidos }}</p>
          <p class="text-xs text-slate-500 mt-1">personas registradas con tu link</p>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Ganado</p>
          <p class="text-3xl font-black text-emerald-600 mt-1">\${{ stats().total_ganado | number:'1.0-0' }}</p>
          <p class="text-xs text-slate-500 mt-1">acreditado a tu wallet</p>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <p class="text-xs font-bold uppercase tracking-widest text-slate-400">En camino</p>
          <p class="text-3xl font-black text-amber-600 mt-1">{{ stats().pedidos_pendientes }}</p>
          <p class="text-xs text-slate-500 mt-1">pedidos pendientes de entrega</p>
        </div>
      </div>

      <!-- Lista de referidos -->
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 class="font-black text-slate-900">Mis referidos directos</h2>
          <button (click)="recargar()" type="button"
                  class="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px]">refresh</span> Actualizar
          </button>
        </div>

        @if (cargandoReferidos()) {
          <div class="p-8 text-center text-slate-500 text-sm">Cargando…</div>
        } @else if (referidos().length === 0) {
          <div class="p-8 text-center">
            <span class="material-symbols-outlined text-5xl text-slate-300">groups</span>
            <p class="text-slate-500 text-sm mt-2">Aún no tienes referidos. ¡Comparte tu link!</p>
          </div>
        } @else {
          <ul class="divide-y divide-slate-100">
            @for (r of referidos(); track r.id) {
              <li class="px-5 py-4 flex items-center gap-3">
                <div class="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black shrink-0">
                  {{ r.nombre[0]?.toUpperCase() ?? '?' }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-slate-900 truncate">{{ r.nombre }}</p>
                  <p class="text-xs text-slate-500 truncate">
                    {{ r.pais ? r.pais + ' · ' : '' }}desde {{ r.creado_en | date:'shortDate' }}
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-black text-emerald-600">\${{ r.comisiones_generadas | number:'1.0-0' }}</p>
                  <p class="text-[11px] text-slate-500">
                    {{ r.pedidos_entregados }} entregado{{ r.pedidos_entregados === 1 ? '' : 's' }}
                    @if (r.pedidos_pendientes > 0) {
                      · {{ r.pedidos_pendientes }} en camino
                    }
                  </p>
                </div>
              </li>
            }
          </ul>
        }
      </div>

      <!-- Comisiones recientes -->
      @if (comisiones().length > 0) {
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-200">
            <h2 class="font-black text-slate-900">Comisiones recientes</h2>
          </div>
          <ul class="divide-y divide-slate-100">
            @for (c of comisiones(); track c.id) {
              <li class="px-5 py-3.5 flex items-center gap-3">
                <span class="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[18px] text-emerald-700">check_circle</span>
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-slate-900">Comisión {{ c.porcentaje_aplicado }}%</p>
                  <p class="text-[11px] text-slate-500">{{ c.creado_en | date:'short' }}</p>
                </div>
                <p class="text-sm font-black text-emerald-600">+\${{ c.monto | number:'1.0-0' }}</p>
              </li>
            }
          </ul>
        </div>
      }

    </div>
  `,
})
export class RecomiendaComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly referidosSvc = inject(ReferidosService);
  private readonly walletSvc = inject(WalletService);
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly cargandoCodigo = signal(true);
  readonly cargandoReferidos = signal(true);
  readonly referralCode = signal<string | null>(null);
  readonly referidos = signal<ReferidoListado[]>([]);
  readonly comisiones = signal<ComisionReferido[]>([]);
  readonly stats = signal<StatsReferidos>({ total_referidos: 0, total_ganado: 0, pedidos_pendientes: 0 });
  readonly config = signal<{ mode: 'flat' | 'pct'; flat: number; pct: number }>({ mode: 'flat', flat: 0, pct: 0 });
  readonly copiado = signal(false);

  readonly link = computed(() => {
    const code = this.referralCode();
    return code ? this.referidosSvc.linkReferido(code) : '';
  });

  readonly mensajeCompartir = computed(() => {
    const code = this.referralCode();
    if (!code) return '';
    return `¡Únete a Landazury y empieza a vender por dropshipping! Usa mi link: ${this.link()}`;
  });

  urlWhatsApp = computed(() => `https://wa.me/?text=${encodeURIComponent(this.mensajeCompartir())}`);
  urlTelegram = computed(() => `https://t.me/share/url?url=${encodeURIComponent(this.link())}&text=${encodeURIComponent('¡Únete a Landazury!')}`);
  urlFacebook = computed(() => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.link())}`);

  async ngOnInit() {
    const perfil = this.auth.perfil();
    if (perfil?.referral_code) {
      this.referralCode.set(perfil.referral_code);
      this.cargandoCodigo.set(false);
    } else if (perfil) {
      // Perfil cargado pero el cliente aún tiene la versión vieja sin referral_code. Refrescar.
      try {
        const { data } = await this.supabase.cliente
          .from('perfiles')
          .select('referral_code')
          .eq('id', perfil.id)
          .single();
        if (data?.referral_code) this.referralCode.set(data.referral_code);
      } catch {}
      this.cargandoCodigo.set(false);
    } else {
      this.cargandoCodigo.set(false);
    }

    // Cargar config para mostrar la comisión vigente
    try {
      const cfg = await this.walletSvc.obtenerConfig();
      const mode = (cfg.referral_commission_mode === 'pct' ? 'pct' : 'flat') as 'pct' | 'flat';
      this.config.set({
        mode,
        flat: Number(cfg.referral_commission_flat ?? 0),
        pct: Number(cfg.referral_commission_pct ?? 0),
      });
    } catch {}

    await this.recargar();
  }

  async recargar() {
    this.cargandoReferidos.set(true);
    try {
      const [stats, refs, coms] = await Promise.all([
        this.referidosSvc.obtenerStats(),
        this.referidosSvc.listarMisReferidos(),
        this.referidosSvc.listarMisComisiones(20),
      ]);
      this.stats.set(stats);
      this.referidos.set(refs);
      this.comisiones.set(coms);
    } catch {
      // ignorar; signals quedan en su último valor
    } finally {
      this.cargandoReferidos.set(false);
    }
  }

  async copiarLink() {
    if (!isPlatformBrowser(this.platformId)) return;
    const link = this.link();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {}
  }

  puedeCompartirNativo(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return typeof (navigator as any).share === 'function';
  }

  async compartirNativo() {
    if (!this.puedeCompartirNativo()) return;
    try {
      await (navigator as any).share({
        title: 'Landazury',
        text: this.mensajeCompartir(),
        url: this.link(),
      });
    } catch {}
  }
}
