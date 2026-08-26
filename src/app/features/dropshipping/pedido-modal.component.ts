import { Component, Input, Output, EventEmitter, inject, signal, OnInit, OnDestroy, computed, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { PedidosService } from '../../core/services/pedidos.service';
import { WalletService } from '../../core/services/wallet.service';
import { MipaqueteService } from '../../core/services/mipaquete.service';
import { AuthService } from '../../core/services/auth.service';
import type { Producto } from '../../core/models/producto.model';
import type { TipoPago, ResultadoPedido } from '../../core/models/pedido.model';
import type { CiudadMipaquete, CotizacionTransportadora } from '../../core/models/mipaquete.model';

declare global {
  interface Window { ePayco?: any; }
}

const EPAYCO_CHECKOUT_SCRIPT = 'https://checkout.epayco.co/checkout.js';

@Component({
  selector: 'app-pedido-modal',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
         data-backdrop (click)="onBackdrop($event)">
      <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl overflow-hidden my-0 sm:my-4">

        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 class="font-black text-slate-900">Hacer pedido</h2>
            <p class="text-xs text-slate-500 truncate max-w-[240px] sm:max-w-md">{{ producto.nombre }}</p>
          </div>
          <button (click)="cerrar.emit()" type="button"
                  class="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        @if (auth.esTestUser()) {
          <div class="mx-5 mt-4 p-3 rounded-xl bg-purple-50 border border-purple-200 text-sm text-purple-800 flex items-start gap-2">
            <span class="material-symbols-outlined text-purple-600 text-[18px] mt-0.5">science</span>
            <div>
              <p class="font-bold">Modo prueba activo</p>
              <p class="text-xs text-purple-700">No se debitará saldo de tu wallet al crear el pedido.</p>
            </div>
          </div>
        }

        @if (exito()) {
          <div class="p-6 space-y-4 text-center">
            <div class="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <span class="material-symbols-outlined text-green-600 text-4xl">check_circle</span>
            </div>
            <h3 class="text-lg font-black text-slate-900">Pedido #{{ exito()!.numero }} creado</h3>
            <div class="text-sm text-slate-600 space-y-1">
              <p>Transportadora: <strong>{{ transportadoraElegida()?.delivery_company_name }}</strong></p>
              @if (auth.esTestUser()) {
                <p class="text-purple-700 font-bold">Pedido de prueba — no se debitó saldo.</p>
              } @else {
                <p>Se debitó <strong>\${{ exito()!.total_debitado | number:'1.0-0' }} COP</strong> de tu wallet.</p>
                <p>Saldo actual: <strong>\${{ exito()!.saldo_nuevo | number:'1.0-0' }} COP</strong></p>
              }
              @if (guiaGenerada()) {
                <div class="mt-2 p-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs font-bold inline-flex items-center gap-1">
                  <span class="material-symbols-outlined text-[14px]">receipt_long</span>
                  Guía generada: {{ guiaGenerada() }}
                </div>
              } @else if (generandoGuia()) {
                <div class="mt-2 p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs inline-flex items-center gap-1">
                  <span class="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                  Generando guía de envío…
                </div>
              }
            </div>
            <div class="flex gap-2 pt-2">
              <button (click)="cerrar.emit()" type="button"
                      class="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
                Seguir comprando
              </button>
              <button (click)="verPedidos()" type="button"
                      class="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90">
                Ver mis pedidos
              </button>
            </div>
          </div>

        } @else {
          <!-- ── Formulario normal ───────────────────────────────────────── -->
          <form (ngSubmit)="enviar()" class="p-5 space-y-5">

            <!-- Resumen producto -->
            <div class="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              @if (producto.imagenes?.[0]) {
                <img [src]="producto.imagenes[0]" class="w-16 h-16 rounded-lg object-cover" alt=""/>
              }
              <div class="flex-1 min-w-0">
                <p class="font-bold text-sm text-slate-900 truncate">{{ producto.nombre }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Precio: <strong class="text-slate-900">\${{ precioUnitario | number:'1.0-0' }}</strong></p>
                <div class="flex items-center gap-2 mt-2">
                  <label class="text-xs text-slate-600">Cantidad:</label>
                  <input type="number" min="1" [(ngModel)]="cantidad" name="cantidad" (ngModelChange)="invalidarCotizacion()"
                         class="w-20 px-2 py-1 text-sm border border-slate-300 rounded-lg"/>
                </div>
              </div>
            </div>

            <!-- Tipo de pago -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Tipo de pago</label>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" (click)="tipoPago.set('cod')"
                        [class.ring-2]="tipoPago() === 'cod'"
                        [class.ring-primary]="tipoPago() === 'cod'"
                        [class.bg-primary]="tipoPago() === 'cod'"
                        [class.text-white]="tipoPago() === 'cod'"
                        [class.bg-white]="tipoPago() !== 'cod'"
                        [class.text-slate-700]="tipoPago() !== 'cod'"
                        class="px-4 py-3 rounded-xl border border-slate-300 text-sm font-bold text-left transition">
                  <div>Contra entrega</div>
                  <div class="text-[11px] font-medium opacity-80 mt-0.5">Paga al momento de recibir</div>
                </button>
                <button type="button" (click)="tipoPago.set('anticipado')"
                        [class.ring-2]="tipoPago() === 'anticipado'"
                        [class.ring-primary]="tipoPago() === 'anticipado'"
                        [class.bg-primary]="tipoPago() === 'anticipado'"
                        [class.text-white]="tipoPago() === 'anticipado'"
                        [class.bg-white]="tipoPago() !== 'anticipado'"
                        [class.text-slate-700]="tipoPago() !== 'anticipado'"
                        class="px-4 py-3 rounded-xl border border-slate-300 text-sm font-bold text-left transition">
                  <div>Pago anticipado</div>
                  <div class="text-[11px] font-medium opacity-80 mt-0.5">El vendedor ya cobró</div>
                </button>
              </div>
            </div>

            <!-- Datos cliente -->
            <div class="space-y-3">
              <p class="text-xs font-bold uppercase tracking-wider text-slate-600">Datos del cliente final</p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs text-slate-600">Nombre completo *</span>
                  <input [(ngModel)]="cliente.nombre" name="n" required
                         (ngModelChange)="onCampoChange()"
                         class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
                </label>
                <label class="block">
                  <span class="text-xs text-slate-600">Cédula</span>
                  <input [(ngModel)]="cliente.cedula" name="c"
                         class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
                </label>
                <label class="block sm:col-span-2">
                  <span class="text-xs text-slate-600">Teléfono *</span>
                  <input [(ngModel)]="cliente.telefono" name="t" required
                         (ngModelChange)="onCampoChange()"
                         class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
                </label>

                @if (tipoPago() === 'cod') {
                  <label class="block sm:col-span-2">
                    <span class="text-xs text-slate-600">Precio final al cliente (COD) *</span>
                    <div class="relative mt-1">
                      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">$</span>
                      <input type="text" inputmode="numeric"
                             [value]="precioVentaClienteStr"
                             (input)="onPrecioInput($any($event.target).value)"
                             placeholder="Ej: 50.000"
                             class="w-full pl-7 pr-16 py-2 border border-slate-300 rounded-lg text-sm"/>
                      <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">COP</span>
                    </div>
                    <p class="text-[11px] text-slate-400 mt-1">Este valor + flete = lo que el domiciliario cobrará al cliente.</p>
                  </label>
                }

                <!-- Autocomplete ciudad destino -->
                <label class="block sm:col-span-2 relative">
                  <span class="text-xs text-slate-600">Ciudad destino * <span class="text-slate-400">(busca y selecciona)</span></span>
                  <div class="relative mt-1">
                    <input [(ngModel)]="ciudadQuery" name="cq" autocomplete="off"
                           (input)="onCiudadInput()" (focus)="ciudadFocus.set(true)"
                           (blur)="onCiudadBlur()"
                           placeholder="Ej: Medellín, Bogotá, Cali…"
                           [class]="ciudadSeleccionada()
                             ? 'w-full pl-3 pr-8 py-2 border-2 border-green-400 rounded-lg text-sm bg-green-50 text-green-900 font-medium'
                             : 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm'"/>
                    @if (ciudadSeleccionada()) {
                      <span class="absolute right-2 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-green-500 pointer-events-none">edit</span>
                    }
                  </div>

                  @if (ciudadSeleccionada()) {
                    <p class="text-[11px] text-green-700 mt-0.5 flex items-center gap-1">
                      <span class="material-symbols-outlined text-[13px]">check_circle</span>
                      DANE {{ ciudadSeleccionada()!.dane_code }} · <span class="underline cursor-pointer" (click)="limpiarCiudad()">limpiar</span>
                      · <span class="text-slate-500">Escribe encima para cambiar</span>
                    </p>
                  }

                  @if (ciudadFocus() && sugerencias().length > 0 && !ciudadSeleccionada()) {
                    <div class="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                      @for (c of sugerencias(); track c.dane_code) {
                        <button type="button" (mousedown)="seleccionarCiudad(c)"
                                class="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0">
                          <span class="font-bold text-slate-900">{{ c.ciudad }}</span>
                          <span class="text-xs text-slate-500">, {{ c.departamento }}</span>
                        </button>
                      }
                    </div>
                  }
                </label>

                <label class="block sm:col-span-2">
                  <span class="text-xs text-slate-600">Dirección *</span>
                  <input [(ngModel)]="cliente.direccion" name="dir" required
                         (ngModelChange)="onCampoChange()"
                         placeholder="Calle, barrio, detalles de entrega"
                         class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
                </label>
                <label class="block sm:col-span-2">
                  <span class="text-xs text-slate-600">Observaciones</span>
                  <textarea [(ngModel)]="cliente.observaciones" name="obs" rows="2"
                            class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"></textarea>
                </label>
              </div>
            </div>

            <!-- Transportadoras / Cotizaciones -->
            @if (ciudadSeleccionada() && camposParaCotizar()) {
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <p class="text-xs font-bold uppercase tracking-wider text-slate-600">Elige transportadora</p>
                  @if (cotizaciones().length > 0 && !cotizando()) {
                    <button type="button" (click)="cotizar()" class="text-[11px] font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
                      <span class="material-symbols-outlined text-[14px]">refresh</span> Recotizar
                    </button>
                  }
                </div>

                @if (errorCotizacion() && !cotizando()) {
                  <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                    {{ errorCotizacion() }}
                    <button type="button" (click)="cotizar()" class="ml-2 underline">reintentar</button>
                  </div>
                } @else if (cotizando() && cotizaciones().length === 0) {
                  <div class="p-6 text-center text-sm text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
                    <span class="material-symbols-outlined animate-spin text-[20px] text-slate-400 block mb-1">progress_activity</span>
                    Cotizando con transportadoras…
                  </div>
                } @else if (!cotizando() && cotizaciones().length === 0) {
                  <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 text-center">
                    No hay transportadoras disponibles para esa ciudad.
                  </div>
                } @else {
                  <!-- Aclaración costos de flete -->
                  <div class="flex gap-2.5 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800 leading-relaxed">
                    <span class="material-symbols-outlined text-blue-400 text-[16px] shrink-0 mt-px">info</span>
                    <p>
                      Estos costos de flete aplican <strong>únicamente para pedidos generados dentro de nuestra plataforma.</strong>
                      No podemos calcular fletes de pedidos realizados en otras plataformas.
                    </p>
                  </div>
                  @if (tipoPago() === 'cod' && (cotizaciones()[0]?.comision_recaudo ?? 0) > 0) {
                    <div class="flex gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800 leading-relaxed">
                      <span class="material-symbols-outlined text-amber-400 text-[16px] shrink-0 mt-px">info</span>
                      <p>El flete incluye una <strong>comisión de recaudo</strong> proporcional al valor que cobras al cliente — a mayor precio, mayor comisión.</p>
                    </div>
                  }
                  <!-- Overlay de recotización sobre los carriers existentes -->
                  <div class="relative">
                    @if (cotizando()) {
                      <div class="absolute inset-0 z-10 bg-white/75 backdrop-blur-[2px] rounded-xl flex items-center justify-center gap-2 text-sm text-slate-600 font-medium">
                        <span class="material-symbols-outlined animate-spin text-[18px] text-primary">progress_activity</span>
                        Actualizando cotización…
                      </div>
                    }
                    <div class="space-y-2" [class.opacity-50]="cotizando()">
                    @for (c of cotizaciones(); track c.quote_id) {
                      <button type="button" (click)="elegirTransportadora(c)"
                              [class.ring-2]="transportadoraElegida()?.quote_id === c.quote_id"
                              [class.ring-primary]="transportadoraElegida()?.quote_id === c.quote_id"
                              [class.bg-primary]="transportadoraElegida()?.quote_id === c.quote_id"
                              [class.text-white]="transportadoraElegida()?.quote_id === c.quote_id"
                              [class.bg-white]="transportadoraElegida()?.quote_id !== c.quote_id"
                              class="w-full px-4 py-3 rounded-xl border border-slate-200 hover:border-primary flex items-center gap-3 transition text-left">
                        @if (c.logo_url) {
                          <img [src]="c.logo_url" [alt]="c.delivery_company_name" class="w-12 h-12 rounded-lg object-contain bg-white shrink-0 border border-slate-100"/>
                        } @else {
                          <div class="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-slate-400">local_shipping</span>
                          </div>
                        }
                        <div class="flex-1 min-w-0">
                          <p class="font-black text-sm">{{ c.delivery_company_name }}</p>
                          <p class="text-[11px] opacity-80">
                            @if (c.tiempo_min) { {{ diasEntrega(c.tiempo_min) }} } @else { Tiempo por confirmar }
                            @if (c.solo_entrega_oficina) { · Solo oficina }
                          </p>
                        </div>
                        <div class="text-right shrink-0">
                          <p class="text-sm font-black">\${{ c.flete_cliente | number:'1.0-0' }}</p>
                          <p class="text-[10px] opacity-70">COP</p>
                        </div>
                      </button>
                    }
                    </div><!-- /space-y-2 carriers -->
                  </div><!-- /relative overlay wrapper -->
                }
              </div>
            } @else {
              <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                <p class="font-black flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-amber-500">info</span>
                  Para ver los costos de envío completa primero:
                </p>
                <ul class="pl-5 space-y-0.5 list-disc text-amber-800">
                  @if (!cliente.nombre.trim()) { <li>Nombre del cliente</li> }
                  @if (!cliente.telefono.trim()) { <li>Teléfono</li> }
                  @if (!cliente.direccion.trim()) { <li>Dirección de entrega</li> }
                  @if (tipoPago() === 'cod' && !(precioVentaCliente != null && precioVentaCliente > 0)) {
                    <li>Precio final al cliente</li>
                  }
                  @if (!ciudadSeleccionada()) { <li>Ciudad destino</li> }
                </ul>
              </div>
            }

            <!-- Resumen costos -->
            @if (transportadoraElegida()) {
              <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-sm">
                @if (tipoPago() === 'anticipado') {
                  <div class="flex justify-between">
                    <span class="text-slate-600">Subtotal producto ({{ cantidad }} × \${{ precioUnitario | number:'1.0-0' }})</span>
                    <span class="font-bold text-slate-900">\${{ subtotal() | number:'1.0-0' }}</span>
                  </div>
                }
                <div class="flex justify-between">
                  <span class="text-slate-600">Flete ({{ transportadoraElegida()!.delivery_company_name }})</span>
                  <span class="font-bold text-slate-900">\${{ transportadoraElegida()!.flete_cliente | number:'1.0-0' }}</span>
                </div>
                @if (tipoPago() === 'cod' && (transportadoraElegida()!.comision_recaudo ?? 0) > 0) {
                  <div class="flex justify-between text-[11px] text-slate-400 -mt-1">
                    <span class="pl-2">↳ incl. comisión de recaudo</span>
                    <span>\${{ transportadoraElegida()!.comision_recaudo | number:'1.0-0' }}</span>
                  </div>
                }
                @if (seguroActivo()) {
                  <div class="flex justify-between text-amber-700">
                    <span class="flex items-center gap-1">
                      <span class="material-symbols-outlined text-[14px]">shield</span>
                      Seguro antidevoluciones
                    </span>
                    <span class="font-bold">+ $5.000</span>
                  </div>
                }
                <div class="pt-2 mt-2 border-t border-slate-300 flex justify-between text-base">
                  @if (auth.esTestUser()) {
                    <span class="font-black text-slate-900">Total del pedido</span>
                    <span class="font-black text-purple-700">\${{ totalDebitado() | number:'1.0-0' }} COP</span>
                  } @else {
                    <span class="font-black text-slate-900">Se debitará de tu wallet</span>
                    <span class="font-black text-primary">\${{ totalDebitado() | number:'1.0-0' }} COP</span>
                  }
                </div>
                @if (!auth.esTestUser()) {
                  <div class="flex justify-between text-xs pt-1">
                    <span class="text-slate-500">Saldo actual</span>
                    <span [class.text-red-600]="saldoInsuficiente()" class="font-bold"
                          [class.text-slate-700]="!saldoInsuficiente()">
                      \${{ wallet.saldo() | number:'1.0-0' }}
                    </span>
                  </div>
                } @else {
                  <div class="text-[11px] pt-1 text-purple-600 italic">
                    Este valor NO se debitará porque estás en modo prueba.
                  </div>
                }
              </div>
            }

            <!-- Seguro antidevoluciones -->
            @if (transportadoraElegida()) {
              <label class="flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition select-none"
                     [class.border-amber-400]="seguroActivo()"
                     [class.bg-amber-50]="seguroActivo()"
                     [class.border-slate-200]="!seguroActivo()"
                     [class.bg-slate-50]="!seguroActivo()">
                <input type="checkbox" [checked]="seguroActivo()" (change)="seguroActivo.set(!seguroActivo())"
                       class="mt-0.5 w-4 h-4 accent-amber-500 shrink-0"/>
                <div class="flex-1 min-w-0">
                  <p class="font-black text-sm text-slate-900 flex flex-wrap items-center gap-1.5">
                    <span class="material-symbols-outlined text-amber-500 text-[18px]">shield</span>
                    SEGURO ANTIDEVOLUCIONES
                    <span class="text-amber-700">+ $5.000 COP</span>
                  </p>
                  <p class="text-xs text-slate-600 mt-1 leading-relaxed">
                    Si el paquete es devuelto, <strong>solo pagas el flete de ida</strong>
                    (ya debitado al crear el pedido) — el flete de regreso queda cubierto
                    por este seguro y <strong>no se te cobrará nada adicional.</strong>
                  </p>
                </div>
              </label>
            }

            @if (saldoInsuficiente()) {
              <div class="rounded-2xl overflow-hidden border border-red-200">
                <div class="bg-red-50 px-4 py-3 flex items-start gap-3">
                  <span class="material-symbols-outlined text-red-500 text-[22px] shrink-0 mt-0.5">account_balance_wallet</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-black text-red-800 text-sm">Saldo insuficiente para confirmar el pedido</p>
                    <p class="text-xs text-red-700 mt-1">
                      Necesitas
                      <strong>\${{ (totalDebitado() - wallet.saldo()) | number:'1.0-0' }} COP</strong>
                      más en tu wallet para cubrir el flete{{ seguroActivo() ? ' + seguro' : '' }}.
                    </p>
                    <div class="flex items-center gap-3 mt-1.5 text-xs text-red-600">
                      <span>Saldo actual: <strong>\${{ wallet.saldo() | number:'1.0-0' }}</strong></span>
                      <span class="text-red-300">|</span>
                      <span>Requerido: <strong>\${{ totalDebitado() | number:'1.0-0' }}</strong></span>
                    </div>
                  </div>
                </div>
                <button type="button" (click)="abrirModalRecarga()"
                        class="w-full py-2.5 bg-red-600 text-white text-sm font-black hover:bg-red-700 active:scale-[0.99] transition inline-flex items-center justify-center gap-2">
                  <span class="material-symbols-outlined text-[18px]">add_circle</span>
                  Recargar Wallet ahora
                </button>
              </div>
            }

            @if (error()) {
              <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{{ error() }}</div>
            }

            <div class="flex gap-2 pt-1">
              <button type="button" (click)="cerrar.emit()"
                      class="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
                Cancelar
              </button>
              <button type="submit" [disabled]="enviando() || saldoInsuficiente() || !formValido()"
                      class="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                @if (enviando()) { Creando… } @else { Confirmar pedido }
              </button>
            </div>
          </form>
        }
      </div>
    </div>

    <!-- ── Modal de recarga ─────────────────────────────────────────────── -->
    @if (modalRecarga()) {
      <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
           (click)="onRecargaBackdrop($event)">
        <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" (click)="$event.stopPropagation()">

          <!-- Header fijo -->
          <div class="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <h3 class="font-black text-slate-900">Recargar wallet</h3>
            <button (click)="cerrarModalRecarga()" type="button"
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
              <button type="button" (click)="montoRecarga = m"
                      [class.ring-2]="montoRecarga === m"
                      [class.ring-primary]="montoRecarga === m"
                      [class.bg-primary]="montoRecarga === m"
                      [class.text-white]="montoRecarga === m"
                      [class.bg-slate-50]="montoRecarga !== m"
                      class="py-2.5 rounded-xl font-bold text-sm border border-slate-200 hover:border-primary transition">
                \${{ m | number:'1.0-0' }}
              </button>
            }
          </div>

          <label class="block">
            <span class="text-xs font-bold text-slate-600">Otro monto (COP)</span>
            <input type="number" [(ngModel)]="montoRecarga" [min]="recargaMinima()" name="montoRecarga"
                   class="mt-1 w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"/>
          </label>

          <!-- Desglose comisión pasarela -->
          <div class="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
            <div class="flex justify-between px-4 py-2.5">
              <span class="text-slate-600">Acreditado en tu wallet</span>
              <span class="font-bold text-green-700">\${{ montoRecarga | number:'1.0-0' }} COP</span>
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

          @if (errorRecarga()) {
            <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{{ errorRecarga() }}</div>
          }

          <div class="flex gap-2">
            <button type="button" (click)="cerrarModalRecarga()"
                    class="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
              Cancelar
            </button>
            <button type="button" (click)="pagarRecarga()" [disabled]="procesandoRecarga()"
                    class="flex-1 py-2.5 rounded-xl bg-primary text-white font-black hover:bg-primary/90 disabled:opacity-50">
              @if (procesandoRecarga()) { Abriendo… } @else { Pagar \${{ totalConFee | number:'1.0-0' }} }
            </button>
          </div>

          </div><!-- /cuerpo desplazable -->
        </div>
      </div>
    }
  `,
})
export class PedidoModalComponent implements OnInit, OnDestroy {
  @Input() producto!: Producto;
  @Output() cerrar = new EventEmitter<void>();
  @Output() creado = new EventEmitter<ResultadoPedido>();

  private readonly pedidosSrv = inject(PedidosService);
  readonly wallet = inject(WalletService);
  private readonly mipaquete = inject(MipaqueteService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly tipoPago = signal<TipoPago>('cod');
  readonly seguroActivo = signal(false);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<ResultadoPedido | null>(null);
  readonly generandoGuia = signal(false);
  readonly guiaGenerada = signal<string | null>(null);

  // Ciudad (autocomplete)
  ciudadQuery = '';
  readonly sugerencias = signal<CiudadMipaquete[]>([]);
  readonly ciudadFocus = signal(false);
  readonly ciudadSeleccionada = signal<CiudadMipaquete | null>(null);
  private ciudadDebounce: any = null;

  // Cotizaciones
  readonly cotizaciones = signal<CotizacionTransportadora[]>([]);
  readonly cotizando = signal(false);
  readonly errorCotizacion = signal<string | null>(null);
  readonly transportadoraElegida = signal<CotizacionTransportadora | null>(null);

  cantidad = 1;
  precioVentaCliente: number | null = null;
  precioVentaClienteStr = '';          // lo que se muestra en el input (con puntos)
  private precioDebounce: any = null;
  private campoDebounce: any = null;
  cliente = {
    nombre: '',
    cedula: '',
    telefono: '',
    direccion: '',
    observaciones: '',
  };

  // ── Recarga inline ──────────────────────────────────────────────────────
  readonly modalRecarga = signal(false);
  readonly procesandoRecarga = signal(false);
  readonly errorRecarga = signal<string | null>(null);
  readonly recargaMinima = signal(30_000);
  montoRecarga = 30_000;
  readonly montosSugeridos = [30_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  get feeRecarga(): number {
    const m = Number(this.montoRecarga) || 0;
    return Math.ceil(m * 0.035) + 900;
  }

  get totalConFee(): number {
    return (Number(this.montoRecarga) || 0) + this.feeRecarga;
  }

  // ── Computed ────────────────────────────────────────────────────────────

  get precioUnitario(): number {
    return this.producto.precio_final ?? this.producto.precio_sugerido ?? this.producto.precio_base ?? 0;
  }

  readonly subtotal = computed(() => {
    const c = Number(this.cantidad) || 0;
    return this.precioUnitario * c;
  });

  readonly totalDebitado = computed(() => {
    const t = this.transportadoraElegida();
    if (!t) return 0;
    const base = this.tipoPago() === 'cod' ? t.flete_cliente : t.flete_cliente + this.subtotal();
    return base + (this.seguroActivo() ? 5_000 : 0);
  });

  readonly saldoInsuficiente = computed(() =>
    !this.auth.esTestUser()
    && !!this.transportadoraElegida()
    && this.wallet.saldo() < this.totalDebitado()
  );

  // computed() no rastrea propiedades planas → usar método regular.
  camposParaCotizar(): boolean {
    const precioOk = this.tipoPago() === 'anticipado'
      || (this.precioVentaCliente != null && Number(this.precioVentaCliente) > 0);
    return !!this.cliente.nombre.trim()
      && !!this.cliente.telefono.trim()
      && !!this.cliente.direccion.trim()
      && precioOk;
  }

  formValido(): boolean {
    const precioOk = this.tipoPago() === 'anticipado'
      || (this.precioVentaCliente != null && Number(this.precioVentaCliente) > 0);
    return !!this.cliente.nombre.trim()
      && !!this.cliente.telefono.trim()
      && !!this.cliente.direccion.trim()
      && !!this.ciudadSeleccionada()
      && !!this.transportadoraElegida()
      && (Number(this.cantidad) || 0) >= 1
      && precioOk;
  }

  async ngOnInit() {
    await this.wallet.refrescarSaldo();
    const cfg = await this.wallet.obtenerConfig().catch(() => null);
    if (cfg?.recarga_minima) {
      this.recargaMinima.set(cfg.recarga_minima);
      this.montoRecarga = Math.max(this.montoRecarga, cfg.recarga_minima);
    }
  }

  ngOnDestroy() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
    if (this.precioDebounce) { clearTimeout(this.precioDebounce); this.precioDebounce = null; }
    if (this.campoDebounce) { clearTimeout(this.campoDebounce); this.campoDebounce = null; }
  }

  // ── Recarga ─────────────────────────────────────────────────────────────

  abrirModalRecarga() {
    this.errorRecarga.set(null);
    this.montoRecarga = Math.max(this.montoRecarga, this.recargaMinima());
    this.modalRecarga.set(true);
  }

  cerrarModalRecarga() {
    this.modalRecarga.set(false);
  }

  onRecargaBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) this.cerrarModalRecarga();
  }

  async pagarRecarga() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.procesandoRecarga()) return;
    const monto = Number(this.montoRecarga);
    if (!Number.isFinite(monto) || monto < this.recargaMinima()) {
      this.errorRecarga.set(`El monto mínimo es $${this.recargaMinima().toLocaleString('es-CO')} COP`);
      return;
    }
    this.errorRecarga.set(null);
    this.procesandoRecarga.set(true);
    try {
      const resp = await this.wallet.crearCheckoutRecarga(monto);
      await this.cargarScriptEpayco();
      const handler = window.ePayco?.checkout?.configure({
        key: resp.checkout['public_key'],
        test: resp.checkout['test'] === 'true',
      });
      handler?.open(resp.checkout);
      this.cerrarModalRecarga();
      this.iniciarPollingRecarga();
    } catch (e: any) {
      this.errorRecarga.set(e?.message ?? 'No se pudo iniciar el pago');
    } finally {
      this.procesandoRecarga.set(false);
    }
  }

  private iniciarPollingRecarga(): void {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    const saldoAntes = this.wallet.saldo();
    let n = 0;
    this.pollingInterval = setInterval(async () => {
      n++;
      await this.wallet.refrescarSaldo();
      if (this.wallet.saldo() > saldoAntes || n > 40) {
        clearInterval(this.pollingInterval!);
        this.pollingInterval = null;
      }
    }, 3_000);
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

  // ── Ciudad ──────────────────────────────────────────────────────────────

  onCiudadInput() {
    this.ciudadSeleccionada.set(null);
    this.transportadoraElegida.set(null);
    this.cotizaciones.set([]);
    clearTimeout(this.ciudadDebounce);
    this.ciudadDebounce = setTimeout(() => this.buscarSugerencias(), 250);
  }

  onCiudadBlur() {
    setTimeout(() => this.ciudadFocus.set(false), 180);
  }

  async buscarSugerencias() {
    const q = this.ciudadQuery.trim();
    if (q.length < 2) { this.sugerencias.set([]); return; }
    try {
      const r = await this.mipaquete.buscarCiudades(q, 10);
      this.sugerencias.set(r);
    } catch {
      this.sugerencias.set([]);
    }
  }

  async seleccionarCiudad(c: CiudadMipaquete) {
    this.ciudadSeleccionada.set(c);
    this.ciudadQuery = c.label;
    this.sugerencias.set([]);
    this.ciudadFocus.set(false);
    if (this.camposParaCotizar()) await this.cotizar();
  }

  // Dispara cotizar cuando nombre/teléfono/dirección cambian con ciudad ya seleccionada
  onCampoChange() {
    if (this.campoDebounce) clearTimeout(this.campoDebounce);
    this.campoDebounce = setTimeout(() => {
      if (this.ciudadSeleccionada() && this.camposParaCotizar() && this.cotizaciones().length === 0 && !this.cotizando()) {
        this.cotizar();
      }
    }, 400);
  }

  onPrecioInput(valor: string) {
    const digits = valor.replace(/[^\d]/g, '');
    const num = digits ? parseInt(digits, 10) : null;
    this.precioVentaCliente = num;
    this.precioVentaClienteStr = num != null
      ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      : '';
    // debounce: esperar 700ms después de que el usuario deje de tipear
    if (this.precioDebounce) clearTimeout(this.precioDebounce);
    this.precioDebounce = setTimeout(() => {
      this.transportadoraElegida.set(null);
      if (this.ciudadSeleccionada() && this.camposParaCotizar()) {
        this.cotizar(); // cotizar reemplaza cotizaciones al llegar, sin limpiar antes
      } else {
        this.cotizaciones.set([]); // solo limpiar si no vamos a recotizar
      }
    }, 700);
  }

  limpiarCiudad() {
    this.ciudadSeleccionada.set(null);
    this.ciudadQuery = '';
    this.transportadoraElegida.set(null);
    this.cotizaciones.set([]);
  }

  invalidarCotizacion() {
    this.transportadoraElegida.set(null);
  }

  // ── Cotización ──────────────────────────────────────────────────────────

  async cotizar() {
    const ciudad = this.ciudadSeleccionada();
    if (!ciudad) return;
    if (this.cotizando()) return;

    this.cotizando.set(true);
    this.errorCotizacion.set(null);
    this.transportadoraElegida.set(null);
    // No limpiamos cotizaciones aquí: si ya hay resultados previos, quedan
    // visibles con un overlay de "Actualizando..." mientras llega la respuesta.
    try {
      const r = await this.mipaquete.cotizar({
        producto_id:          this.producto.id,
        destino_dane_code:    ciudad.dane_code,
        cantidad:             Number(this.cantidad) || 1,
        precio_venta_cliente: this.tipoPago() === 'cod' && this.precioVentaCliente
          ? Number(this.precioVentaCliente)
          : undefined,
      });
      this.cotizaciones.set(r.cotizaciones);
      if (r.cotizaciones.length === 1) this.transportadoraElegida.set(r.cotizaciones[0]);
    } catch (err: any) {
      this.errorCotizacion.set(err?.message ?? 'No se pudo cotizar');
      this.cotizaciones.set([]);
    } finally {
      this.cotizando.set(false);
    }
  }

  elegirTransportadora(c: CotizacionTransportadora) {
    this.transportadoraElegida.set(c);
  }

  diasEntrega(minutos: number): string {
    const dias = Math.max(1, Math.round(minutos / (60 * 24)));
    return dias === 1 ? '~1 día hábil' : `~${dias} días hábiles`;
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  async enviar() {
    if (this.enviando() || !this.formValido() || this.saldoInsuficiente()) return;
    const ciudad = this.ciudadSeleccionada()!;
    const transp = this.transportadoraElegida()!;

    this.enviando.set(true);
    this.error.set(null);
    try {
      const resultado = await this.pedidosSrv.crearPedido({
        producto_id: this.producto.id,
        cantidad: Number(this.cantidad),
        tipo_pago: this.tipoPago(),
        cliente_nombre: this.cliente.nombre.trim(),
        cliente_cedula: this.cliente.cedula.trim() || undefined,
        cliente_telefono: this.cliente.telefono.trim(),
        cliente_direccion: this.cliente.direccion.trim(),
        cliente_ciudad: ciudad.ciudad,
        cliente_departamento: ciudad.departamento,
        cliente_observaciones: this.cliente.observaciones.trim() || undefined,
        precio_venta_cliente: this.precioVentaCliente ?? undefined,
        destino_dane_code: ciudad.dane_code,
        delivery_company_id: transp.delivery_company_id,
        delivery_company_name: transp.delivery_company_name,
        mipaquete_quote_id: transp.quote_id,
        flete_mipaquete: transp.flete_mipaquete,
        seguro_antidevoluciones: this.seguroActivo(),
      });
      await this.wallet.refrescarSaldo();
      this.exito.set(resultado);
      this.creado.emit(resultado);
      // Auto-generar guía en background (fire-and-forget)
      this.generandoGuia.set(true);
      this.mipaquete.generarGuia(resultado.pedido_id, { request_pickup: false })
        .then(r => { this.guiaGenerada.set(r.guia ?? r.sending_id ?? null); })
        .catch(err => console.warn('Auto-generación guía fallida:', err?.message))
        .finally(() => this.generandoGuia.set(false));
    } catch (err: any) {
      this.error.set(err?.message ?? 'No se pudo crear el pedido');
    } finally {
      this.enviando.set(false);
    }
  }

  verPedidos() {
    this.cerrar.emit();
    this.router.navigate(['/mis-pedidos']);
  }

  onBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).dataset['backdrop']) this.cerrar.emit();
  }
}
