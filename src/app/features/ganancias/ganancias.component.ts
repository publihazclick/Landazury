import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GananciasService } from '../../core/services/ganancias.service';
import type {
  MovimientoGanancia, MetodoPagoVendedor, RetiroGanancia, TipoMetodoPago,
} from '../../core/models/ganancias.model';

const ICONO_METODO: Record<TipoMetodoPago, string> = {
  nequi:       'smartphone',
  daviplata:   'smartphone',
  bancolombia: 'account_balance',
  otro_banco:  'account_balance',
};

const LABEL_METODO: Record<TipoMetodoPago, string> = {
  nequi:       'Nequi',
  daviplata:   'Daviplata',
  bancolombia: 'Bancolombia',
  otro_banco:  'Otro banco',
};

@Component({
  selector: 'app-ganancias',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, UpperCasePipe],
  template: `
  <div class="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

    <!-- ── Hero: saldo de ganancias ─────────────────────────────── -->
    <div class="rounded-3xl overflow-hidden shadow-xl">
      <div class="bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 px-6 pt-8 pb-6 text-white">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-green-100 text-sm font-bold uppercase tracking-widest">Mis Ganancias</p>
            @if (cargando()) {
              <div class="mt-2 h-12 w-48 bg-white/20 rounded-xl animate-pulse"></div>
            } @else {
              <p class="text-5xl font-black mt-2 tabular-nums">
                \${{ saldo() | number:'1.0-0' }}
              </p>
              <p class="text-green-100 text-sm mt-1">COP disponibles para retirar</p>
            }
          </div>
          <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-4xl">savings</span>
          </div>
        </div>

        <!-- Stats rápidas -->
        <div class="grid grid-cols-2 gap-3 mt-6">
          <div class="bg-white/15 rounded-2xl px-4 py-3">
            <p class="text-green-100 text-xs font-bold">Total acreditado</p>
            <p class="text-white font-black text-lg tabular-nums">
              \${{ totalAcreditado() | number:'1.0-0' }}
            </p>
          </div>
          <div class="bg-white/15 rounded-2xl px-4 py-3">
            <p class="text-green-100 text-xs font-bold">Total retirado</p>
            <p class="text-white font-black text-lg tabular-nums">
              \${{ totalRetirado() | number:'1.0-0' }}
            </p>
          </div>
        </div>
      </div>

      <!-- CTA retirar -->
      <div class="bg-white px-6 py-4 flex items-center gap-3">
        <button (click)="abrirRetiro()" type="button"
                [disabled]="saldo() <= 0"
                class="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-black text-base
                       hover:bg-emerald-600 active:scale-95 transition disabled:opacity-40
                       disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-md">
          <span class="material-symbols-outlined text-xl">payments</span>
          Retirar ganancias
        </button>
        <button (click)="cargarTodo()" type="button"
                class="w-11 h-11 rounded-xl border border-slate-200 hover:bg-slate-50
                       flex items-center justify-center text-slate-500 transition">
          <span class="material-symbols-outlined text-xl" [class.animate-spin]="cargando()">refresh</span>
        </button>
      </div>
    </div>

    <!-- ── Cómo funcionan las ganancias ────────────────────────── -->
    <div class="rounded-2xl overflow-hidden border border-emerald-100 shadow-sm">
      <div class="bg-emerald-50 px-5 py-4 border-b border-emerald-100">
        <p class="font-black text-emerald-900 flex items-center gap-2">
          <span class="material-symbols-outlined text-emerald-600">info</span>
          ¿Cómo se calculan tus ganancias?
        </p>
      </div>
      <div class="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <div class="px-5 py-4 bg-white">
          <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Por cada pedido entregado</p>
          <div class="space-y-2 text-sm">
            <div class="flex items-start gap-2">
              <span class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">1</span>
              <p class="text-slate-700"><strong>Flete neto de envío</strong> — lo que cobró la transportadora sin nuestro markup</p>
            </div>
            <div class="flex items-start gap-2">
              <span class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">2</span>
              <p class="text-slate-700"><strong>Ganancia producto</strong> — precio de venta al cliente menos costo a dropshippers</p>
            </div>
          </div>
        </div>
        <div class="px-5 py-4 bg-slate-50">
          <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Retiro</p>
          <ul class="space-y-1.5 text-sm text-slate-700">
            <li class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span>
              Sin monto mínimo de retiro
            </li>
            <li class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span>
              Procesado en máximo 24 horas
            </li>
            <li class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span>
              Nequi, Daviplata o cuenta bancaria
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- ── Métodos de pago ───────────────────────────────────────── -->
    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <p class="font-black text-slate-900">Métodos de pago</p>
        <button (click)="abrirFormMetodo()" type="button"
                class="text-xs font-bold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">add</span>
          Agregar
        </button>
      </div>

      @if (cargandoMetodos()) {
        <div class="p-6 text-center text-sm text-slate-400">Cargando…</div>
      } @else if (metodos().length === 0) {
        <div class="p-6 text-center">
          <span class="material-symbols-outlined text-4xl text-slate-300 block mb-2">account_balance_wallet</span>
          <p class="text-sm text-slate-500">No tienes métodos de pago.</p>
          <p class="text-xs text-slate-400 mt-0.5">Agrega uno para poder retirar tus ganancias.</p>
        </div>
      } @else {
        <div class="divide-y divide-slate-100">
          @for (m of metodos(); track m.id) {
            <div class="px-5 py-3.5 flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-emerald-600 text-xl">{{ iconoMetodo(m.tipo) }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-bold text-slate-900 text-sm">{{ labelMetodo(m.tipo) }} · {{ m.numero }}</p>
                <p class="text-xs text-slate-500 truncate">{{ m.titular }}{{ m.banco ? ' · ' + m.banco : '' }}</p>
              </div>
              <button (click)="eliminarMetodo(m)" type="button"
                      class="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          }
        </div>
      }
    </div>

    <!-- ── Historial de movimientos ──────────────────────────────── -->
    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <p class="font-black text-slate-900">Historial</p>
        <span class="text-xs text-slate-400">Últimos {{ movimientos().length }} movimientos</span>
      </div>

      @if (cargandoMovimientos()) {
        <div class="p-6 text-center text-sm text-slate-400">Cargando…</div>
      } @else if (movimientos().length === 0) {
        <div class="p-8 text-center">
          <span class="material-symbols-outlined text-4xl text-slate-300 block mb-2">receipt_long</span>
          <p class="text-sm text-slate-500">Sin movimientos aún.</p>
          <p class="text-xs text-slate-400 mt-0.5">Tus ganancias aparecerán aquí cuando tus pedidos sean entregados.</p>
        </div>
      } @else {
        <div class="divide-y divide-slate-100">
          @for (m of movimientos(); track m.id) {
            <div class="px-5 py-3.5 flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                   [class]="m.tipo === 'acreditacion' ? 'bg-emerald-50' : m.tipo === 'retiro' ? 'bg-red-50' : 'bg-blue-50'">
                <span class="material-symbols-outlined text-[18px]"
                      [class]="m.tipo === 'acreditacion' ? 'text-emerald-600' : m.tipo === 'retiro' ? 'text-red-500' : 'text-blue-500'">
                  {{ m.tipo === 'acreditacion' ? 'trending_up' : m.tipo === 'retiro' ? 'payments' : 'sync' }}
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-slate-900 truncate">{{ m.descripcion }}</p>
                <p class="text-xs text-slate-400">{{ m.creado_en | date:'dd/MM/yyyy HH:mm' }}</p>
              </div>
              <p class="text-sm font-black tabular-nums shrink-0"
                 [class]="m.monto > 0 ? 'text-emerald-600' : 'text-red-500'">
                {{ m.monto > 0 ? '+' : '' }}\${{ m.monto | number:'1.0-0' }}
              </p>
            </div>
          }
        </div>
      }
    </div>

    <!-- ── Mis retiros solicitados ──────────────────────────────── -->
    @if (misRetiros().length > 0) {
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100">
          <p class="font-black text-slate-900">Solicitudes de retiro</p>
        </div>
        <div class="divide-y divide-slate-100">
          @for (r of misRetiros(); track r.id) {
            <div class="px-5 py-3.5 flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                   [class]="r.estado === 'procesado' ? 'bg-emerald-50' : r.estado === 'rechazado' ? 'bg-red-50' : 'bg-amber-50'">
                <span class="material-symbols-outlined text-[18px]"
                      [class]="r.estado === 'procesado' ? 'text-emerald-600' : r.estado === 'rechazado' ? 'text-red-500' : 'text-amber-500'">
                  {{ r.estado === 'procesado' ? 'check_circle' : r.estado === 'rechazado' ? 'cancel' : 'schedule' }}
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-slate-900">
                  \${{ r.monto | number:'1.0-0' }} COP
                  <span class="ml-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                        [class]="r.estado === 'procesado' ? 'bg-emerald-100 text-emerald-700' : r.estado === 'rechazado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'">
                    {{ r.estado === 'procesado' ? 'Pagado' : r.estado === 'rechazado' ? 'Rechazado' : 'En proceso' }}
                  </span>
                </p>
                <p class="text-xs text-slate-400">
                  {{ r.metodo_tipo | uppercase }} · {{ r.numero }} · {{ r.creado_en | date:'dd/MM/yy HH:mm' }}
                </p>
                @if (r.notas_admin) {
                  <p class="text-xs text-slate-500 mt-0.5">{{ r.notas_admin }}</p>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }

  </div>

  <!-- ── Modal: Solicitar retiro ──────────────────────────────────── -->
  @if (modalRetiro()) {
    <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
         (click)="cerrarRetiro()">
      <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
           (click)="$event.stopPropagation()">

        <div class="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <h3 class="font-black text-slate-900 text-lg">Retirar ganancias</h3>
            <p class="text-sm text-slate-500">Saldo disponible: <strong class="text-emerald-600">\${{ saldo() | number:'1.0-0' }} COP</strong></p>
          </div>
          <button (click)="cerrarRetiro()" type="button"
                  class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="overflow-y-auto px-6 pb-6 flex-1 space-y-5">

          @if (metodos().length === 0) {
            <div class="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-center">
              <span class="material-symbols-outlined text-amber-500 text-3xl block mb-2">account_balance_wallet</span>
              <p class="text-sm font-bold text-amber-900">Primero configura un método de pago</p>
              <p class="text-xs text-amber-700 mt-1">Cierra este modal y agrega un método de pago para continuar.</p>
            </div>
          } @else {

            <!-- Seleccionar método -->
            <div>
              <p class="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Método de pago</p>
              <div class="space-y-2">
                @for (m of metodos(); track m.id) {
                  <label class="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition"
                         [class.border-emerald-400]="retiroMetodoId === m.id"
                         [class.bg-emerald-50]="retiroMetodoId === m.id"
                         [class.border-slate-200]="retiroMetodoId !== m.id">
                    <input type="radio" [value]="m.id" [(ngModel)]="retiroMetodoId" name="metodoRetiro" class="accent-emerald-500"/>
                    <div class="flex-1 min-w-0">
                      <p class="font-bold text-sm text-slate-900">{{ labelMetodo(m.tipo) }}</p>
                      <p class="text-xs text-slate-500">{{ m.numero }} · {{ m.titular }}</p>
                    </div>
                  </label>
                }
              </div>
            </div>

            <!-- Monto -->
            <div>
              <p class="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Monto a retirar (COP)</p>
              <input type="number" [(ngModel)]="retiroMonto" [max]="saldo()" min="1"
                     placeholder="Ingresa el monto"
                     class="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-400 focus:border-transparent"/>
              <div class="flex gap-2 mt-2">
                @for (m of [50000, 100000, 200000, 500000]; track m) {
                  @if (m <= saldo()) {
                    <button type="button" (click)="retiroMonto = m"
                            class="flex-1 py-1.5 rounded-lg text-xs font-bold border border-slate-200 hover:border-emerald-400 hover:text-emerald-700 transition">
                      \${{ m | number:'1.0-0' }}
                    </button>
                  }
                }
                <button type="button" (click)="retiroMonto = saldo()"
                        class="flex-1 py-1.5 rounded-lg text-xs font-bold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition">
                  Todo
                </button>
              </div>
            </div>

            @if (errorRetiro()) {
              <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{{ errorRetiro() }}</div>
            }

            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
              <p class="font-bold text-slate-800 mb-1">⏱ Plazo de pago</p>
              <p>Tu retiro será procesado en las <strong>próximas 24 horas hábiles</strong> al método de pago seleccionado.</p>
            </div>

            <div class="flex gap-2 pt-1">
              <button type="button" (click)="cerrarRetiro()"
                      class="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
                Cancelar
              </button>
              <button type="button" (click)="confirmarRetiro()" [disabled]="procesandoRetiro() || !retiroMetodoId || !retiroMonto"
                      class="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-black hover:bg-emerald-600
                             disabled:opacity-50 disabled:cursor-not-allowed">
                @if (procesandoRetiro()) { Procesando… } @else { Retirar \${{ retiroMonto | number:'1.0-0' }} }
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  }

  <!-- ── Modal: Agregar método de pago ────────────────────────────── -->
  @if (modalMetodo()) {
    <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
         (click)="cerrarFormMetodo()">
      <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
           (click)="$event.stopPropagation()">

        <div class="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 class="font-black text-slate-900 text-lg">Agregar método de pago</h3>
          <button (click)="cerrarFormMetodo()" type="button"
                  class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="overflow-y-auto px-6 pb-6 flex-1 space-y-4">

          <!-- Tipo -->
          <div>
            <p class="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Tipo</p>
            <div class="grid grid-cols-2 gap-2">
              @for (t of tiposMetodo; track t.valor) {
                <button type="button" (click)="nuevoMetodo.tipo = t.valor"
                        class="flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 font-bold text-sm text-left transition"
                        [class.border-emerald-400]="nuevoMetodo.tipo === t.valor"
                        [class.bg-emerald-50]="nuevoMetodo.tipo === t.valor"
                        [class.text-emerald-900]="nuevoMetodo.tipo === t.valor"
                        [class.border-slate-200]="nuevoMetodo.tipo !== t.valor"
                        [class.text-slate-700]="nuevoMetodo.tipo !== t.valor">
                  <span class="material-symbols-outlined text-xl">{{ t.icono }}</span>
                  {{ t.label }}
                </button>
              }
            </div>
          </div>

          <!-- Titular -->
          <label class="block">
            <span class="text-xs font-bold text-slate-600">Nombre del titular *</span>
            <input [(ngModel)]="nuevoMetodo.titular" name="titular" placeholder="Ej: María García"
                   class="mt-1 w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400"/>
          </label>

          <!-- Número / celular -->
          <label class="block">
            <span class="text-xs font-bold text-slate-600">
              {{ nuevoMetodo.tipo === 'nequi' || nuevoMetodo.tipo === 'daviplata' ? 'Número de celular *' : 'Número de cuenta *' }}
            </span>
            <input [(ngModel)]="nuevoMetodo.numero" name="numero"
                   [placeholder]="nuevoMetodo.tipo === 'nequi' || nuevoMetodo.tipo === 'daviplata' ? '310 000 0000' : '000-000000-00'"
                   class="mt-1 w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400"/>
          </label>

          <!-- Solo bancos -->
          @if (nuevoMetodo.tipo === 'otro_banco') {
            <label class="block">
              <span class="text-xs font-bold text-slate-600">Nombre del banco *</span>
              <input [(ngModel)]="nuevoMetodo.banco" name="banco" placeholder="Ej: Davivienda"
                     class="mt-1 w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400"/>
            </label>
          }

          @if (nuevoMetodo.tipo === 'bancolombia' || nuevoMetodo.tipo === 'otro_banco') {
            <div>
              <p class="text-xs font-bold text-slate-600 mb-2">Tipo de cuenta</p>
              <div class="grid grid-cols-2 gap-2">
                @for (tc of ['Ahorros','Corriente']; track tc) {
                  <button type="button" (click)="nuevoMetodo.tipo_cuenta = tc"
                          class="py-2.5 rounded-xl border-2 font-bold text-sm transition"
                          [class.border-emerald-400]="nuevoMetodo.tipo_cuenta === tc"
                          [class.bg-emerald-50]="nuevoMetodo.tipo_cuenta === tc"
                          [class.border-slate-200]="nuevoMetodo.tipo_cuenta !== tc">
                    {{ tc }}
                  </button>
                }
              </div>
            </div>
          }

          @if (errorMetodo()) {
            <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{{ errorMetodo() }}</div>
          }

          <div class="flex gap-2 pt-1">
            <button type="button" (click)="cerrarFormMetodo()"
                    class="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
              Cancelar
            </button>
            <button type="button" (click)="guardarMetodo()" [disabled]="guardandoMetodo()"
                    class="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-black hover:bg-emerald-600 disabled:opacity-50">
              @if (guardandoMetodo()) { Guardando… } @else { Guardar }
            </button>
          </div>

        </div>
      </div>
    </div>
  }
  `,
})
export class GananciasComponent implements OnInit {
  private readonly srv = inject(GananciasService);
  private readonly route = inject(ActivatedRoute);

