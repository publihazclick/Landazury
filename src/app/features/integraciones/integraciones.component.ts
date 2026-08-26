import {
  Component, inject, signal, computed, OnInit, OnDestroy, PLATFORM_ID,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe, isPlatformBrowser } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { MipaqueteService } from '../../core/services/mipaquete.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { WalletService } from '../../core/services/wallet.service';
import type { CiudadMipaquete, CotizacionTransportadora } from '../../core/models/mipaquete.model';
import type { TipoPago } from '../../core/models/pedido.model';

const SUPABASE_FUNCTIONS_URL = 'https://tisrfefpjordcpuzyiwr.supabase.co/functions/v1';

interface Integracion {
  id: string;
  plataforma: 'shopify' | 'woocommerce';
  nombre: string;
  url_tienda: string;
  webhook_token: string;
  activa: boolean;
  total_ordenes: number;
  creado_en: string;
}

interface PedidoExterno {
  id: string;
  integracion_id: string;
  plataforma: string;
  order_number: string | null;
  order_id_externo: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  cliente_nombre: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  cliente_ciudad: string | null;
  cliente_departamento: string | null;
  items_json: any[] | null;
  total_externo: number | null;
  moneda: string;
  recibido_en: string;
  integracion?: { nombre: string };
}

interface ProductoSimple {
  id: string;
  nombre: string;
  precio_base: number;
  precio_final: number | null;
  precio_sugerido: number | null;
  peso_kg: number;
  imagenes?: string[];
}

