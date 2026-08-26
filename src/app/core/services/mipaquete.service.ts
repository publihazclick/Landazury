import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { CotizacionResponse, CiudadMipaquete } from '../models/mipaquete.model';

@Injectable({ providedIn: 'root' })
export class MipaqueteService {
  private readonly supabase = inject(SupabaseService);

  async buscarCiudades(query: string, limit = 15): Promise<CiudadMipaquete[]> {
    const q = (query ?? '').trim();
    if (q.length < 2) return [];
    const { data, error } = await this.supabase.cliente.functions.invoke(
      'buscar-ciudad-mipaquete',
      { body: { q, limit } },
    );
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return ((data as any)?.resultados ?? []) as CiudadMipaquete[];
  }

  async cotizar(params: {
    producto_id: string;
    destino_dane_code: string;
    cantidad?: number;
    declared_value?: number;
    precio_venta_cliente?: number;
  }): Promise<CotizacionResponse> {
    const { data, error } = await this.supabase.cliente.functions.invoke(
      'cotizar-flete-mipaquete',
      { body: params },
    );
    // Cuando la edge function retorna 4xx/5xx, supabase-js mete el detalle
    // en error.context.body — lo extraemos para que el usuario vea el motivo
    // real (rechazo Mipaquete, peso fuera de rango, etc.) en vez de un genérico.
    if (error) {
      const ctx = (error as any).context;
      try {
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error) throw new Error(body.error);
        } else if (ctx?.body && typeof ctx.body === 'string') {
          const parsed = JSON.parse(ctx.body);
          if (parsed?.error) throw new Error(parsed.error);
        }
      } catch (e: any) {
        if (e?.message) throw e;
      }
      throw error;
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as CotizacionResponse;
  }

  async generarGuia(pedidoId: string, opts?: { request_pickup?: boolean; comments?: string }) {
    const { data, error } = await this.supabase.cliente.functions.invoke(
      'generar-guia-mipaquete',
      { body: { pedido_id: pedidoId, ...opts } },
    );
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as { status: string; sending_id: string; guia: string; transportadora: string };
  }

  async tracking(pedidoId: string): Promise<{ tracking: any[]; guia?: string; transportadora?: string; raw?: any }> {
    const { data, error } = await this.supabase.cliente.functions.invoke(
      'tracking-mipaquete',
      { body: { pedido_id: pedidoId } },
    );
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as { tracking: any[]; guia?: string; transportadora?: string; raw?: any };
  }
}
