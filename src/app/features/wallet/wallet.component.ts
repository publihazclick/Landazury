import { Component, inject, signal, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WalletService } from '../../core/services/wallet.service';
import { AuthService } from '../../core/services/auth.service';
// AuthService re-exposed via readonly auth; used in template
import type { MovimientoWallet, TipoMovimiento } from '../../core/models/wallet.model';

declare global {
  interface Window {
    ePayco?: any;
  }
}

const EPAYCO_CHECKOUT_SCRIPT = 'https://checkout.epayco.co/checkout.js';

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

      @if (auth.esTestUser()) {
        <div class="rounded-2xl bg-purple-50 border border-purple-200 p-4 flex items-start gap-3">
          <span class="material-symbols-outlined text-purple-600 text-2xl">science</span>
          <div>
            <p class="font-black text-purple-900">Modo prueba activo</p>
            <p class="text-sm text-purple-700 mt-0.5">
              Tu cuenta es de prueba. Puedes generar pedidos sin recargar el wallet — no se debitará saldo.
            </p>
          </div>
        </div>
      }

      <!-- Banner educativo: cómo funcionan las recargas -->
      <div class="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        <div class="bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-4">
          <p class="font-black text-white text-base">🔁 ¿Cómo funcionan las recargas para generar guías?</p>
          <p class="text-white/90 text-sm mt-1.5 leading-relaxed">
            Para poder crear guías de envío, primero debes recargar saldo en tu wallet (tu monedero dentro de la página).
            <strong class="text-white">Ese dinero no es un gasto</strong> — es como un anticipo que se te devuelve poco a poco.
          </p>
        </div>
        <div class="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div class="bg-green-50 px-4 py-4">
            <p class="font-bold text-green-900 flex items-center gap-1.5 mb-2 text-sm">
              <span class="material-symbols-outlined text-base text-green-600">check_circle</span>
              ¿Cómo se devuelve?
            </p>
            <p class="text-xs text-green-800 leading-relaxed">
              Cuando vendes y la entrega es exitosa, la transportadora cobrará el flete
              <strong>dentro del valor de la venta</strong> al cliente — tú ya lo adelantaste con tu recarga.
            </p>
          </div>
          <div class="bg-slate-50 px-4 py-4">
            <p class="font-bold text-slate-700 flex items-center gap-1.5 mb-2 text-sm">
              <span class="material-symbols-outlined text-base text-slate-500">account_balance</span>
              El sistema reparte así
            </p>
            <ul class="space-y-1.5 text-xs text-slate-700">
              <li class="flex items-start gap-1.5">
                <span class="material-symbols-outlined text-[13px] text-slate-400 mt-0.5 shrink-0">storefront</span>
                <span>Precio a dropshippers → <strong>al proveedor.</strong></span>
              </li>
              <li class="flex items-start gap-1.5">
                <span class="material-symbols-outlined text-[13px] text-amber-500 mt-0.5 shrink-0">trending_up</span>
                <span>Ganancias + valor del flete → <strong>a ti.</strong></span>
              </li>
            </ul>
          </div>
          <div class="bg-blue-50 px-4 py-4">
            <p class="font-bold text-blue-900 flex items-center gap-1.5 mb-2 text-sm">
              <span>💡</span> En resumen
            </p>
            <p class="text-xs text-blue-800 leading-relaxed">
              Lo que recargas lo recuperas completo cuando tus pedidos se entregan bien.
              <strong>No lo pierdes, solo lo adelantas para poder operar.</strong>
            </p>
          </div>
        </div>
      </div>

      <!-- Teaser billetera ganancias -->
      <a routerLink="/mis-ganancias"
         class="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50
                border border-emerald-200 hover:border-emerald-400 hover:shadow-md transition group">
        <div class="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow">
          <span class="material-symbols-outlined text-white text-2xl">savings</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-black text-emerald-900 text-sm">Mis Ganancias</p>
          <p class="text-xs text-emerald-700 mt-0.5">
            Aquí se acreditan automáticamente tus ganancias cuando se entrega cada pedido.
          </p>
        </div>
        <span class="material-symbols-outlined text-emerald-400 group-hover:text-emerald-600 transition">chevron_right</span>
      </a>

      <!-- Header: saldo -->
      <div class="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-white p-6 sm:p-8 shadow-xl">
        <p class="text-xs sm:text-sm font-bold uppercase tracking-widest opacity-80 mb-2">Saldo disponible</p>
        <div class="flex items-end gap-2">
          <span class="text-4xl sm:text-5xl font-black">\${{ wallet.saldo() | number:'1.0-0' }}</span>
          <span class="text-sm font-bold opacity-80 mb-1.5">COP</span>
        </div>
        <p class="text-xs opacity-80 mt-2">
          Tu wallet se usa para cubrir el flete de cada pedido y, si eliges pago anticipado, el valor del producto.
        </p>
        <button (click)="abrirRecarga()" type="button"
                class="mt-5 px-5 py-3 rounded-xl bg-white text-primary font-black hover:bg-slate-100 active:scale-95 transition shadow-lg inline-flex items-center gap-2">
          <span class="material-symbols-outlined">add_circle</span>
          Recargar wallet
        </button>
      </div>

      <!-- Historial -->
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 class="font-black text-slate-900">Historial de movimientos</h2>
          <button (click)="recargar()" type="button"
                  class="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px]">refresh</span> Actualizar
          </button>
        </div>

        @if (cargando()) {
          <div class="p-8 text-center text-slate-500 text-sm">Cargando…</div>
        } @else if (movimientos().length === 0) {
          <div class="p-8 text-center text-slate-500 text-sm">
            Todavía no tienes movimientos. ¡Recarga tu wallet para empezar a hacer pedidos!
          </div>
        } @else {
          <ul class="divide-y divide-slate-100">
            @for (m of movimientos(); track m.id) {
              <li class="px-5 py-3.5 flex items-center gap-3">
                <span class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                      [class]="iconoFondo(m.tipo)">
                  <span class="material-symbols-outlined text-[20px]" [class]="iconoColor(m.tipo)">
                    {{ icono(m.tipo) }}
                  </span>
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-slate-900 truncate">{{ etiqueta(m.tipo) }}</p>
                  <p class="text-xs text-slate-500 truncate">
                    {{ m.descripcion || '—' }}
                    · {{ m.creado_en | date:'dd/MM/yy HH:mm' }}
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-black" [class.text-green-600]="m.monto > 0" [class.text-red-600]="m.monto < 0">
                    {{ m.monto > 0 ? '+' : '' }}\${{ m.monto | number:'1.0-0' }}
                  </p>
                  <p class="text-[10px] text-slate-400">Saldo: \${{ m.saldo_despues | number:'1.0-0' }}</p>
                </div>
              </li>
            }
          </ul>
        }
      </div>

      <!-- Modal de recarga -->
      @if (modalRecarga()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
             data-backdrop (click)="onBackdrop($event)">
          <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

            <!-- Header fijo -->
            <div class="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <h3 class="font-black text-slate-900">Recargar wallet</h3>
              <button (click)="cerrarRecarga()" type="button"
                      class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>

            <!-- Cuerpo desplazable -->
            <div class="overflow-y-auto px-5 pb-5 space-y-4 flex-1">

            <!-- Info: cómo funcionan las recargas -->
            <div class="rounded-2xl overflow-hidden border border-slate-200 text-sm">
              <div class="bg-amber-50 px-4 py-3 border-b border-amber-100">
                <p class="font-black text-amber-900">🔁 ¿Cómo funcionan las recargas para generar guías?</p>
                <p class="text-amber-800 mt-1 text-xs leading-relaxed">
                  Para poder crear guías de envío, primero debes recargar saldo en tu wallet (tu monedero dentro de la página).
                  <strong>Ese dinero no es un gasto</strong> — es como un anticipo que se te devuelve poco a poco.
                </p>
              </div>
              <div class="bg-green-50 px-4 py-3 border-b border-green-100">
                <p class="font-bold text-green-900 flex items-center gap-1.5 mb-2">
                  <span class="material-symbols-outlined text-base text-green-600">check_circle</span>
                  ¿Cómo se devuelve?
                </p>
                <p class="text-xs text-green-800 mb-2">Cuando vendes y la entrega es exitosa:</p>
                <ul class="space-y-1.5 text-xs text-green-800">
                  <li class="flex items-start gap-1.5">
                    <span class="material-symbols-outlined text-[14px] text-green-500 mt-0.5 shrink-0">local_shipping</span>
                    La transportadora cobrará el flete <strong>dentro del valor de la venta</strong> al cliente — tú ya lo adelantaste con tu recarga.
                  </li>
                  <li class="flex items-start gap-1.5">
                    <span class="material-symbols-outlined text-[14px] text-green-500 mt-0.5 shrink-0">storefront</span>
                    Precio a dropshippers (costo del producto) → se envía al proveedor.
                  </li>
                  <li class="flex items-start gap-1.5">
                    <span class="material-symbols-outlined text-[14px] text-green-500 mt-0.5 shrink-0">trending_up</span>
                    Ganancias + valor del flete → se envían a ti.
                  </li>
                </ul>
              </div>
              <div class="bg-blue-50 px-4 py-3">
                <p class="font-bold text-blue-900 flex items-center gap-1.5 mb-1">
                  <span>💡</span> En resumen
                </p>
                <p class="text-xs text-blue-800 leading-relaxed">
                  Lo que recargas lo recuperas completo cuando tus pedidos se entregan bien.
                  <strong>No lo pierdes, solo lo adelantas para poder operar.</strong>
                </p>
              </div>
            </div>

            <p class="text-sm text-slate-600">
              Mínimo <strong>\${{ recargaMinima() | number:'1.0-0' }} COP</strong>. Paga con tarjeta, PSE o Nequi vía ePayco.
            </p>

            <div class="grid grid-cols-3 gap-2">
              @for (m of montosSugeridos; track m) {
                <button type="button" (click)="monto = m"
                        [class.ring-2]="monto === m"
                        [class.ring-primary]="monto === m"
                        [class.bg-primary]="monto === m"
                        [class.text-white]="monto === m"
                        [class.bg-slate-50]="monto !== m"
                        class="py-2.5 rounded-xl font-bold text-sm border border-slate-200 hover:border-primary transition">
                  \${{ m | number:'1.0-0' }}
                </button>
              }
            </div>

            <label class="block">
              <span class="text-xs font-bold text-slate-600">Otro monto (COP)</span>
              <input type="number" [(ngModel)]="monto" [min]="recargaMinima()" name="monto"
                     class="mt-1 w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"/>
            </label>

            <!-- Desglose comisión pasarela -->
            <div class="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
              <div class="flex justify-between px-4 py-2.5">
                <span class="text-slate-600">Acreditado en tu wallet</span>
                <span class="font-bold text-green-700">\${{ monto | number:'1.0-0' }} COP</span>
              </div>
              <div class="flex justify-between px-4 py-2.5">
                <span class="text-slate-500 text-xs">Comisión pasarela ePayco</span>
                <span class="text-slate-500 text-xs">+ \${{ feeRecarga | number:'1.0-0' }} COP</span>
              </div>
              <div class="flex justify-between px-4 py-2.5 bg-white rounded-b-xl">
                <span class="font-black text-slate-900">Total a pagar</span>
                <span class="font-black text-primary">\${{ totalConFee | number:'1.0-0' }} COP</span>
              </div>
            </div>

            @if (error()) {
              <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{{ error() }}</div>
            }

            <div class="flex gap-2">
              <button type="button" (click)="cerrarRecarga()"
                      class="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
                Cancelar
              </button>
              <button type="button" (click)="pagar()" [disabled]="procesando()"
                      class="flex-1 py-2.5 rounded-xl bg-primary text-white font-black hover:bg-primary/90 disabled:opacity-50">
                @if (procesando()) { Abriendo… } @else { Pagar \${{ totalConFee | number:'1.0-0' }} }
              </button>
            </div>

            </div><!-- /cuerpo desplazable -->
          </div>
        </div>
      }
    </div>
  `,
})
export class WalletComponent implements OnInit {
  readonly wallet = inject(WalletService);
  readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly movimientos = signal<MovimientoWallet[]>([]);
  readonly cargando = signal(true);
  readonly modalRecarga = signal(false);
  readonly procesando = signal(false);
  readonly error = signal<string | null>(null);
  readonly recargaMinima = signal(30000);

  monto = 30000;
  readonly montosSugeridos = [30000, 50000, 100000, 200000, 500000, 1000000];

  get feeRecarga(): number {
    const m = Number(this.monto) || 0;
    return Math.ceil(m * 0.035) + 900;
  }

  get totalConFee(): number {
    return (Number(this.monto) || 0) + this.feeRecarga;
  }

  async ngOnInit() {
    const cfg = await this.wallet.obtenerConfig().catch(() => null);
    if (cfg) {
      this.recargaMinima.set(cfg.flete_plano ? cfg.recarga_minima : 30000);
      if (this.monto < cfg.recarga_minima) this.monto = cfg.recarga_minima;
    }
    await this.recargar();
  }

  async recargar() {
    this.cargando.set(true);
    try {
      await this.wallet.refrescarSaldo();
      const movs = await this.wallet.obtenerMovimientos(80);
      this.movimientos.set(movs);
    } catch (e: any) {
      this.error.set(e?.message ?? null);
    } finally {
      this.cargando.set(false);
    }
  }

  abrirRecarga() {
    this.error.set(null);
    this.monto = Math.max(this.monto, this.recargaMinima());
    this.modalRecarga.set(true);
  }

  cerrarRecarga() {
    this.modalRecarga.set(false);
  }

  onBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).dataset['backdrop']) this.cerrarRecarga();
  }

  async pagar() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.procesando()) return;
    const monto = Number(this.monto);
    if (!Number.isFinite(monto) || monto < this.recargaMinima()) {
      this.error.set(`El monto mínimo es ${this.recargaMinima()} COP`);
      return;
    }

    this.error.set(null);
    this.procesando.set(true);
    try {
      const resp = await this.wallet.crearCheckoutRecarga(monto);
      await this.cargarScriptEpayco();
      const handler = window.ePayco?.checkout?.configure({
        key: resp.checkout['public_key'],
        test: resp.checkout['test'] === 'true',
      });
      handler?.open(resp.checkout);
      // Cerrar modal una vez lanzado el checkout
      this.cerrarRecarga();
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo iniciar el pago');
    } finally {
      this.procesando.set(false);
    }
  }

  private cargarScriptEpayco(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') { reject(new Error('No browser')); return; }
      if (window.ePayco) { resolve(); return; }
      const existing = document.querySelector(`script[src="${EPAYCO_CHECKOUT_SCRIPT}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar ePayco')));
        return;
      }
      const s = document.createElement('script');
      s.src = EPAYCO_CHECKOUT_SCRIPT;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ePayco'));
      document.body.appendChild(s);
    });
  }

  icono(t: TipoMovimiento): string {
    return ({
      recarga: 'savings',
      debito_flete: 'local_shipping',
      debito_anticipado: 'paid',
      reembolso: 'undo',
      ajuste_admin: 'tune',
    } as Record<TipoMovimiento, string>)[t];
  }

  iconoFondo(t: TipoMovimiento): string {
    return ({
      recarga: 'bg-green-50',
      debito_flete: 'bg-amber-50',
      debito_anticipado: 'bg-blue-50',
      reembolso: 'bg-green-50',
      ajuste_admin: 'bg-slate-100',
    } as Record<TipoMovimiento, string>)[t];
  }

  iconoColor(t: TipoMovimiento): string {
    return ({
      recarga: 'text-green-600',
      debito_flete: 'text-amber-600',
      debito_anticipado: 'text-blue-600',
      reembolso: 'text-green-600',
      ajuste_admin: 'text-slate-600',
    } as Record<TipoMovimiento, string>)[t];
  }

  etiqueta(t: TipoMovimiento): string {
    return ({
      recarga: 'Recarga',
      debito_flete: 'Flete pedido',
      debito_anticipado: 'Pago anticipado',
      reembolso: 'Reembolso',
      ajuste_admin: 'Ajuste manual',
    } as Record<TipoMovimiento, string>)[t];
  }
}