@Component({
  selector: 'app-integraciones',
  standalone: true,
  imports: [FormsModule, DecimalPipe, DatePipe],
  template: `
<div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

  <!-- Header -->
  <div>
    <h1 class="text-2xl font-black text-slate-900">Integraciones</h1>
    <p class="text-sm text-slate-500 mt-1">
      Conecta tu tienda Shopify o WooCommerce para recibir pedidos automáticamente.
    </p>
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 border-b border-slate-200">
    <button type="button" (click)="tab.set('tiendas')"
            class="px-4 py-2.5 text-sm font-bold rounded-t-lg transition-colors"
            [class.bg-white]="tab() === 'tiendas'"
            [class.text-primary]="tab() === 'tiendas'"
            [class.border-b-2]="tab() === 'tiendas'"
            [class.border-primary]="tab() === 'tiendas'"
            [class.text-slate-500]="tab() !== 'tiendas'"
            [class.hover\:text-slate-800]="tab() !== 'tiendas'">
      <span class="material-symbols-outlined text-[16px] align-middle mr-1">store</span>
      Mis tiendas ({{ integraciones().length }})
    </button>
    <button type="button" (click)="tab.set('ordenes')"
            class="px-4 py-2.5 text-sm font-bold rounded-t-lg transition-colors relative"
            [class.bg-white]="tab() === 'ordenes'"
            [class.text-primary]="tab() === 'ordenes'"
            [class.border-b-2]="tab() === 'ordenes'"
            [class.border-primary]="tab() === 'ordenes'"
            [class.text-slate-500]="tab() !== 'ordenes'"
            [class.hover\:text-slate-800]="tab() !== 'ordenes'">
      <span class="material-symbols-outlined text-[16px] align-middle mr-1">shopping_bag</span>
      Órdenes pendientes
      @if (pendientesCount() > 0) {
        <span class="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">
          {{ pendientesCount() }}
        </span>
      }
    </button>
  </div>

  <!-- ══ TAB: MIS TIENDAS ══════════════════════════════════════════════════ -->
  @if (tab() === 'tiendas') {
    @if (cargandoInteg()) {
      <div class="p-10 text-center text-slate-500 text-sm">Cargando…</div>
    } @else {
      <!-- Cards de plataformas -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <!-- Shopify -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-[#96bf48]/10 border border-[#96bf48]/30 flex items-center justify-center">
              <svg viewBox="0 0 109 124" class="w-7 h-7" fill="#96bf48"><path d="M74.7 14.8s-.3-1.5-1.5-2.2c-1.2-.7-3.5-1-3.5-1s-1.1-.2-2.6-.5c-.2-1-1-6.4-5.3-8.8-2.3-1.3-4.7-.7-6.6.8-1-.3-2.1-.5-3.3-.6-2.9-.3-6.3.4-9.3 3.5-5.7 5.7-3.7 14.1-3.7 14.1L74.7 14.8z"/><path d="M78.8 13.5l-4.1 1.3s.2 1 .2 2.8c0 0-7.2 2.1-14.7 4.3-7.4 2.1-14.9 4.3-14.9 4.3l.7 3.8 1.9 10.4 2.8 15.4 2.6 14.2 1.7 9.2.9 4.7s5.3-1.5 10.7-3l10.7-3.1 5.3-1.5-3.8-62.8z"/></svg>
            </div>
            <div>
              <p class="font-black text-slate-900">Shopify</p>
              <p class="text-xs text-slate-500">Sincroniza pedidos de tu tienda Shopify</p>
            </div>
          </div>

          @for (i of integShopify(); track i.id) {
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm space-y-1">
              <div class="flex items-center justify-between">
                <p class="font-bold text-slate-800">{{ i.nombre }}</p>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      [class.bg-green-100]="i.activa" [class.text-green-700]="i.activa"
                      [class.bg-slate-200]="!i.activa" [class.text-slate-500]="!i.activa">
                  {{ i.activa ? 'Activa' : 'Inactiva' }}
                </span>
              </div>
              <p class="text-xs text-slate-500">{{ i.url_tienda }}</p>
              <p class="text-xs text-slate-500">{{ i.total_ordenes }} órdenes recibidas</p>
              <div class="flex gap-2 pt-1">
                <button type="button" (click)="verInstrucciones(i)"
                        class="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">
                  Ver webhook
                </button>
                <button type="button" (click)="eliminarIntegracion(i)"
                        class="py-1.5 px-3 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100">
                  Eliminar
                </button>
              </div>
            </div>
          }

          <button type="button" (click)="abrirConectar('shopify')"
                  class="w-full py-2.5 rounded-xl border-2 border-dashed border-[#96bf48]/50 text-[#4a7c04] font-bold text-sm hover:bg-[#96bf48]/5 transition flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-[18px]">add</span>
            Conectar tienda Shopify
          </button>
        </div>

        <!-- WooCommerce -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-[#7f54b3]/10 border border-[#7f54b3]/30 flex items-center justify-center">
              <svg viewBox="0 0 68 68" class="w-7 h-7"><path fill="#7f54b3" d="M5.4 0h57.2C65.6 0 68 2.4 68 5.4v41.3c0 3-2.4 5.4-5.4 5.4H38.3L43 68l-17-15.9H5.4C2.4 52.1 0 49.7 0 46.7V5.4C0 2.4 2.4 0 5.4 0z"/><path fill="#fff" d="M3.7 9.3c.5-.6 1.2-.9 2.1-.8 1.6.1 2.5 1 2.7 2.6 1.1 7.3 2.2 13.5 3.5 18.4l7.6-14.4c.7-1.3 1.6-2 2.7-2 1.6 0 2.6.9 3 2.8 1 4.9 2.3 9.1 3.8 12.7 1-9.7 2.8-16.7 5.2-21-.5-.9-.5-1.8 0-2.6.5-.9 1.3-1.3 2.4-1.3 1 0 1.9.4 2.5 1.1.7.8.9 1.7.6 2.8-2.4 4.3-4 11.7-4.8 22.3-.1.9-.4 1.6-1 2.1-.6.5-1.3.7-2 .7-1.4 0-2.4-.7-3.1-2L25 18.3l-8.6 16.4c-.7 1.3-1.7 2-3 2-1 0-1.9-.7-2.5-2C9.2 30.5 7.5 23.5 6 13.2c-.2-1.6.2-2.9 1.3-3.9h-3.6z"/></svg>
            </div>
            <div>
              <p class="font-black text-slate-900">WooCommerce</p>
              <p class="text-xs text-slate-500">Sincroniza pedidos de WordPress + WooCommerce</p>
            </div>
          </div>

          @for (i of integWoo(); track i.id) {
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm space-y-1">
              <div class="flex items-center justify-between">
                <p class="font-bold text-slate-800">{{ i.nombre }}</p>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      [class.bg-green-100]="i.activa" [class.text-green-700]="i.activa"
                      [class.bg-slate-200]="!i.activa" [class.text-slate-500]="!i.activa">
                  {{ i.activa ? 'Activa' : 'Inactiva' }}
                </span>
              </div>
              <p class="text-xs text-slate-500">{{ i.url_tienda }}</p>
              <p class="text-xs text-slate-500">{{ i.total_ordenes }} órdenes recibidas</p>
              <div class="flex gap-2 pt-1">
                <button type="button" (click)="verInstrucciones(i)"
                        class="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">
                  Ver webhook
                </button>
                <button type="button" (click)="eliminarIntegracion(i)"
                        class="py-1.5 px-3 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100">
                  Eliminar
                </button>
              </div>
            </div>
          }

          <button type="button" (click)="abrirConectar('woocommerce')"
                  class="w-full py-2.5 rounded-xl border-2 border-dashed border-[#7f54b3]/50 text-[#7f54b3] font-bold text-sm hover:bg-[#7f54b3]/5 transition flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-[18px]">add</span>
            Conectar tienda WooCommerce
          </button>
        </div>
      </div>

      <!-- Info box -->
      <div class="rounded-2xl bg-blue-50 border border-blue-200 p-4 flex gap-3 text-sm text-blue-800">
        <span class="material-symbols-outlined text-blue-500 text-2xl shrink-0">info</span>
        <div class="space-y-1">
          <p class="font-bold">¿Cómo funciona?</p>
          <p>1. Conecta tu tienda y copia la URL del webhook.</p>
          <p>2. Pégala en la configuración de tu tienda (instrucciones paso a paso al conectar).</p>
          <p>3. Cada pedido nuevo aparece aquí en "Órdenes pendientes".</p>
          <p>4. Revisa y aprueba el pedido — la guía se genera automáticamente.</p>
        </div>
      </div>
    }
  }

  <!-- ══ TAB: ÓRDENES PENDIENTES ═══════════════════════════════════════════ -->
  @if (tab() === 'ordenes') {
    <div class="flex items-center justify-between">
      <p class="text-sm text-slate-600">
        @if (pendientesCount() > 0) {
          Tienes <strong>{{ pendientesCount() }}</strong> órden{{ pendientesCount() > 1 ? 'es' : '' }} esperando aprobación.
        } @else {
          No hay órdenes pendientes.
        }
      </p>
      <button type="button" (click)="cargarOrdenes()"
              class="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
        <span class="material-symbols-outlined text-[15px]">refresh</span> Actualizar
      </button>
    </div>

    @if (cargandoOrdenes()) {
      <div class="p-10 text-center text-slate-500 text-sm">Cargando…</div>
    } @else if (ordenesPendientes().length === 0) {
      <div class="p-12 text-center bg-white rounded-2xl border border-slate-200">
        <span class="material-symbols-outlined text-slate-300 text-6xl">inbox</span>
        <p class="text-slate-500 text-sm mt-3">No hay órdenes pendientes de aprobación.</p>
        <p class="text-slate-400 text-xs mt-1">Cuando tus clientes compren en tu tienda, aparecerán aquí.</p>
      </div>
    } @else {
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th class="px-4 py-3 text-left font-bold">Orden</th>
                <th class="px-4 py-3 text-left font-bold">Tienda</th>
                <th class="px-4 py-3 text-left font-bold">Cliente</th>
                <th class="px-4 py-3 text-left font-bold">Productos</th>
                <th class="px-4 py-3 text-right font-bold">Total</th>
                <th class="px-4 py-3 text-left font-bold">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (o of ordenesPendientes(); track o.id) {
                <tr class="hover:bg-slate-50 align-top">
                  <td class="px-4 py-3">
                    <p class="font-bold text-slate-800">{{ o.order_number || o.order_id_externo }}</p>
                    <p class="text-[10px] text-slate-400">{{ o.recibido_en | date:'dd/MM/yy HH:mm' }}</p>
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          [class.bg-[#96bf48]/10]="o.plataforma==='shopify'"
                          [class.text-[#4a7c04]]="o.plataforma==='shopify'"
                          [class.bg-[#7f54b3]/10]="o.plataforma==='woocommerce'"
                          [class.text-[#7f54b3]]="o.plataforma==='woocommerce'">
                      {{ o.plataforma === 'shopify' ? 'Shopify' : 'WooCommerce' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-xs text-slate-600">{{ o.integracion?.nombre ?? '—' }}</td>
                  <td class="px-4 py-3">
                    <p class="font-bold text-slate-800">{{ o.cliente_nombre || '—' }}</p>
                    <p class="text-xs text-slate-500">{{ o.cliente_telefono }}</p>
                    <p class="text-xs text-slate-400 truncate max-w-[160px]">{{ o.cliente_ciudad }}</p>
                  </td>
                  <td class="px-4 py-3 text-xs text-slate-600 max-w-[180px]">
                    @for (it of (o.items_json ?? []); track $index) {
                      <p class="truncate">{{ it.cantidad }}× {{ it.nombre }}</p>
                    }
                  </td>
                  <td class="px-4 py-3 text-right">
                    @if (o.total_externo) {
                      <p class="font-black text-slate-900">\${{ o.total_externo | number:'1.0-0' }}</p>
                      <p class="text-[10px] text-slate-400">{{ o.moneda }}</p>
                    } @else {
                      <p class="text-slate-400 text-xs">—</p>
                    }
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex flex-col gap-1">
                      <button type="button" (click)="abrirAprobacion(o)"
                              class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 whitespace-nowrap">
                        Aprobar
                      </button>
                      <button type="button" (click)="rechazar(o)"
                              class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 whitespace-nowrap">
                        Rechazar
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <!-- Órdenes aprobadas / rechazadas (historial breve) -->
    @if (ordenesHistorial().length > 0) {
      <details class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <summary class="px-5 py-3.5 font-bold text-slate-700 text-sm cursor-pointer select-none list-none flex items-center justify-between">
          <span>Historial ({{ ordenesHistorial().length }})</span>
          <span class="material-symbols-outlined text-slate-400">expand_more</span>
        </summary>
        <div class="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          @for (o of ordenesHistorial(); track o.id) {
            <div class="px-5 py-3 flex items-center gap-3 text-sm">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    [class.bg-green-100]="o.estado === 'aprobado'"
                    [class.text-green-700]="o.estado === 'aprobado'"
                    [class.bg-red-100]="o.estado === 'rechazado'"
                    [class.text-red-700]="o.estado === 'rechazado'">
                {{ o.estado === 'aprobado' ? 'Aprobado' : 'Rechazado' }}
              </span>
              <span class="font-bold text-slate-700">{{ o.order_number || o.order_id_externo }}</span>
              <span class="text-slate-500">{{ o.cliente_nombre }}</span>
              <span class="text-slate-400 text-xs ml-auto">{{ o.recibido_en | date:'dd/MM/yy' }}</span>
            </div>
          }
        </div>
      </details>
    }
  }
</div>


<!-- ══ MODAL: CONECTAR TIENDA ═════════════════════════════════════════════ -->
@if (modalConectar()) {
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
       data-backdrop (click)="onConectarBackdrop($event)">
    <div class="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">

      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 class="font-black text-slate-900">
          Conectar {{ plataformaConectar() === 'shopify' ? 'Shopify' : 'WooCommerce' }}
        </h3>
        <button (click)="cerrarConectar()" type="button"
                class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      @if (!integCreada()) {
        <!-- Paso 1: datos -->
        <div class="p-6 space-y-4">
          <p class="text-sm text-slate-600">
            Ingresa los datos de tu tienda. En el siguiente paso te mostraremos la URL
            que debes copiar en tu plataforma.
          </p>
          <label class="block">
            <span class="text-xs font-bold text-slate-600">Nombre de la tienda</span>
            <input [(ngModel)]="conectarNombre" name="cn" placeholder="Ej: Mi tienda de ropa"
                   class="mt-1 w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"/>
          </label>
          <label class="block">
            <span class="text-xs font-bold text-slate-600">
              URL de tu tienda
              @if (plataformaConectar() === 'shopify') { <span class="text-slate-400">(Ej: mitienda.myshopify.com)</span> }
              @if (plataformaConectar() === 'woocommerce') { <span class="text-slate-400">(Ej: https://mitienda.com)</span> }
            </span>
            <input [(ngModel)]="conectarUrl" name="cu"
                   [placeholder]="plataformaConectar() === 'shopify' ? 'mitienda.myshopify.com' : 'https://mitienda.com'"
                   class="mt-1 w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"/>
          </label>

          @if (errorConectar()) {
            <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{{ errorConectar() }}</div>
          }

          <div class="flex gap-2 pt-2">
            <button type="button" (click)="cerrarConectar()"
                    class="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
              Cancelar
            </button>
            <button type="button" (click)="guardarIntegracion()" [disabled]="guardandoInteg()"
                    class="flex-1 py-2.5 rounded-xl bg-primary text-white font-black hover:bg-primary/90 disabled:opacity-50">
              @if (guardandoInteg()) { Guardando… } @else { Siguiente }
            </button>
          </div>
        </div>

      } @else {
        <!-- Paso 2: instrucciones + URL del webhook -->
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
            <span class="material-symbols-outlined text-green-600">check_circle</span>
            <p class="text-sm font-bold text-green-800">¡Tienda registrada! Ahora conecta el webhook.</p>
          </div>

          <div>
            <p class="text-xs font-bold text-slate-600 mb-1.5">URL de tu webhook (cópiala):</p>
            <div class="flex items-center gap-2">
              <input [value]="webhookUrl()" readonly
                     class="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-700"/>
              <button type="button" (click)="copiarWebhook()"
                      class="px-3 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 whitespace-nowrap inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px]">{{ copiado() ? 'check' : 'content_copy' }}</span>
                {{ copiado() ? 'Copiado' : 'Copiar' }}
              </button>
            </div>
          </div>

          <!-- Instrucciones por plataforma -->
          @if (plataformaConectar() === 'shopify') {
            <div class="space-y-2 text-sm text-slate-700">
              <p class="font-bold text-slate-900">Pasos en Shopify:</p>
              <ol class="list-decimal list-inside space-y-1.5 text-slate-600">
                <li>Ve a tu panel de Shopify → <strong>Configuración</strong></li>
                <li>Haz clic en <strong>Notificaciones</strong></li>
                <li>Baja hasta <strong>Webhooks</strong> y haz clic en <strong>"Crear webhook"</strong></li>
                <li>En <strong>Evento</strong> selecciona <strong>"Creación de pedido"</strong></li>
                <li>En <strong>URL</strong> pega la URL que copiaste arriba</li>
                <li>Formato: <strong>JSON</strong> · Versión API: la más reciente</li>
                <li>Haz clic en <strong>"Guardar webhook"</strong></li>
              </ol>
            </div>
          } @else {
            <div class="space-y-2 text-sm text-slate-700">
              <p class="font-bold text-slate-900">Pasos en WooCommerce:</p>
              <ol class="list-decimal list-inside space-y-1.5 text-slate-600">
                <li>Ve a tu WordPress → <strong>WooCommerce → Ajustes</strong></li>
                <li>Clic en la pestaña <strong>Avanzado</strong></li>
                <li>Clic en <strong>Webhooks</strong> y luego en <strong>"Añadir webhook"</strong></li>
                <li>Nombre: <strong>"Landazury pedidos"</strong></li>
                <li>Estado: <strong>Activo</strong></li>
                <li>Tema: <strong>Pedido creado</strong></li>
                <li>URL de entrega: pega la URL que copiaste arriba</li>
                <li>Clic en <strong>"Guardar webhook"</strong></li>
              </ol>
            </div>
          }

          <button type="button" (click)="cerrarConectar()"
                  class="w-full py-2.5 rounded-xl bg-primary text-white font-black hover:bg-primary/90">
            ¡Listo!
          </button>
        </div>
      }
    </div>
  </div>
}


<!-- ══ MODAL: APROBAR ORDEN ═══════════════════════════════════════════════ -->
@if (ordenActiva()) {
  <div class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
       data-backdrop-aprobacion (click)="onAprobacionBackdrop($event)">
    <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl overflow-hidden my-0 sm:my-4">

      <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <h3 class="font-black text-slate-900">
            Aprobar orden {{ ordenActiva()!.order_number || ordenActiva()!.order_id_externo }}
          </h3>
          <p class="text-xs text-slate-500">{{ ordenActiva()!.integracion?.nombre }} · {{ ordenActiva()!.plataforma }}</p>
        </div>
        <button (click)="cerrarAprobacion()" type="button"
                class="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      @if (exitoAprobacion()) {
        <!-- Éxito -->
        <div class="p-8 text-center space-y-4">
          <div class="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <span class="material-symbols-outlined text-green-600 text-4xl">check_circle</span>
          </div>
          <h4 class="text-lg font-black text-slate-900">Pedido creado</h4>
          <p class="text-sm text-slate-600">
            Pedido #{{ exitoAprobacion()!.numero }} generado.
            @if (guiaAprobacion()) {
              Guía: <strong>{{ guiaAprobacion() }}</strong>
            } @else if (generandoGuiaAprobacion()) {
              <span class="text-blue-600">Generando guía…</span>
            }
          </p>
          <button type="button" (click)="cerrarAprobacion()"
                  class="px-6 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90">
            Cerrar
          </button>
        </div>

      } @else {
        <div class="p-5 space-y-5">

          <!-- Datos del cliente (pre-llenados del webhook) -->
          <div class="space-y-3">
            <p class="text-xs font-bold uppercase tracking-wider text-slate-600">Datos del cliente</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block">
                <span class="text-xs text-slate-600">Nombre completo *</span>
                <input [(ngModel)]="apNombre" name="an" required
                       class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
              </label>
              <label class="block">
                <span class="text-xs text-slate-600">Teléfono *</span>
                <input [(ngModel)]="apTelefono" name="at"
                       class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
              </label>
              <label class="block sm:col-span-2">
                <span class="text-xs text-slate-600">Dirección *</span>
                <input [(ngModel)]="apDireccion" name="ad"
                       class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
              </label>
              <!-- Ciudad con DANE -->
              <label class="block sm:col-span-2 relative">
                <span class="text-xs text-slate-600">Ciudad destino * <span class="text-slate-400">(busca y selecciona)</span></span>
                <input [(ngModel)]="ciudadQuery" name="cq" autocomplete="off"
                       (input)="onCiudadInput()" (focus)="ciudadFocus.set(true)"
                       (blur)="onCiudadBlur()"
                       [placeholder]="ordenActiva()!.cliente_ciudad || 'Buscar ciudad…'"
                       class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
                @if (ciudadFocus() && sugerencias().length > 0 && !ciudadSeleccionada()) {
                  <div class="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    @for (c of sugerencias(); track c.dane_code) {
                      <button type="button" (mousedown)="seleccionarCiudad(c)"
                              class="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0">
                        <span class="font-bold">{{ c.ciudad }}</span>
                        <span class="text-xs text-slate-500">, {{ c.departamento }}</span>
                      </button>
                    }
                  </div>
                }
                @if (ciudadSeleccionada()) {
                  <div class="mt-1 flex items-center gap-2 text-xs text-green-700">
                    <span class="material-symbols-outlined text-[14px]">check_circle</span>
                    DANE {{ ciudadSeleccionada()!.dane_code }}
                    <button type="button" (click)="limpiarCiudad()" class="text-slate-500 underline">cambiar</button>
                  </div>
                }
              </label>
            </div>
          </div>

          <!-- Producto del catálogo -->
          <div class="space-y-2">
            <p class="text-xs font-bold uppercase tracking-wider text-slate-600">Producto del catálogo</p>

            @if (ordenActiva()!.items_json?.length) {
              <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <p class="font-bold">Producto(s) en la orden externa:</p>
                @for (it of ordenActiva()!.items_json ?? []; track $index) {
                  <p>{{ it.cantidad }}× {{ it.nombre }}
                    @if (it.precio) { — \${{ it.precio }} }
                  </p>
                }
              </div>
            }

            <label class="block relative">
              <span class="text-xs text-slate-600">Busca y selecciona el producto en el catálogo *</span>
              <input [(ngModel)]="productoQuery" name="pq" autocomplete="off"
                     (input)="buscarProductos()" placeholder="Nombre del producto…"
                     class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
              @if (!productoElegido() && productosResultados().length > 0) {
                <div class="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  @for (p of productosResultados(); track p.id) {
                    <button type="button" (mousedown)="elegirProducto(p)"
                            class="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0 flex items-center gap-2">
                      @if (p.imagenes?.[0]) {
                        <img [src]="p.imagenes![0]" class="w-8 h-8 rounded object-cover shrink-0" alt=""/>
                      }
                      <div>
                        <p class="font-bold">{{ p.nombre }}</p>
                        <p class="text-xs text-slate-500">\${{ (p.precio_final ?? p.precio_sugerido ?? p.precio_base) | number:'1.0-0' }}</p>
                      </div>
                    </button>
                  }
                </div>
              }
              @if (productoElegido()) {
                <div class="mt-1.5 flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  @if (productoElegido()!.imagenes?.[0]) {
                    <img [src]="productoElegido()!.imagenes![0]" class="w-9 h-9 rounded object-cover shrink-0" alt=""/>
                  }
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold truncate">{{ productoElegido()!.nombre }}</p>
                    <p class="text-xs text-slate-500">\${{ (productoElegido()!.precio_final ?? productoElegido()!.precio_sugerido ?? productoElegido()!.precio_base) | number:'1.0-0' }}</p>
                  </div>
                  <button type="button" (click)="limpiarProducto()" class="text-xs text-slate-500 underline shrink-0">cambiar</button>
                </div>
              }
            </label>
            <div class="flex items-center gap-3">
              <label class="block flex-1">
                <span class="text-xs text-slate-600">Cantidad</span>
                <input type="number" min="1" [(ngModel)]="apCantidad" name="ac"
                       class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
              </label>
              <label class="block flex-1">
                <span class="text-xs text-slate-600">Tipo de pago</span>
                <select [(ngModel)]="apTipoPago" name="atp"
                        class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                  <option value="cod">Contra entrega (COD)</option>
                  <option value="anticipado">Anticipado</option>
                </select>
              </label>
            </div>
            @if (apTipoPago === 'cod') {
              <label class="block">
                <span class="text-xs text-slate-600">Precio a cobrar al cliente (COD)</span>
                <input type="number" [(ngModel)]="apPrecioVenta" name="apv"
                       [placeholder]="ordenActiva()!.total_externo ?? ''"
                       class="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/>
              </label>
            }
          </div>

          <!-- Transportadora -->
          @if (ciudadSeleccionada() && productoElegido()) {
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-600">Transportadora</p>
                @if (!cotizando() && cotizaciones().length > 0) {
                  <button type="button" (click)="cotizar()" class="text-[11px] text-slate-500 hover:text-slate-800">
                    Recotizar
                  </button>
                }
              </div>
              @if (cotizando()) {
                <div class="p-4 text-center text-slate-500 text-sm border border-slate-200 rounded-xl bg-slate-50">
                  Cotizando transportadoras…
                </div>
              } @else if (errorCotizacion()) {
                <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {{ errorCotizacion() }}
                  <button type="button" (click)="cotizar()" class="ml-2 underline">Reintentar</button>
                </div>
              } @else if (cotizaciones().length > 0) {
                <div class="space-y-1.5">
                  @for (c of cotizaciones(); track c.quote_id) {
                    <button type="button" (click)="transportadoraElegida.set(c)"
                            [class.ring-2]="transportadoraElegida()?.quote_id === c.quote_id"
                            [class.ring-primary]="transportadoraElegida()?.quote_id === c.quote_id"
                            [class.bg-primary]="transportadoraElegida()?.quote_id === c.quote_id"
                            [class.text-white]="transportadoraElegida()?.quote_id === c.quote_id"
                            [class.bg-white]="transportadoraElegida()?.quote_id !== c.quote_id"
                            class="w-full px-4 py-2.5 rounded-xl border border-slate-200 hover:border-primary flex items-center gap-3 transition text-left">
                      @if (c.logo_url) {
                        <img [src]="c.logo_url" [alt]="c.delivery_company_name" class="w-10 h-10 rounded-lg object-contain bg-white border border-slate-100 shrink-0"/>
                      } @else {
                        <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <span class="material-symbols-outlined text-slate-400 text-[18px]">local_shipping</span>
                        </div>
                      }
                      <div class="flex-1 min-w-0">
                        <p class="font-black text-sm">{{ c.delivery_company_name }}</p>
                        <p class="text-[11px] opacity-80">
                          @if (c.tiempo_min) { ~{{ Math.max(1, Math.round(c.tiempo_min / 1440)) }} día{{ c.tiempo_min > 1440 ? 's' : '' }} hábil{{ c.tiempo_min > 1440 ? 'es' : '' }} }
                          @if (c.solo_entrega_oficina) { · Solo oficina }
                        </p>
                      </div>
                      <div class="text-right shrink-0">
                        <p class="font-black text-sm">\${{ c.flete_cliente | number:'1.0-0' }}</p>
                        <p class="text-[10px] opacity-70">COP</p>
                      </div>
                    </button>
                  }
                </div>
              }
            </div>
          }

          <!-- Resumen deducción wallet -->
          @if (transportadoraElegida()) {
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-sm">
              @if (apTipoPago === 'anticipado' && productoElegido()) {
                <div class="flex justify-between">
                  <span class="text-slate-600">Subtotal producto</span>
                  <span class="font-bold">\${{ precioProducto() * apCantidad | number:'1.0-0' }}</span>
                </div>
              }
              <div class="flex justify-between">
                <span class="text-slate-600">Flete ({{ transportadoraElegida()!.delivery_company_name }})</span>
                <span class="font-bold">\${{ transportadoraElegida()!.flete_cliente | number:'1.0-0' }}</span>
              </div>
              <div class="pt-2 mt-1 border-t border-slate-300 flex justify-between text-base">
                <span class="font-black">Se debitará de tu wallet</span>
                <span class="font-black text-primary">\${{ totalDebitado() | number:'1.0-0' }} COP</span>
              </div>
              <div class="flex justify-between text-xs">
                <span class="text-slate-500">Saldo disponible</span>
                <span class="font-bold" [class.text-red-600]="wallet.saldo() < totalDebitado()">
                  \${{ wallet.saldo() | number:'1.0-0' }}
                </span>
              </div>
            </div>
          }

          @if (errorAprobacion()) {
            <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{{ errorAprobacion() }}</div>
          }

          <div class="flex gap-2 pt-1">
            <button type="button" (click)="cerrarAprobacion()"
                    class="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
              Cancelar
            </button>
            <button type="button" (click)="confirmarAprobacion()" [disabled]="aprobando() || !apFormValido()"
                    class="flex-1 py-2.5 rounded-xl bg-primary text-white font-black hover:bg-primary/90 disabled:opacity-50">
              @if (aprobando()) { Procesando… } @else { Aprobar y generar guía }
            </button>
          </div>
        </div>
      }
    </div>
  </div>
}
  `,
})
export class IntegracionesComponent implements OnInit, OnDestroy {
  readonly Math = Math;

