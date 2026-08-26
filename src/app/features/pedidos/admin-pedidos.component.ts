import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { PedidosService, type NotificacionPedido } from '../../core/services/pedidos.service';
import { MipaqueteService } from '../../core/services/mipaquete.service';
import { AuthService } from '../../core/services/auth.service';
import type { Pedido, EstadoPedido } from '../../core/models/pedido.model';

interface EventoTracking {
  status?: string;
  description?: string;
  date?: string;
  timestamp?: string;
  location?: string;
  [key: string]: any;
}

const COLORES_ESTADO: Record<EstadoPedido, string> = {
  pendiente:     'bg-slate-100 text-slate-700',
  guia_generada: 'bg-sky-100 text-sky-700',
  confirmado:    'bg-blue-100 text-blue-700',
  despachado:    'bg-amber-100 text-amber-700',
  en_ruta:       'bg-indigo-100 text-indigo-700',
  entregado:     'bg-green-100 text-green-700',
  devuelto:      'bg-orange-100 text-orange-700',
  cancelado:     'bg-red-100 text-red-700',
};

const ETIQUETAS_ESTADO: Record<EstadoPedido, string> = {
  pendiente:     'Pendiente',
  guia_generada: 'Guía generada',
  confirmado:    'Confirmado',
  despachado:    'Despachado',
  en_ruta:       'En ruta',
  entregado:     'Entregado',
  devuelto:      'Devuelto',
  cancelado:     'Cancelado',
};

const TEXTO_ESTADO: Record<EstadoPedido, string> = {
  pendiente:     'text-slate-700',
  guia_generada: 'text-sky-700',
  confirmado:    'text-blue-700',
  despachado:    'text-amber-700',
  en_ruta:       'text-indigo-700',
  entregado:     'text-green-700',
  devuelto:      'text-orange-700',
  cancelado:     'text-red-700',
};

