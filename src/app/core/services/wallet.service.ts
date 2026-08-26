import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { MovimientoWallet, ConfigPlataforma, CheckoutEpaycoData } from '../models/wallet.model';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  readonly saldo = signal<number>(0);
  readonly cargandoSaldo = signal<boolean>(false);

  async refrescarSaldo(): Promise<number> {
    const usuario = this.auth.usuario();
    if (!usuario) { this.saldo.set(0); return 0; }
    this.cargandoSaldo.set(true);
    try {
      const { data, error } = await this.supabase.cliente
        .from('perfiles')
        .select('saldo')
        .eq('id', usuario.id)
        .single();
      if (error) throw error;
      const s = Number(data?.saldo ?? 0);
      this.saldo.set(s);
      return s;
    } finally {
      this.cargandoSaldo.set(false);
    }
  }

  async obtenerMovimientos(limit = 50): Promise<MovimientoWallet[]> {
    const usuario = this.auth.usuario();
    if (!usuario) return [];
    const { data, error } = await this.supabase.cliente
      .from('movimientos_wallet')
      .select('*')
      .eq('perfil_id', usuario.id)
      .order('creado_en', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(m => ({
      ...m,
      monto: Number(m.monto),
      saldo_despues: Number(m.saldo_despues),
    })) as MovimientoWallet[];
  }

  async obtenerConfig(): Promise<ConfigPlataforma> {
    const { data, error } = await this.supabase.cliente
      .from('config_plataforma')
      .select('clave, valor');
    if (error) throw error;
    const cfg: ConfigPlataforma = { flete_plano: 15000, recarga_minima: 30000, moneda: 'COP' };
    for (const row of data ?? []) {
      const k = row.clave as keyof ConfigPlataforma;
      const v = row.valor;
      if (k === 'moneda' || k === 'referral_commission_mode' || k === 'referral_commission_base') {
        (cfg as any)[k] = String(v ?? '').replace(/^"|"$/g, '');
      } else {
        (cfg as any)[k] = Number(v);
      }
    }
    return cfg;
  }

  async crearCheckoutRecarga(monto: number): Promise<CheckoutEpaycoData> {
    const { data, error } = await this.supabase.cliente.functions.invoke('crear-pago-epayco', {
      body: { monto },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as CheckoutEpaycoData;
  }

  async ajusteManualAdmin(perfilId: string, monto: number, descripcion: string) {
    const { data, error } = await this.supabase.cliente.rpc('ajuste_manual_wallet', {
      p_perfil_id: perfilId,
      p_monto: monto,
      p_descripcion: descripcion,
    });
    if (error) throw error;
    return data;
  }
}