  private readonly supabase   = inject(SupabaseService);
  private readonly mipaquete  = inject(MipaqueteService);
  private readonly pedidosSrv = inject(PedidosService);
  readonly wallet              = inject(WalletService);
  private readonly auth        = inject(AuthService);
  private readonly platformId  = inject(PLATFORM_ID);

  // ── Tab activo ──────────────────────────────────────────────────────────
  readonly tab = signal<'tiendas' | 'ordenes'>('tiendas');

  // ── Integraciones ───────────────────────────────────────────────────────
  readonly integraciones   = signal<Integracion[]>([]);
  readonly cargandoInteg   = signal(true);
  readonly integShopify    = computed(() => this.integraciones().filter(i => i.plataforma === 'shopify'));
  readonly integWoo        = computed(() => this.integraciones().filter(i => i.plataforma === 'woocommerce'));

  // ── Órdenes ─────────────────────────────────────────────────────────────
  readonly ordenes         = signal<PedidoExterno[]>([]);
  readonly cargandoOrdenes = signal(true);
  readonly ordenesPendientes  = computed(() => this.ordenes().filter(o => o.estado === 'pendiente'));
  readonly ordenesHistorial   = computed(() => this.ordenes().filter(o => o.estado !== 'pendiente'));
  readonly pendientesCount    = computed(() => this.ordenesPendientes().length);