@Component({
  selector: 'app-admin-pedidos',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 class="text-2xl font-black text-slate-900">
            {{ auth.esAdmin() ? 'Gestión de pedidos' : 'Ventas de mis productos' }}
          </h1>
          @if (!auth.esAdmin()) {
            <p class="text-xs text-slate-500 mt-1">
              Solo verás los pedidos de productos que tú subiste al catálogo.
            </p>
          }
        </div>
        <button (click)="cargar()" type="button"
                class="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">refresh</span> Actualizar
        </button>
      </div>

      <!-- Resumen por estado -->
      <div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-9 gap-1.5 sm:gap-2">
        <button type="button" (click)="filtroEstado.set(null)"
                class="rounded-xl border p-2 sm:p-3 text-left transition-all"
                [class.border-slate-900]="filtroEstado() === null"
                [class.bg-slate-50]="filtroEstado() === null"
                [class.border-slate-200]="filtroEstado() !== null"
                [class.bg-white]="filtroEstado() !== null">
          <span class="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-slate-500 block">Total</span>
          <span class="text-lg sm:text-xl font-black text-slate-900">{{ pedidos().length }}</span>
        </button>
        @for (e of estados; track e) {
          <button type="button" (click)="filtroEstado.set(e)"
                  class="rounded-xl border p-2 sm:p-3 text-left transition-all"
                  [class.border-slate-900]="filtroEstado() === e"
                  [class.bg-slate-50]="filtroEstado() === e"
                  [class.border-slate-200]="filtroEstado() !== e"
                  [class.bg-white]="filtroEstado() !== e">
            <span class="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest block leading-tight" [class]="textoEstado(e)">{{ etiqueta(e) }}</span>
            <span class="text-lg sm:text-xl font-black" [class]="textoEstado(e)">{{ contarEstado(e) }}</span>
          </button>
        }
      </div>

      <div class="flex flex-col sm:flex-row gap-2">
        <input [(ngModel)]="busqueda" name="q" placeholder="Buscar por cliente, vendedor o # de pedido…"
               class="px-3 py-2 border border-slate-300 rounded-lg text-sm flex-1"/>
        <select [ngModel]="filtroEstado()" (ngModelChange)="filtroEstado.set($event)" name="est"
                class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white w-full sm:w-auto">
          <option [ngValue]="null">Todos los estados</option>
          @for (e of estados; track e) { <option [ngValue]="e">{{ etiqueta(e) }}</option> }
        </select>
      </div>

      @if (cargando()) {
        <div class="p-10 text-center text-slate-500 text-sm">Cargando…</div>
      } @else if (pedidosFiltrados().length === 0) {
        <div class="p-10 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
          No hay pedidos con esos filtros.
        </div>
      } @else {
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th class="px-4 py-3 text-left font-bold">#</th>
                  <th class="px-4 py-3 text-left font-bold">Vendedor</th>
                  <th class="px-4 py-3 text-left font-bold">Cliente</th>
                  <th class="px-4 py-3 text-left font-bold">Producto</th>
                  <th class="px-4 py-3 text-left font-bold">Pago</th>
                  <th class="px-4 py-3 text-right font-bold">Total</th>
                  <th class="px-4 py-3 text-left font-bold">Estado</th>
                  <th class="px-4 py-3 text-left font-bold">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (p of pedidosFiltrados(); track p.id) {
                  <tr class="hover:bg-slate-50 align-top">
                    <td class="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">
                      <div>#{{ p.numero }}</div>
                      <div class="text-[10px] font-normal text-slate-400">{{ p.creado_en | date:'dd/MM/yy HH:mm' }}</div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="font-bold text-slate-900 truncate max-w-[160px]">{{ p.vendedor?.nombre ?? '—' }}</div>
                      <div class="text-xs text-slate-500 truncate max-w-[160px]">{{ p.vendedor?.email }}</div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="font-bold text-slate-900 truncate max-w-[180px]">{{ p.cliente_nombre }}</div>
                      <div class="text-xs text-slate-600 truncate max-w-[200px]">{{ p.cliente_direccion }}</div>
                      <div class="text-xs text-slate-500">{{ p.cliente_ciudad }}, {{ p.cliente_departamento }}</div>
                      <div class="text-xs text-slate-500">📱 {{ p.cliente_telefono }}</div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-start gap-2">
                        @if (p.producto?.imagenes?.[0]) {
                          <img [src]="p.producto?.imagenes?.[0]" class="w-10 h-10 rounded object-cover" alt=""/>
                        }
                        <div class="min-w-0">
                          <div class="font-bold text-slate-800 truncate max-w-[160px]">{{ p.producto?.nombre }}</div>
                          <div class="text-xs text-slate-500">x{{ p.cantidad }} · \${{ p.precio_unitario | number:'1.0-0' }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                            [class]="p.tipo_pago === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'">
                        {{ p.tipo_pago === 'cod' ? 'COD' : 'Anticip.' }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <div class="font-black text-slate-900">\${{ p.total_debitado | number:'1.0-0' }}</div>
                      <div class="text-[10px] text-slate-500">Flete \${{ p.flete | number:'1.0-0' }}</div>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                            [class]="colorEstado(p.estado)">{{ etiqueta(p.estado) }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <button (click)="abrirGestion(p)" type="button"
                              class="text-xs font-bold text-primary hover:underline">
                        Gestionar
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Modal gestión -->
      @if (pedidoActivo()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
             data-backdrop (click)="onBackdrop($event)">
          <div class="bg-white rounded-2xl max-w-xl w-full max-h-[92dvh] overflow-y-auto shadow-2xl">
            <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 class="font-black text-slate-900">Pedido #{{ pedidoActivo()!.numero }}</h3>
              <button (click)="cerrarGestion()" type="button"
                      class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>

            <div class="p-5 space-y-4 text-sm">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Vendedor</p>
                  <p class="font-bold">{{ pedidoActivo()!.vendedor?.nombre }}</p>
                  <p class="text-xs text-slate-600">{{ pedidoActivo()!.vendedor?.email }}</p>
                </div>
                <div>
                  <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tipo de pago</p>
                  <p class="font-bold">{{ pedidoActivo()!.tipo_pago === 'cod' ? 'Contra entrega' : 'Anticipado' }}</p>
                </div>
              </div>

              <div class="bg-slate-50 p-3 rounded-xl space-y-1">
                <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cliente final</p>
                <p class="font-bold">{{ pedidoActivo()!.cliente_nombre }}</p>
                <p class="text-xs">{{ pedidoActivo()!.cliente_telefono }} · CC {{ pedidoActivo()!.cliente_cedula || '—' }}</p>
                <p class="text-xs">{{ pedidoActivo()!.cliente_direccion }}</p>
                <p class="text-xs">{{ pedidoActivo()!.cliente_ciudad }}, {{ pedidoActivo()!.cliente_departamento }}</p>
                @if (pedidoActivo()!.cliente_observaciones) {
                  <p class="text-xs italic text-slate-600 pt-1">Obs: {{ pedidoActivo()!.cliente_observaciones }}</p>
                }
              </div>

              <div>
                <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Estado</p>
                <select [(ngModel)]="editEstado" name="estado"
                        class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                  @for (e of (auth.esInventario() ? estadosSubidor : estados); track e) {
                    <option [ngValue]="e">{{ etiqueta(e) }}</option>
                  }
                </select>
                @if (auth.esInventario()) {
                  <p class="text-[10px] text-slate-500 mt-1">
                    Los estados de la transportadora se actualizan automáticamente en el seguimiento de la guía.
                  </p>
                }
              </div>

              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Transportadora</span>
                  <input [(ngModel)]="editTransportadora" name="tr" placeholder="Servientrega, Interrapidísimo…"
                         class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
                </label>
                <label class="block">
                  <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Guía</span>
                  <input [(ngModel)]="editGuia" name="g"
                         class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
                </label>
              </div>

              <label class="block">
                <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Notas internas</span>
                <textarea [(ngModel)]="editNotas" name="n" rows="2"
                          class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"></textarea>
              </label>

              <!-- Notificaciones WhatsApp -->
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-[10px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-base text-emerald-600">forum</span>
                    Notificaciones WhatsApp
                  </p>
                  <button type="button" (click)="cargarNotificaciones()" class="text-[10px] font-bold text-slate-500 hover:text-slate-800">
                    Refrescar
                  </button>
                </div>
                @if (cargandoNotifs()) {
                  <p class="text-xs text-slate-500 text-center py-2">Cargando…</p>
                } @else if (notifs().length === 0) {
                  <p class="text-xs text-slate-500 text-center py-2">Sin notificaciones todavía.</p>
                } @else {
                  <div class="space-y-1.5 max-h-48 overflow-y-auto">
                    @for (n of notifs(); track n.id) {
                      <div class="flex items-start gap-2 text-[11px] p-2 rounded-lg bg-white border border-slate-200">
                        <span class="material-symbols-outlined text-base mt-0.5"
                              [class.text-emerald-600]="n.estado === 'enviado'"
                              [class.text-red-600]="n.estado === 'fallido'"
                              [class.text-amber-600]="n.estado === 'pendiente'"
                              [class.text-slate-400]="n.estado === 'desactivado'">
                          {{ iconoEstadoNotif(n.estado) }}
                        </span>
                        <div class="flex-1 min-w-0">
                          <p class="font-bold text-slate-800">
                            {{ n.destinatario_tipo === 'vendedor' ? 'Vendedor' : 'Cliente' }}
                            <span class="font-normal text-slate-500">· {{ n.destinatario_nombre || n.destinatario_telefono }}</span>
                          </p>
                          <p class="text-slate-500 text-[10px] truncate">
                            {{ n.evento }} · {{ n.estado }}
                            @if (n.enviado_en) { · enviado {{ n.enviado_en | date:'dd/MM HH:mm' }} }
                          </p>
                          @if (n.ultimo_error) {
                            <p class="text-[10px] text-red-600 mt-0.5 truncate" [title]="n.ultimo_error">⚠ {{ n.ultimo_error }}</p>
                          }
                        </div>
                        @if (n.estado === 'fallido' || n.estado === 'pendiente') {
                          <button type="button" (click)="reenviarNotif(n.id)" [disabled]="reenviandoId() === n.id"
                                  class="text-[10px] font-bold text-emerald-700 hover:underline disabled:opacity-50">
                            {{ reenviandoId() === n.id ? '…' : 'Reenviar' }}
                          </button>
                        }
                      </div>
                    }
                  </div>
                }
              </div>

              @if (error()) {
                <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{{ error() }}</div>
              }

              @if (pedidoActivo()!.delivery_company_id && !pedidoActivo()!.mipaquete_sending_id) {
                <div class="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm space-y-2">
                  <p class="text-blue-900">
                    Transportadora seleccionada: <strong>{{ pedidoActivo()!.delivery_company_name }}</strong>
                  </p>
                  <button type="button" (click)="generarGuia()" [disabled]="generandoGuia()"
                          class="w-full py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-[18px]">receipt_long</span>
                    @if (generandoGuia()) { Generando guía… } @else { Generar guía de envío }
                  </button>
                </div>
              } @else if (pedidoActivo()!.mipaquete_sending_id) {
                <div class="p-3 rounded-xl bg-green-50 border border-green-200 text-sm">
                  <p class="text-[10px] font-bold uppercase tracking-widest text-green-700">Guía generada</p>
                  <p class="text-green-900 font-bold">{{ pedidoActivo()!.guia }}</p>
                  <p class="text-xs text-green-700">ID envío: {{ pedidoActivo()!.mipaquete_sending_id }}</p>
                </div>
              }

              <!-- Seguimiento transportadora -->
              @if (pedidoActivo()!.mipaquete_sending_id) {
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div class="flex items-center justify-between mb-2">
                    <p class="text-[10px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                      <span class="material-symbols-outlined text-base text-sky-600">local_shipping</span>
                      Seguimiento transportadora
                    </p>
                    <button type="button" (click)="cargarTracking()" class="text-[10px] font-bold text-slate-500 hover:text-slate-800">
                      Refrescar
                    </button>
                  </div>
                  @if (cargandoTracking()) {
                    <p class="text-xs text-slate-500 text-center py-2">Consultando…</p>
                  } @else if (errorTracking()) {
                    <p class="text-xs text-red-600 py-1">{{ errorTracking() }}</p>
                  } @else if (tracking().length === 0) {
                    <p class="text-xs text-slate-500 text-center py-2">Sin eventos de seguimiento todavía.</p>
                  } @else {
                    <div class="space-y-1.5 max-h-52 overflow-y-auto">
                      @for (ev of tracking(); track $index) {
                        <div class="flex items-start gap-2 p-2 rounded-lg bg-white border border-slate-200 text-[11px]">
                          <span class="material-symbols-outlined text-sky-500 text-base mt-0.5 shrink-0">radio_button_checked</span>
                          <div class="flex-1 min-w-0">
                            <p class="font-bold text-slate-800">{{ ev['status'] ?? ev['estado'] ?? ev['description'] ?? ev['descripcion'] ?? 'Evento' }}</p>
                            @if (ev['description'] && ev['description'] !== ev['status']) {
                              <p class="text-slate-500 truncate">{{ ev['description'] }}</p>
                            }
                            <p class="text-slate-400">
                              {{ ev['date'] ?? ev['timestamp'] ?? ev['fecha'] ?? '' }}
                              @if (ev['location'] ?? ev['ciudad']) { · {{ ev['location'] ?? ev['ciudad'] }} }
                            </p>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              <div class="flex flex-col sm:flex-row gap-2 pt-2">
                <button type="button" (click)="guardar()" [disabled]="guardando()"
                        class="flex-1 py-2.5 rounded-xl bg-primary text-white font-black hover:bg-primary/90 disabled:opacity-50">
                  @if (guardando()) { Guardando… } @else { Guardar cambios }
                </button>
                <button type="button" (click)="cancelarYReembolsar()" [disabled]="guardando() || ['entregado','cancelado','devuelto'].includes(pedidoActivo()!.estado)"
                        class="flex-1 py-2.5 rounded-xl bg-red-50 text-red-700 font-black border border-red-200 hover:bg-red-100 disabled:opacity-50">
                  Cancelar + reembolsar
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminPedidosComponent implements OnInit {
  private readonly pedidosSrv = inject(PedidosService);
  private readonly mipaquete = inject(MipaqueteService);
  readonly auth = inject(AuthService);

  readonly pedidos = signal<Pedido[]>([]);
  readonly cargando = signal(true);
  readonly filtroEstado = signal<EstadoPedido | null>(null);
  readonly pedidoActivo = signal<Pedido | null>(null);
  readonly error = signal<string | null>(null);
  readonly guardando = signal(false);
  readonly generandoGuia = signal(false);
  readonly estados: EstadoPedido[] = ['pendiente','guia_generada','confirmado','despachado','en_ruta','entregado','cancelado','devuelto'];
  readonly estadosSubidor: EstadoPedido[] = ['pendiente','guia_generada'];

  busqueda = '';
  editEstado: EstadoPedido = 'pendiente';
  editTransportadora = '';
  editGuia = '';
  editNotas = '';

  readonly notifs = signal<NotificacionPedido[]>([]);
  readonly cargandoNotifs = signal(false);
  readonly reenviandoId = signal<string | null>(null);

  readonly tracking = signal<EventoTracking[]>([]);
  readonly cargandoTracking = signal(false);
  readonly errorTracking = signal<string | null>(null);

  readonly pedidosFiltrados = computed(() => {
    const q = this.busqueda.trim().toLowerCase();
    const f = this.filtroEstado();
    return this.pedidos().filter(p => {
      if (f && p.estado !== f) return false;
      if (q && !p.cliente_nombre.toLowerCase().includes(q)
           && !(p.vendedor?.nombre?.toLowerCase().includes(q))
           && !String(p.numero).includes(q)) return false;
      return true;
    });
  });

  async ngOnInit() { await this.cargar(); }

  async cargar() {
    this.cargando.set(true);
    try {
      const data = await this.pedidosSrv.todosPedidos();
      this.pedidos.set(data);
    } finally {
      this.cargando.set(false);
    }
  }

  abrirGestion(p: Pedido) {
    this.pedidoActivo.set(p);
    this.editEstado = p.estado;
    this.editTransportadora = p.transportadora ?? '';
    this.editGuia = p.guia ?? '';
    this.editNotas = p.notas_admin ?? '';
    this.error.set(null);
    this.tracking.set([]);
    this.errorTracking.set(null);
    this.cargarNotificaciones();
    if (p.mipaquete_sending_id) this.cargarTracking();
  }

  async cargarTracking() {
    const p = this.pedidoActivo();
    if (!p?.mipaquete_sending_id) return;
    this.cargandoTracking.set(true);
    this.errorTracking.set(null);
    try {
      const r = await this.mipaquete.tracking(p.id);
      this.tracking.set(r.tracking ?? []);
    } catch (e: any) {
      this.errorTracking.set(e?.message ?? 'Error al consultar tracking');
    } finally {
      this.cargandoTracking.set(false);
    }
  }

  async cargarNotificaciones() {
    const p = this.pedidoActivo();
    if (!p) return;
    this.cargandoNotifs.set(true);
    try {
      const data = await this.pedidosSrv.listarNotificaciones(p.id);
      this.notifs.set(data);
    } finally {
      this.cargandoNotifs.set(false);
    }
  }

  async reenviarNotif(id: string) {
    this.reenviandoId.set(id);
    try {
      await this.pedidosSrv.reenviarNotificacion(id);
      await this.cargarNotificaciones();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al reenviar');
    } finally {
      this.reenviandoId.set(null);
    }
  }

  iconoEstadoNotif(e: string): string {
    return { enviado: 'check_circle', fallido: 'error', pendiente: 'schedule', desactivado: 'do_not_disturb_on' }[e] ?? 'help';
  }

  cerrarGestion() { this.pedidoActivo.set(null); }

  onBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).dataset['backdrop']) this.cerrarGestion();
  }

  async guardar() {
    const p = this.pedidoActivo();
    if (!p || this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const estadoCambio = this.editEstado !== p.estado;
      await this.pedidosSrv.actualizarEstado(p.id, {
        estado: this.editEstado,
        transportadora: this.editTransportadora.trim() || undefined,
        guia: this.editGuia.trim() || undefined,
        notas_admin: this.editNotas.trim() || undefined,
      });
      await this.cargar();
      if (estadoCambio) {
        // Mantener el modal abierto y refrescar notificaciones para que el admin
        // vea el envío automático al vendedor y al cliente.
        const fresh = this.pedidos().find(x => x.id === p.id);
        if (fresh) this.pedidoActivo.set(fresh);
        setTimeout(() => this.cargarNotificaciones(), 2000);
      } else {
        this.cerrarGestion();
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al guardar');
    } finally {
      this.guardando.set(false);
    }
  }

  async generarGuia() {
    const p = this.pedidoActivo();
    if (!p || this.generandoGuia()) return;
    const confirmar = confirm(`¿Generar guía de envío para el pedido #${p.numero} con ${p.delivery_company_name}?`);
    if (!confirmar) return;
    this.generandoGuia.set(true);
    this.error.set(null);
    try {
      await this.mipaquete.generarGuia(p.id, { request_pickup: false });
      await this.cargar();
      const fresh = this.pedidos().find(x => x.id === p.id);
      if (fresh) this.pedidoActivo.set(fresh);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al generar guía');
    } finally {
      this.generandoGuia.set(false);
    }
  }

  async cancelarYReembolsar() {
    const p = this.pedidoActivo();
    if (!p || this.guardando()) return;
    const motivo = prompt(`Motivo de la cancelación del pedido #${p.numero}:`, '');
    if (motivo === null) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.pedidosSrv.reembolsar(p.id, motivo);
      await this.cargar();
      this.cerrarGestion();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al reembolsar');
    } finally {
      this.guardando.set(false);
    }
  }

  etiqueta(e: EstadoPedido) { return ETIQUETAS_ESTADO[e]; }
  colorEstado(e: EstadoPedido) { return COLORES_ESTADO[e]; }
  textoEstado(e: EstadoPedido) { return TEXTO_ESTADO[e]; }
  contarEstado(e: EstadoPedido) { return this.pedidos().filter(p => p.estado === e).length; }
}