  // ── Estado ───────────────────────────────────────────────────────
  readonly saldo              = signal(0);
  readonly movimientos        = signal<MovimientoGanancia[]>([]);
  readonly metodos            = signal<MetodoPagoVendedor[]>([]);
  readonly misRetiros         = signal<RetiroGanancia[]>([]);

  readonly cargando           = signal(true);
  readonly cargandoMovimientos = signal(false);
  readonly cargandoMetodos    = signal(false);

  // Modales
  readonly modalRetiro  = signal(false);
  readonly modalMetodo  = signal(false);

  // Retiro
  retiroMonto    = 0;
  retiroMetodoId = '';
  readonly procesandoRetiro = signal(false);
  readonly errorRetiro      = signal<string | null>(null);

  // Agregar método
  nuevoMetodo: {
    tipo: TipoMetodoPago;
    titular: string;
    numero: string;
    banco: string;
    tipo_cuenta: string;
  } = { tipo: 'nequi', titular: '', numero: '', banco: '', tipo_cuenta: 'Ahorros' };
  readonly guardandoMetodo = signal(false);
  readonly errorMetodo     = signal<string | null>(null);

  // ── Computed ─────────────────────────────────────────────────────
  readonly totalAcreditado = computed(() =>
    this.movimientos()
      .filter(m => m.tipo === 'acreditacion')
      .reduce((s, m) => s + m.monto, 0)
  );
  readonly totalRetirado = computed(() =>
    this.movimientos()
      .filter(m => m.tipo === 'retiro')
      .reduce((s, m) => s + Math.abs(m.monto), 0)
  );