  // ── Modal conectar tienda ────────────────────────────────────────────────
  readonly modalConectar      = signal(false);
  readonly plataformaConectar = signal<'shopify' | 'woocommerce'>('shopify');
  readonly integCreada        = signal<Integracion | null>(null);
  readonly guardandoInteg     = signal(false);
  readonly errorConectar      = signal<string | null>(null);
  readonly copiado            = signal(false);
  conectarNombre = '';
  conectarUrl    = '';

  readonly webhookUrl = computed(() => {
    const i = this.integCreada();
    if (!i) return '';
    const fn = i.plataforma === 'shopify' ? 'webhook-shopify' : 'webhook-woocommerce';
    return `${SUPABASE_FUNCTIONS_URL}/${fn}?token=${i.webhook_token}`;
  });

  // ── Modal aprobar orden ──────────────────────────────────────────────────
  readonly ordenActiva           = signal<PedidoExterno | null>(null);
  readonly exitoAprobacion       = signal<{ numero: number } | null>(null);
  readonly guiaAprobacion        = signal<string | null>(null);
  readonly generandoGuiaAprobacion = signal(false);
  readonly aprobando             = signal(false);
  readonly errorAprobacion       = signal<string | null>(null);

  // — Cliente
  apNombre      = '';
  apTelefono    = '';
  apDireccion   = '';
  apTipoPago: TipoPago = 'cod';
  apPrecioVenta: number | null = null;
  apCantidad    = 1;

