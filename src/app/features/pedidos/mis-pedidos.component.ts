import {
  Component, inject, signal, OnInit, OnDestroy, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { PedidosService } from '../../core/services/pedidos.service';
import { MipaqueteService } from '../../core/services/mipaquete.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import type { Pedido, EstadoPedido, TrackingEvento } from '../../core/models/pedido.model';

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

const PUNTOS_ESTADO: Record<EstadoPedido, string> = {
  pendiente:     'bg-slate-400',
  guia_generada: 'bg-sky-400',
  confirmado:    'bg-blue-400',
  despachado:    'bg-amber-400',
  en_ruta:       'bg-indigo-400 animate-pulse',
  entregado:     'bg-green-500',
  devuelto:      'bg-orange-400',
  cancelado:     'bg-red-400',
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

@Component({
  selector: 'app-mis-pedidos',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <h1 class="text-2xl font-black text-slate-900">Mis pedidos</h1>
        <button (click)="cargar()" type="button"
                class="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">refresh</span> Actualizar
        </button>
      </div>

      <!-- Filtros de estado -->
      <div class="flex flex-wrap gap-1.5">
        <button (click)="filtroEstado.set(null)" type="button"
                [class.bg-primary]="filtroEstado() === null"
                [class.text-white]="filtroEstado() === null"
                [class.bg-slate-100]="filtroEstado() !== null"
                [class.text-slate-700]="filtroEstado() !== null"
                class="px-3 py-1.5 rounded-full text-xs font-bold">Todos</button>
        @for (e of estados; track e) {
          <button (click)="filtroEstado.set(e)" type="button"
                  [class.bg-primary]="filtroEstado() === e"
                  [class.text-white]="filtroEstado() === e"
                  [class.bg-slate-100]="filtroEstado() !== e"
                  [class.text-slate-700]="filtroEstado() !== e"
                  class="px-3 py-1.5 rounded-full text-xs font-bold">{{ etiqueta(e) }}</button>
        }
      </div>

      @if (cargando()) {
        <div class="p-10 text-center text-slate-500 text-sm">Cargando pedidos…</div>
      } @else if (pedidosFiltrados().length === 0) {
        <div class="p-10 text-center bg-white rounded-2xl border border-slate-200">
          <p class="text-slate-500">No tienes pedidos {{ filtroEstado() ? 'con ese estado' : 'todavía' }}.</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (p of pedidosFiltrados(); track p.id) {
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">

              <!-- Cabecera del pedido -->
              <button (click)="toggle(p.id)" type="button"
                      class="w-full px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-slate-50 text-left">
                @if (p.producto?.imagenes?.[0]) {
                  <img [src]="p.producto?.imagenes?.[0]" class="w-14 h-14 rounded-lg object-cover shrink-0" alt=""/>
                } @else {
                  <div class="w-14 h-14 rounded-lg bg-slate-100 shrink-0"></div>
                }
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-bold text-slate-500">#{{ p.numero }}</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                          [class]="colorEstado(p.estado)">{{ etiqueta(p.estado) }}</span>
                    <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {{ p.tipo_pago === 'cod' ? 'Contra entrega' : 'Anticipado' }}
                    </span>
                    @if (p.seguro_antidevoluciones) {
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                        <span class="material-symbols-outlined text-[11px]">shield</span> Seguro
                      </span>
                    }
                  </div>
                  <p class="text-sm font-bold text-slate-900 mt-1 truncate">{{ p.producto?.nombre }}</p>
                  <!-- Último estado de tracking (si hay) -->
                  @if (p.tracking_ultimo_estado && p.mipaquete_sending_id) {
                    <p class="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0 inline-block" [class]="puntoEstado(p.estado)"></span>
                      {{ p.tracking_ultimo_estado }}
                    </p>
                  } @else {
                    <p class="text-xs text-slate-500 truncate">
                      {{ p.cliente_nombre }} · {{ p.cliente_ciudad }}
                    </p>
                  }
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-black text-slate-900">\${{ p.total_debitado | number:'1.0-0' }}</p>
                  <p class="text-[10px] text-slate-500">{{ p.creado_en | date:'dd/MM/yy' }}</p>
                </div>
              </button>

              <!-- Detalle expandido -->
              @if (expandido() === p.id) {
                <div class="px-4 sm:px-5 py-4 border-t border-slate-100 bg-slate-50/50 text-sm space-y-4">

                  <!-- Datos cliente + dirección -->
                  <div class="grid sm:grid-cols-2 gap-3">
                    <div>
                      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cliente</p>
                      <p class="font-bold text-slate-900">{{ p.cliente_nombre }}</p>
                      @if (p.cliente_cedula) { <p class="text-xs text-slate-600">CC {{ p.cliente_cedula }}</p> }
                      <p class="text-xs text-slate-600">{{ p.cliente_telefono }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Dirección</p>
                      <p class="text-slate-800">{{ p.cliente_direccion }}</p>
                      <p class="text-xs text-slate-600">{{ p.cliente_ciudad }}, {{ p.cliente_departamento }}</p>
                    </div>
                  </div>

                  @if (p.cliente_observaciones) {
                    <div>
                      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Observaciones</p>
                      <p class="text-slate-700">{{ p.cliente_observaciones }}</p>
                    </div>
                  }

                  <!-- Costos -->
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cantidad</p>
                      <p class="font-bold text-slate-900">{{ p.cantidad }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Subtotal</p>
                      <p class="font-bold text-slate-900">\${{ p.subtotal | number:'1.0-0' }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Flete</p>
                      <p class="font-bold text-slate-900">\${{ p.flete | number:'1.0-0' }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Debitado</p>
                      <p class="font-black text-primary">\${{ p.total_debitado | number:'1.0-0' }}</p>
                    </div>
                  </div>

                  <!-- Guía + seguro antidevoluciones -->
                  @if (p.guia || p.seguro_antidevoluciones) {
                    <div class="pt-2 border-t border-slate-200 flex flex-wrap gap-3 items-start">
                      @if (p.guia) {
                        <div>
                          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Guía · {{ p.transportadora }}</p>
                          <p class="font-bold text-slate-900 font-mono text-sm">{{ p.guia }}</p>
                        </div>
                      }
                      @if (p.seguro_antidevoluciones) {
                        <div class="ml-auto shrink-0">
                          <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
                            <span class="material-symbols-outlined text-[15px] text-amber-600">shield</span>
                            Seguro antidevoluciones activo
                          </div>
                          @if (p.estado === 'devuelto') {
                            <p class="text-[11px] text-green-700 mt-1 font-bold">
                              ✓ Protegido — sin cobro de flete en devolución
                            </p>
                          }
                        </div>
                      }
                    </div>
                  }

                  <!-- ── Sección Tracking ─────────────────────────────────── -->
                  @if (p.mipaquete_sending_id) {
                    <div class="pt-3 border-t border-slate-200 space-y-2">

                      <div class="flex items-center justify-between">
                        <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                          <span class="material-symbols-outlined text-[14px]">local_shipping</span>
                          Seguimiento en tiempo real
                        </p>
                        <button (click)="refrescarTracking(p, $event)" type="button"
                                class="text-[11px] font-bold text-slate-500 hover:text-primary inline-flex items-center gap-1 transition">
                          <span class="material-symbols-outlined text-[14px]"
                                [class.animate-spin]="estaActualizandoTracking(p.id)">
                            refresh
                          </span>
                          {{ estaActualizandoTracking(p.id) ? 'Actualizando…' : 'Actualizar' }}
                        </button>
                      </div>

                      <!-- Estado actual destacado -->
                      @if (p.tracking_ultimo_estado) {
                        <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
                          <span class="w-2.5 h-2.5 rounded-full shrink-0 inline-block" [class]="puntoEstado(p.estado)"></span>
                          <span class="font-bold text-slate-900 text-sm flex-1">{{ p.tracking_ultimo_estado }}</span>
                          @if (p.tracking_actualizado_en) {
                            <span class="text-[11px] text-slate-400 shrink-0">
                              {{ p.tracking_actualizado_en | date:'dd/MM HH:mm' }}
                            </span>
                          }
                        </div>
                      }

                      <!-- Timeline de eventos -->
                      @if ((p.tracking_eventos?.length ?? 0) > 0) {
                        <div class="relative pl-4 space-y-0 max-h-52 overflow-y-auto pr-1">
                          <!-- Línea vertical -->
                          <div class="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200"></div>
                          @for (ev of p.tracking_eventos!; track $index) {
                            <div class="relative flex gap-3 py-1.5">
                              <span class="absolute left-[-9px] top-3 w-2.5 h-2.5 rounded-full border-2 shrink-0"
                                    [class]="$index === 0 ? 'bg-primary border-primary' : 'bg-white border-slate-300'">
                              </span>
                              <div class="flex-1 min-w-0">
                                <p class="text-xs font-bold text-slate-800 leading-tight">
                                  {{ evEstado(ev) || evDescripcion(ev) }}
                                </p>
                                @if (evEstado(ev) && evDescripcion(ev) && evEstado(ev) !== evDescripcion(ev)) {
                                  <p class="text-[11px] text-slate-500 mt-0.5">{{ evDescripcion(ev) }}</p>
                                }
                                <div class="flex items-center gap-2 mt-0.5">
                                  @if (evFecha(ev)) {
                                    <span class="text-[11px] text-slate-400">{{ evFecha(ev) }}</span>
                                  }
                                  @if (evCiudad(ev)) {
                                    <span class="text-[11px] text-slate-400">· {{ evCiudad(ev) }}</span>
                                  }
                                </div>
                              </div>
                            </div>
                          }
                        </div>
                      } @else if (!p.tracking_ultimo_estado) {
                        @if (estaActualizandoTracking(p.id)) {
                          <div class="text-xs text-slate-400 flex items-center gap-1.5 px-3 py-2">
                            <span class="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                            Consultando transportadora…
                          </div>
                        } @else {
                          <div class="text-xs text-slate-400 px-3 py-2 flex items-center gap-2">
                            <span class="material-symbols-outlined text-[14px]">schedule</span>
                            Sin eventos de tracking aún. Pulsa Actualizar para consultar.
                          </div>
                        }
                      }

                    </div>
                  }

                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class MisPedidosComponent implements OnInit, OnDestroy {
  private readonly pedidosSrv  = inject(PedidosService);
  private readonly mipaquete   = inject(MipaqueteService);
  private readonly supabase    = inject(SupabaseService);
  private readonly auth        = inject(AuthService);

  readonly pedidos       = signal<Pedido[]>([]);
  readonly cargando      = signal(true);
  readonly filtroEstado  = signal<EstadoPedido | null>(null);
  readonly expandido     = signal<string | null>(null);

  // IDs de pedidos cuyo tracking está siendo actualizado manualmente
  private readonly trackingCargandoIds = signal(new Set<string>());

  // Canal Realtime para actualizaciones automáticas del job de tracking
  private realtimeChannel: ReturnType<typeof this.supabase.cliente.channel> | null = null;

  readonly estados: EstadoPedido[] = [
    'pendiente','guia_generada','confirmado','despachado','en_ruta','entregado','cancelado','devuelto',
  ];

  readonly pedidosFiltrados = computed(() => {
    const f = this.filtroEstado();
    return f ? this.pedidos().filter(p => p.estado === f) : this.pedidos();
  });

  async ngOnInit() {
    await this.cargar();
    this.suscribirRealtime();
  }

  ngOnDestroy() {
    if (this.realtimeChannel) {
      this.supabase.cliente.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  // ── Carga inicial ────────────────────────────────────────────────

  async cargar() {
    this.cargando.set(true);
    try {
      const data = await this.pedidosSrv.misPedidos();
      this.pedidos.set(data);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Realtime: el job de tracking actualiza la DB → UI se refresca ─

  private suscribirRealtime() {
    const userId = this.auth.usuario()?.id;
    if (!userId) return;

    this.realtimeChannel = this.supabase.cliente
      .channel(`mis-pedidos-${userId}`)
      .on(
        'postgres_changes' as any,
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'pedidos',
          filter: `vendedor_id=eq.${userId}`,
        },
        (payload: any) => {
          const updated: Partial<Pedido> & { id: string } = payload.new;
          this.pedidos.update(lista =>
            lista.map(p => {
              if (p.id !== updated.id) return p;
              // Merge de campos actualizados preservando joins (producto, vendedor)
              return { ...p, ...updated, producto: p.producto, vendedor: p.vendedor };
            })
          );
        }
      )
      .subscribe();
  }

  // ── Tracking manual por pedido ───────────────────────────────────

  async refrescarTracking(pedido: Pedido, event: Event) {
    event.stopPropagation();
    if (!pedido.mipaquete_sending_id || this.estaActualizandoTracking(pedido.id)) return;

    this.setTrackingCargando(pedido.id, true);
    try {
      const result = await this.mipaquete.tracking(pedido.id);
      const eventos = result.tracking ?? [];
      const primerEv = eventos[0];
      const ultimoEstado = primerEv
        ? String(primerEv['state'] ?? primerEv['estado'] ?? primerEv['status'] ?? primerEv['description'] ?? '')
        : '';

      this.pedidos.update(lista =>
        lista.map(p => p.id === pedido.id
          ? {
              ...p,
              tracking_eventos:        eventos,
              tracking_actualizado_en: new Date().toISOString(),
              tracking_ultimo_estado:  ultimoEstado || p.tracking_ultimo_estado,
            }
          : p
        )
      );
    } catch {
      // Fallo silencioso — el usuario puede reintentar
    } finally {
      this.setTrackingCargando(pedido.id, false);
    }
  }

  estaActualizandoTracking(id: string): boolean {
    return this.trackingCargandoIds().has(id);
  }

  private setTrackingCargando(id: string, loading: boolean) {
    this.trackingCargandoIds.update(s => {
      const next = new Set(s);
      if (loading) next.add(id); else next.delete(id);
      return next;
    });
  }

  // ── Expansión ────────────────────────────────────────────────────

  toggle(id: string) {
    const siguiente = this.expandido() === id ? null : id;
    this.expandido.set(siguiente);
    // Al abrir un pedido con guía pero sin tracking, cargarlo automáticamente
    if (siguiente) {
      const p = this.pedidos().find(x => x.id === id);
      if (p?.mipaquete_sending_id && !p.tracking_ultimo_estado && !this.estaActualizandoTracking(id)) {
        this.refrescarTracking(p, new Event('auto'));
      }
    }
  }

  // ── Helpers template ─────────────────────────────────────────────

  etiqueta(e: EstadoPedido)  { return ETIQUETAS_ESTADO[e]; }
  colorEstado(e: EstadoPedido) { return COLORES_ESTADO[e]; }
  puntoEstado(e: EstadoPedido) { return PUNTOS_ESTADO[e] ?? 'bg-slate-400'; }

  evEstado(ev: TrackingEvento): string {
    return String(ev.state ?? ev.estado ?? ev.status ?? '');
  }
  evDescripcion(ev: TrackingEvento): string {
    return String(ev.description ?? ev.descripcion ?? '');
  }
  evFecha(ev: TrackingEvento): string {
    const d = String(ev.date ?? ev.fecha ?? '');
    const t = String(ev.time ?? ev.hora ?? '');
    return [d, t].filter(Boolean).join(' ');
  }
  evCiudad(ev: TrackingEvento): string {
    return String(ev.city ?? ev.ciudad ?? ev.office ?? ev.oficina ?? '');
  }
}
