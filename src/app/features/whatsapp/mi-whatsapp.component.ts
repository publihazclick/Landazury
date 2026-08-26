import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';

interface ConectarRespuesta {
  status: string;
  instance_name: string;
  estado: 'conectado' | 'conectando' | 'desconectado' | 'error';
  qrcode: string | null;
  ya_conectado: boolean;
  error?: string;
}

interface EstadoRespuesta {
  estado: 'conectado' | 'conectando' | 'desconectado' | 'error';
  conectado: boolean;
  numero: string | null;
  error?: string;
}

@Component({
  selector: 'app-mi-whatsapp',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">

      <div>
        <h1 class="text-2xl font-black text-slate-900 flex items-center gap-2">
          <span class="material-symbols-outlined text-emerald-600 text-3xl">smartphone</span>
          Mi WhatsApp
        </h1>
        <p class="text-sm text-slate-600 mt-1">
          Conecta tu WhatsApp para que las notificaciones automáticas a tus clientes salgan desde <span class="font-bold">tu propio número</span>. Así te reconocen y te contestan más rápido.
        </p>
      </div>

      @if (error()) {
        <div class="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-start gap-2">
          <span class="material-symbols-outlined text-base">error</span>
          {{ error() }}
        </div>
      }

      @if (cargandoInicial()) {
        <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          Cargando estado…
        </div>
      } @else if (conectado()) {

        <!-- Estado: conectado -->
        <div class="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 text-center space-y-3">
          <div class="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-700 text-4xl">check_circle</span>
          </div>
          <h2 class="text-lg font-black text-emerald-900">WhatsApp conectado</h2>
          @if (numero()) {
            <p class="text-sm text-emerald-800">
              Número conectado: <span class="font-mono font-bold">+{{ numero() }}</span>
            </p>
          }
          @if (conectadoEn()) {
            <p class="text-xs text-emerald-700">Activo desde {{ conectadoEn() | date:'medium' }}</p>
          }
          <p class="text-xs text-emerald-700 max-w-md mx-auto">
            Las notificaciones a tus clientes saldrán automáticamente desde tu WhatsApp en cada cambio de estado del pedido.
          </p>

          <div class="pt-3 flex flex-col sm:flex-row gap-2 justify-center">
            <button type="button" (click)="refrescarEstado()" [disabled]="refrescando()"
                    class="px-4 py-2.5 rounded-xl border border-emerald-300 text-emerald-800 font-bold text-sm hover:bg-emerald-100 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-base">refresh</span>
              {{ refrescando() ? 'Verificando…' : 'Verificar conexión' }}
            </button>
            <button type="button" (click)="confirmarDesconectar()" [disabled]="desconectando()"
                    class="px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-base">link_off</span>
              {{ desconectando() ? 'Desconectando…' : 'Desconectar' }}
            </button>
          </div>
        </div>

      } @else if (qrcode()) {

        <!-- Estado: mostrando QR -->
        <div class="bg-white rounded-2xl border-2 border-emerald-300 p-6 text-center space-y-4">
          <h2 class="text-base font-black text-slate-900">Escanea el QR con tu WhatsApp</h2>

          <ol class="text-left text-xs text-slate-700 max-w-sm mx-auto space-y-1.5 list-decimal list-inside">
            <li>Abre <span class="font-bold">WhatsApp</span> en tu celular</li>
            <li>Toca el menú <span class="font-bold">⋮</span> (Android) o <span class="font-bold">Configuración</span> (iPhone)</li>
            <li>Selecciona <span class="font-bold">Dispositivos vinculados</span></li>
            <li>Toca <span class="font-bold">Vincular un dispositivo</span> y escanea el código de abajo</li>
          </ol>

          <div class="inline-block p-3 rounded-2xl bg-white shadow-md border border-slate-200">
            <img [src]="qrcode()" alt="QR WhatsApp" class="w-64 h-64 object-contain"/>
          </div>

          <div class="text-xs text-slate-500 flex items-center justify-center gap-2">
            @if (esperandoConexion()) {
              <span class="material-symbols-outlined text-base animate-spin">progress_activity</span>
              Esperando que escanees el código…
            } @else {
              <span class="material-symbols-outlined text-base">schedule</span>
              Listo para escanear
            }
          </div>

          <div class="pt-1 flex flex-col sm:flex-row gap-2 justify-center">
            <button type="button" (click)="conectar()" [disabled]="conectando()"
                    class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-base">refresh</span>
              {{ conectando() ? 'Generando…' : 'Generar QR nuevo' }}
            </button>
            <button type="button" (click)="cancelarConexion()"
                    class="px-4 py-2.5 rounded-xl text-slate-500 font-bold text-sm hover:text-slate-800">
              Cancelar
            </button>
          </div>
        </div>

      } @else {

        <!-- Estado: desconectado, sin QR -->
        <div class="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-4">
          <div class="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
            <span class="material-symbols-outlined text-slate-500 text-4xl">link_off</span>
          </div>
          <h2 class="text-lg font-bold text-slate-900">WhatsApp no conectado</h2>
          <p class="text-sm text-slate-600 max-w-md mx-auto">
            Cuando lo conectes, cada vez que cambie el estado de uno de tus pedidos, tu cliente recibirá un WhatsApp automáticamente <span class="font-bold">desde tu número</span> con el detalle de la guía.
          </p>

          <button type="button" (click)="conectar()" [disabled]="conectando()"
                  class="px-6 py-3 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-700 active:scale-95 disabled:opacity-50 inline-flex items-center gap-2">
            <span class="material-symbols-outlined">qr_code_2</span>
            {{ conectando() ? 'Generando QR…' : 'Conectar mi WhatsApp' }}
          </button>
        </div>

      }

      <!-- Info card -->
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-2">
        <p class="font-bold text-slate-700 flex items-center gap-1.5">
          <span class="material-symbols-outlined text-base">info</span>
          Cómo funciona
        </p>
        <ul class="list-disc list-inside space-y-1">
          <li>Solo tú decides si conectas o no — es opcional.</li>
          <li>Si lo conectas, las notificaciones de pedidos a tus clientes salen desde tu número.</li>
          <li>Si no lo conectas, salen desde el número de la plataforma (más impersonal).</li>
          <li>Puedes desconectar en cualquier momento.</li>
          <li>Solo se envían mensajes <span class="font-bold">transaccionales</span> (cambios de estado del pedido). Nunca usamos tu cuenta para marketing.</li>
        </ul>
      </div>

    </div>
  `,
})
export class MiWhatsappComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  readonly auth = inject(AuthService);

  readonly cargandoInicial = signal(true);
  readonly conectando = signal(false);
  readonly desconectando = signal(false);
  readonly refrescando = signal(false);
  readonly esperandoConexion = signal(false);
  readonly conectado = signal(false);
  readonly numero = signal<string | null>(null);
  readonly conectadoEn = signal<string | null>(null);
  readonly qrcode = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  private polling: ReturnType<typeof setInterval> | null = null;

  async ngOnInit() {
    await this.cargarEstadoActual();
    this.cargandoInicial.set(false);
  }

  ngOnDestroy() {
    this.detenerPolling();
  }

  private async cargarEstadoActual() {
    const u = this.auth.usuario();
    if (!u) return;
    const { data } = await this.supabase.cliente
      .from('perfiles')
      .select('whatsapp_estado, whatsapp_numero, whatsapp_conectado_en')
      .eq('id', u.id)
      .single();
    if (data?.whatsapp_estado === 'conectado') {
      this.conectado.set(true);
      this.numero.set(data.whatsapp_numero);
      this.conectadoEn.set(data.whatsapp_conectado_en);
    }
  }

  async conectar() {
    this.error.set(null);
    this.conectando.set(true);
    try {
      const { data, error } = await this.supabase.cliente.functions.invoke<ConectarRespuesta>(
        'wa-vendedor-conectar', { body: {} },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.ya_conectado) {
        this.conectado.set(true);
        await this.cargarEstadoActual();
        this.qrcode.set(null);
      } else {
        this.qrcode.set(data?.qrcode ?? null);
        if (!data?.qrcode) {
          this.error.set('No se pudo generar el QR. Intenta de nuevo en unos segundos.');
        } else {
          this.iniciarPolling();
        }
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al conectar WhatsApp.');
    } finally {
      this.conectando.set(false);
    }
  }

  private iniciarPolling() {
    this.detenerPolling();
    this.esperandoConexion.set(true);
    this.polling = setInterval(() => this.checkEstado(), 4000);
  }

  private detenerPolling() {
    if (this.polling) {
      clearInterval(this.polling);
      this.polling = null;
    }
    this.esperandoConexion.set(false);
  }

  private async checkEstado() {
    try {
      const { data, error } = await this.supabase.cliente.functions.invoke<EstadoRespuesta>(
        'wa-vendedor-estado', { body: {} },
      );
      if (error) return;
      if (data?.conectado) {
        this.detenerPolling();
        this.qrcode.set(null);
        this.conectado.set(true);
        this.numero.set(data.numero ?? null);
        this.conectadoEn.set(new Date().toISOString());
      }
    } catch {}
  }

  async refrescarEstado() {
    this.refrescando.set(true);
    try {
      const { data } = await this.supabase.cliente.functions.invoke<EstadoRespuesta>(
        'wa-vendedor-estado', { body: {} },
      );
      if (data) {
        this.conectado.set(data.conectado);
        if (data.numero) this.numero.set(data.numero);
        if (!data.conectado) {
          this.qrcode.set(null);
        }
      }
    } finally {
      this.refrescando.set(false);
    }
  }

  cancelarConexion() {
    this.qrcode.set(null);
    this.detenerPolling();
  }

  async confirmarDesconectar() {
    if (!confirm('¿Seguro que quieres desconectar tu WhatsApp? Las notificaciones a tus clientes dejarán de salir desde tu número.')) {
      return;
    }
    this.desconectando.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.cliente.functions.invoke('wa-vendedor-desconectar', { body: {} });
      if (error) throw error;
      this.conectado.set(false);
      this.numero.set(null);
      this.conectadoEn.set(null);
      this.qrcode.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al desconectar.');
    } finally {
      this.desconectando.set(false);
    }
  }
}