  // — Ciudad
  ciudadQuery    = '';
  readonly sugerencias        = signal<CiudadMipaquete[]>([]);
  readonly ciudadFocus        = signal(false);
  readonly ciudadSeleccionada = signal<CiudadMipaquete | null>(null);
  private ciudadDebounce: any = null;

  // — Producto
  productoQuery = '';
  readonly productosResultados  = signal<ProductoSimple[]>([]);
  readonly productoElegido      = signal<ProductoSimple | null>(null);
  private productoDebounce: any = null;

  // — Transportadora
  readonly cotizaciones       = signal<CotizacionTransportadora[]>([]);
  readonly cotizando          = signal(false);
  readonly errorCotizacion    = signal<string | null>(null);
  readonly transportadoraElegida = signal<CotizacionTransportadora | null>(null);

  readonly precioProducto = computed(() => {
    const p = this.productoElegido();
    if (!p) return 0;
    return p.precio_final ?? p.precio_sugerido ?? p.precio_base ?? 0;
  });

  readonly totalDebitado = computed(() => {
    const t = this.transportadoraElegida();
    if (!t) return 0;
    return this.apTipoPago === 'cod'
      ? t.flete_cliente
      : t.flete_cliente + this.precioProducto() * (Number(this.apCantidad) || 1);
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async ngOnInit() {
    await Promise.all([this.cargarIntegraciones(), this.cargarOrdenes()]);
    this.wallet.refrescarSaldo().catch(() => {});
  }

  ngOnDestroy() {
    clearTimeout(this.ciudadDebounce);
    clearTimeout(this.productoDebounce);
  }

  // ── Integraciones CRUD ───────────────────────────────────────────────────

  async cargarIntegraciones() {
    this.cargandoInteg.set(true);
    const { data } = await this.supabase.cliente
      .from('integraciones')
      .select('*')
      .order('creado_en', { ascending: false });
    this.integraciones.set((data ?? []) as Integracion[]);
    this.cargandoInteg.set(false);
  }

  abrirConectar(plataforma: 'shopify' | 'woocommerce') {
    this.plataformaConectar.set(plataforma);
    this.conectarNombre = '';
    this.conectarUrl    = '';
    this.integCreada.set(null);
    this.errorConectar.set(null);
    this.copiado.set(false);
    this.modalConectar.set(true);
  }

  cerrarConectar() {
    this.modalConectar.set(false);
    if (this.integCreada()) this.cargarIntegraciones();
    this.integCreada.set(null);
  }

  onConectarBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).dataset['backdrop'] !== undefined) this.cerrarConectar();
  }

  async guardarIntegracion() {
    const nombre = this.conectarNombre.trim();
    const url    = this.conectarUrl.trim();
    if (!nombre || !url) { this.errorConectar.set('Completa todos los campos'); return; }
    this.guardandoInteg.set(true);
    this.errorConectar.set(null);
    try {
      const uid = this.auth.usuario()?.id;
      const { data, error } = await this.supabase.cliente
        .from('integraciones')
        .insert({ vendedor_id: uid, plataforma: this.plataformaConectar(), nombre, url_tienda: url })
        .select('*')
        .single();
      if (error) throw error;
      this.integCreada.set(data as Integracion);
    } catch (e: any) {
      this.errorConectar.set(e?.message ?? 'Error al guardar');
    } finally {
      this.guardandoInteg.set(false);
    }
  }

  async copiarWebhook() {
    if (!isPlatformBrowser(this.platformId)) return;
    await navigator.clipboard.writeText(this.webhookUrl()).catch(() => {});
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }

  verInstrucciones(i: Integracion) {
    this.plataformaConectar.set(i.plataforma);
    this.integCreada.set(i);
    this.modalConectar.set(true);
  }

  async eliminarIntegracion(i: Integracion) {
    if (!confirm(`¿Eliminar la integración "${i.nombre}"? Se perderán las órdenes pendientes.`)) return;
    await this.supabase.cliente.from('integraciones').delete().eq('id', i.id);
    await this.cargarIntegraciones();
    await this.cargarOrdenes();
  }

  // ── Órdenes ─────────────────────────────────────────────────────────────

  async cargarOrdenes() {
    this.cargandoOrdenes.set(true);
    const { data } = await this.supabase.cliente
      .from('pedidos_externos')
      .select('*, integracion:integraciones(nombre)')
      .order('recibido_en', { ascending: false })
      .limit(100);
    this.ordenes.set((data ?? []) as PedidoExterno[]);
    this.cargandoOrdenes.set(false);
  }

  async rechazar(o: PedidoExterno) {
    if (!confirm(`¿Rechazar la orden ${o.order_number || o.order_id_externo}?`)) return;
    const { error } = await this.supabase.cliente.rpc('marcar_pedido_externo', {
      p_externo_id: o.id,
      p_estado:     'rechazado',
    });
    if (!error) await this.cargarOrdenes();
  }

  // ── Modal de aprobación ──────────────────────────────────────────────────

  abrirAprobacion(o: PedidoExterno) {
    this.ordenActiva.set(o);
    this.exitoAprobacion.set(null);
    this.guiaAprobacion.set(null);
    this.errorAprobacion.set(null);

    // Pre-llenar datos del cliente
    this.apNombre     = o.cliente_nombre    ?? '';
    this.apTelefono   = o.cliente_telefono  ?? '';
    this.apDireccion  = o.cliente_direccion ?? '';
    this.apPrecioVenta = o.total_externo;
    this.apCantidad   = o.items_json?.[0]?.cantidad ?? 1;
    this.apTipoPago   = 'cod';

    // Ciudad (pre-llenar query para facilitar búsqueda)
    this.ciudadQuery       = o.cliente_ciudad ?? '';
    this.ciudadSeleccionada.set(null);
    this.sugerencias.set([]);
    if (this.ciudadQuery.length >= 2) {
      setTimeout(() => this.buscarSugerencias(), 50);
    }

    // Producto
    this.productoQuery = '';
    this.productoElegido.set(null);
    this.productosResultados.set([]);

    // Transportadora
    this.cotizaciones.set([]);
    this.transportadoraElegida.set(null);
    this.errorCotizacion.set(null);
    this.cotizando.set(false);
  }

  cerrarAprobacion() {
    if (this.exitoAprobacion()) this.cargarOrdenes();
    this.ordenActiva.set(null);
  }

  onAprobacionBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).dataset['backdropAprobacion'] !== undefined) this.cerrarAprobacion();
  }

  apFormValido(): boolean {
    return !!this.apNombre.trim()
      && !!this.apTelefono.trim()
      && !!this.apDireccion.trim()
      && !!this.ciudadSeleccionada()
      && !!this.productoElegido()
      && !!this.transportadoraElegida()
      && (Number(this.apCantidad) || 0) >= 1;
  }

  // Ciudad
  onCiudadInput() {
    this.ciudadSeleccionada.set(null);
    this.transportadoraElegida.set(null);
    this.cotizaciones.set([]);
    clearTimeout(this.ciudadDebounce);
    this.ciudadDebounce = setTimeout(() => this.buscarSugerencias(), 280);
  }

  onCiudadBlur() { setTimeout(() => this.ciudadFocus.set(false), 180); }

  async buscarSugerencias() {
    const q = this.ciudadQuery.trim();
    if (q.length < 2) { this.sugerencias.set([]); return; }
    try { this.sugerencias.set(await this.mipaquete.buscarCiudades(q, 8)); }
    catch { this.sugerencias.set([]); }
  }

  async seleccionarCiudad(c: CiudadMipaquete) {
    this.ciudadSeleccionada.set(c);
    this.ciudadQuery = c.label;
    this.sugerencias.set([]);
    this.ciudadFocus.set(false);
    if (this.productoElegido()) await this.cotizar();
  }

  limpiarCiudad() {
    this.ciudadSeleccionada.set(null);
    this.ciudadQuery = '';
    this.transportadoraElegida.set(null);
    this.cotizaciones.set([]);
  }

  // Producto
  buscarProductos() {
    clearTimeout(this.productoDebounce);
    this.productoDebounce = setTimeout(async () => {
      const q = this.productoQuery.trim();
      if (q.length < 2) { this.productosResultados.set([]); return; }
      const { data } = await this.supabase.cliente
        .from('productos')
        .select('id, nombre, precio_base, precio_final, precio_sugerido, peso_kg, imagenes')
        .eq('disponible', true)
        .ilike('nombre', `%${q}%`)
        .limit(8);
      this.productosResultados.set((data ?? []) as ProductoSimple[]);
    }, 280);
  }

  async elegirProducto(p: ProductoSimple) {
    this.productoElegido.set(p);
    this.productoQuery = p.nombre;
    this.productosResultados.set([]);
    this.transportadoraElegida.set(null);
    this.cotizaciones.set([]);
    if (this.ciudadSeleccionada()) await this.cotizar();
  }

  limpiarProducto() {
    this.productoElegido.set(null);
    this.productoQuery = '';
    this.transportadoraElegida.set(null);
    this.cotizaciones.set([]);
  }

  // Cotizar
  async cotizar() {
    const ciudad   = this.ciudadSeleccionada();
    const producto = this.productoElegido();
    if (!ciudad || !producto || this.cotizando()) return;
    this.cotizando.set(true);
    this.errorCotizacion.set(null);
    this.transportadoraElegida.set(null);
    try {
      const r = await this.mipaquete.cotizar({
        producto_id:       producto.id,
        destino_dane_code: ciudad.dane_code,
        cantidad:          Number(this.apCantidad) || 1,
      });
      this.cotizaciones.set(r.cotizaciones);
      if (r.cotizaciones.length === 1) this.transportadoraElegida.set(r.cotizaciones[0]);
    } catch (err: any) {
      this.errorCotizacion.set(err?.message ?? 'No se pudo cotizar');
    } finally {
      this.cotizando.set(false);
    }
  }

  // Confirmar aprobación
  async confirmarAprobacion() {
    if (!this.apFormValido() || this.aprobando()) return;
    const orden   = this.ordenActiva()!;
    const ciudad  = this.ciudadSeleccionada()!;
    const transp  = this.transportadoraElegida()!;
    const producto = this.productoElegido()!;

    this.aprobando.set(true);
    this.errorAprobacion.set(null);
    try {
      // 1. Crear el pedido en Landazury
      const resultado = await this.pedidosSrv.crearPedido({
        producto_id:            producto.id,
        cantidad:               Number(this.apCantidad) || 1,
        tipo_pago:              this.apTipoPago,
        cliente_nombre:         this.apNombre.trim(),
        cliente_telefono:       this.apTelefono.trim(),
        cliente_direccion:      this.apDireccion.trim(),
        cliente_ciudad:         ciudad.ciudad,
        cliente_departamento:   ciudad.departamento,
        precio_venta_cliente:   this.apPrecioVenta ?? undefined,
        destino_dane_code:      ciudad.dane_code,
        delivery_company_id:    transp.delivery_company_id,
        delivery_company_name:  transp.delivery_company_name,
        mipaquete_quote_id:     transp.quote_id,
        flete_mipaquete:        transp.flete_mipaquete,
      });

      // 2. Marcar la orden externa como aprobada
      await this.supabase.cliente.rpc('marcar_pedido_externo', {
        p_externo_id: orden.id,
        p_estado:     'aprobado',
        p_pedido_id:  resultado.pedido_id,
      });

      await this.wallet.refrescarSaldo();
      this.exitoAprobacion.set({ numero: resultado.numero });

      // 3. Generar guía (fire-and-forget)
      this.generandoGuiaAprobacion.set(true);
      this.mipaquete.generarGuia(resultado.pedido_id, { request_pickup: false })
        .then(r => this.guiaAprobacion.set(r.guia ?? r.sending_id ?? null))
        .catch(e => console.warn('Auto-guía fallida:', e?.message))
        .finally(() => this.generandoGuiaAprobacion.set(false));

    } catch (e: any) {
      this.errorAprobacion.set(e?.message ?? 'Error al procesar la orden');
    } finally {
      this.aprobando.set(false);
    }
  }
}