  // ── Config tipos de método ────────────────────────────────────────
  readonly tiposMetodo = [
    { valor: 'nequi'       as TipoMetodoPago, label: 'Nequi',        icono: 'smartphone' },
    { valor: 'daviplata'   as TipoMetodoPago, label: 'Daviplata',     icono: 'smartphone' },
    { valor: 'bancolombia' as TipoMetodoPago, label: 'Bancolombia',   icono: 'account_balance' },
    { valor: 'otro_banco'  as TipoMetodoPago, label: 'Otro banco',    icono: 'account_balance' },
  ];

  async ngOnInit() {
    await this.cargarTodo();
    const accion = this.route.snapshot.queryParams['accion'];
    if (accion === 'configurar') {
      this.abrirFormMetodo();
    } else if (accion === 'retirar' && this.saldo() > 0) {
      this.abrirRetiro();
    }
  }

  async cargarTodo() {
    this.cargando.set(true);
    try {
      const [billetera, movs, mets, retiros] = await Promise.all([
        this.srv.obtenerBilletera(),
        this.srv.obtenerMovimientos(),
        this.srv.obtenerMetodosPago(),
        this.srv.obtenerMisRetiros(),
      ]);
      this.saldo.set(billetera?.saldo ?? 0);
      this.movimientos.set(movs);
      this.metodos.set(mets);
      this.misRetiros.set(retiros);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Retiro ───────────────────────────────────────────────────────

  abrirRetiro() {
    this.retiroMonto    = this.saldo();
    this.retiroMetodoId = this.metodos()[0]?.id ?? '';
    this.errorRetiro.set(null);
    this.modalRetiro.set(true);
  }

  cerrarRetiro() { this.modalRetiro.set(false); }

  async confirmarRetiro() {
    const monto = Number(this.retiroMonto);
    if (!monto || monto <= 0) { this.errorRetiro.set('Ingresa un monto válido'); return; }
    if (monto > this.saldo()) { this.errorRetiro.set('Saldo insuficiente'); return; }
    if (!this.retiroMetodoId) { this.errorRetiro.set('Selecciona un método de pago'); return; }

    this.procesandoRetiro.set(true);
    this.errorRetiro.set(null);
    try {
      await this.srv.solicitarRetiro(monto, this.retiroMetodoId);
      this.cerrarRetiro();
      await this.cargarTodo();
    } catch (e: any) {
      this.errorRetiro.set(e?.message ?? 'Error al solicitar retiro');
    } finally {
      this.procesandoRetiro.set(false);
    }
  }

  // ── Métodos de pago ──────────────────────────────────────────────

  abrirFormMetodo() {
    this.nuevoMetodo = { tipo: 'nequi', titular: '', numero: '', banco: '', tipo_cuenta: 'Ahorros' };
    this.errorMetodo.set(null);
    this.modalMetodo.set(true);
  }

  cerrarFormMetodo() { this.modalMetodo.set(false); }

  async guardarMetodo() {
    if (!this.nuevoMetodo.titular.trim()) { this.errorMetodo.set('Ingresa el nombre del titular'); return; }
    if (!this.nuevoMetodo.numero.trim()) { this.errorMetodo.set('Ingresa el número'); return; }
    if (this.nuevoMetodo.tipo === 'otro_banco' && !this.nuevoMetodo.banco.trim()) {
      this.errorMetodo.set('Ingresa el nombre del banco'); return;
    }

    this.guardandoMetodo.set(true);
    this.errorMetodo.set(null);
    try {
      await this.srv.guardarMetodoPago({
        tipo:        this.nuevoMetodo.tipo,
        titular:     this.nuevoMetodo.titular.trim(),
        numero:      this.nuevoMetodo.numero.trim(),
        banco:       this.nuevoMetodo.banco.trim() || undefined,
        tipo_cuenta: (this.nuevoMetodo.tipo === 'bancolombia' || this.nuevoMetodo.tipo === 'otro_banco')
                     ? this.nuevoMetodo.tipo_cuenta || undefined
                     : undefined,
      });
      this.cerrarFormMetodo();
      this.metodos.set(await this.srv.obtenerMetodosPago());
    } catch (e: any) {
      this.errorMetodo.set(e?.message ?? 'Error al guardar');
    } finally {
      this.guardandoMetodo.set(false);
    }
  }

  async eliminarMetodo(m: MetodoPagoVendedor) {
    try {
      await this.srv.eliminarMetodoPago(m.id);
      this.metodos.set(this.metodos().filter(x => x.id !== m.id));
    } catch { /* ignore */ }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  iconoMetodo(tipo: TipoMetodoPago) { return ICONO_METODO[tipo] ?? 'account_balance'; }
  labelMetodo(tipo: TipoMetodoPago) { return LABEL_METODO[tipo] ?? tipo; }
}
