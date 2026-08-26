import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type {
  ComisionReferido,
  ReferidoListado,
  StatsReferidos,
} from '../models/referidos.model';

const STORAGE_KEY = 'lz_ref_pendiente';

@Injectable({ providedIn: 'root' })
export class ReferidosService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly aplicandoReferidor = signal(false);

  /** Lee ?ref=xxxx de la URL y lo guarda en localStorage. Llamar en App init. */
  capturarCodigoDesdeUrl() {
    if (!isPlatformBrowser(this.platformId)) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('ref');
    if (code && code.trim().length > 0) {
      localStorage.setItem(STORAGE_KEY, code.trim());
    }
  }

  /** Si el usuario logueado no tiene referidor y hay un código en localStorage, lo aplica. */
  async aplicarReferidorPendienteSiCorresponde() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.aplicandoReferidor()) return;

    const code = localStorage.getItem(STORAGE_KEY);
    if (!code) return;

    const perfil = this.auth.perfil();
    if (!perfil) return;
    if (perfil.referido_por) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    if (perfil.referral_code && perfil.referral_code.toLowerCase() === code.toLowerCase()) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    this.aplicandoReferidor.set(true);
    try {
      const { data, error } = await this.supabase.cliente.rpc('set_referrer', { p_codigo: code });
      if (error) throw error;
      const status = (data as any)?.status;
      if (status === 'ok' || status === 'ya_tiene_referidor') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Si el código es inválido, lo descartamos para no reintentar siempre.
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      this.aplicandoReferidor.set(false);
    }
  }

  /** Devuelve el link público de referido del usuario actual. */
  linkReferido(code: string): string {
    if (isPlatformBrowser(this.platformId)) {
      return `${window.location.origin}/?ref=${code}`;
    }
    return `https://landazury.vercel.app/?ref=${code}`;
  }

  async obtenerStats(): Promise<StatsReferidos> {
    const { data, error } = await this.supabase.cliente.rpc('stats_referidos');
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      total_referidos: Number(r['total_referidos'] ?? 0),
      total_ganado: Number(r['total_ganado'] ?? 0),
      pedidos_pendientes: Number(r['pedidos_pendientes'] ?? 0),
    };
  }

  async listarMisReferidos(): Promise<ReferidoListado[]> {
    const { data, error } = await this.supabase.cliente
      .from('mis_referidos')
      .select('*')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      nombre: r.nombre,
      email: r.email,
      pais: r.pais,
      creado_en: r.creado_en,
      pedidos_entregados: Number(r.pedidos_entregados ?? 0),
      pedidos_pendientes: Number(r.pedidos_pendientes ?? 0),
      comisiones_generadas: Number(r.comisiones_generadas ?? 0),
    }));
  }

  async listarMisComisiones(limit = 50): Promise<ComisionReferido[]> {
    const usuario = this.auth.usuario();
    if (!usuario) return [];
    const { data, error } = await this.supabase.cliente
      .from('comisiones_referidos')
      .select('*')
      .eq('referidor_id', usuario.id)
      .order('creado_en', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((c: any) => ({
      ...c,
      monto: Number(c.monto),
      porcentaje_aplicado: Number(c.porcentaje_aplicado),
      base_calculo: Number(c.base_calculo),
    })) as ComisionReferido[];
  }

  async setReferrerManual(codigo: string): Promise<{ status: string; referidor_id?: string }> {
    const { data, error } = await this.supabase.cliente.rpc('set_referrer', { p_codigo: codigo });
    if (error) throw error;
    return data as { status: string; referidor_id?: string };
  }
}
