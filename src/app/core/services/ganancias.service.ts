import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  BilleteraGanancias, MovimientoGanancia, MetodoPagoVendedor,
  RetiroGanancia, TipoMetodoPago,
} from '../models/ganancias.model';

@Injectable({ providedIn: 'root' })
export class GananciasService {
  private readonly supabase = inject(SupabaseService);

  async obtenerBilletera(): Promise<BilleteraGanancias | null> {
    const { data, error } = await this.supabase.cliente
      .from('billetera_ganancias')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...data, saldo: Number(data.saldo) };
  }

  async obtenerMovimientos(limite = 50): Promise<MovimientoGanancia[]> {
    const { data, error } = await this.supabase.cliente
      .from('movimientos_ganancias')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []).map(m => ({ ...m, monto: Number(m.monto) }));
  }

  async obtenerMetodosPago(): Promise<MetodoPagoVendedor[]> {
    const { data, error } = await this.supabase.cliente
      .from('metodos_pago_vendedor')
      .select('*')
      .eq('activo', true)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []) as MetodoPagoVendedor[];
  }

  async guardarMetodoPago(metodo: {
    tipo: TipoMetodoPago;
    titular: string;
    numero: string;
    banco?: string;
    tipo_cuenta?: string;
  }): Promise<MetodoPagoVendedor> {
    const { data, error } = await this.supabase.cliente
      .from('metodos_pago_vendedor')
      .insert(metodo)
      .select()
      .single();
    if (error) throw error;
    return data as MetodoPagoVendedor;
  }

  async eliminarMetodoPago(id: string): Promise<void> {
    const { error } = await this.supabase.cliente
      .from('metodos_pago_vendedor')
      .update({ activo: false })
      .eq('id', id);
    if (error) throw error;
  }

  async solicitarRetiro(monto: number, metodoPagoId: string): Promise<void> {
    const { data, error } = await this.supabase.cliente
      .rpc('solicitar_retiro_ganancias', {
        p_monto: monto,
        p_metodo_pago_id: metodoPagoId,
      });
    if (error) throw error;
    const res = data as { ok: boolean; error?: string };
    if (!res?.ok) throw new Error(res?.error ?? 'Error al solicitar retiro');
  }

  async obtenerMisRetiros(): Promise<RetiroGanancia[]> {
    const { data, error } = await this.supabase.cliente
      .from('retiros_ganancias')
      .select('*, metodo:metodos_pago_vendedor(tipo, titular, numero, banco, tipo_cuenta)')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      ...r,
      monto: Number(r.monto),
      metodo_tipo: r.metodo?.tipo,
      titular: r.metodo?.titular,
      numero: r.metodo?.numero,
      banco: r.metodo?.banco,
      tipo_cuenta: r.metodo?.tipo_cuenta,
    })) as RetiroGanancia[];
  }

  // ── Admin ─────────────────────────────────────────────────────────

  async obtenerTodosRetiros(): Promise<RetiroGanancia[]> {
    const { data, error } = await this.supabase.cliente
      .from('vista_retiros_admin')
      .select('*')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({ ...r, monto: Number(r.monto) })) as RetiroGanancia[];
  }

  async procesarRetiro(retiroId: string, notas?: string): Promise<void> {
    const { data, error } = await this.supabase.cliente
      .rpc('procesar_retiro_ganancia', { p_retiro_id: retiroId, p_notas: notas ?? null });
    if (error) throw error;
    const res = data as { ok: boolean; error?: string };
    if (!res?.ok) throw new Error(res?.error ?? 'Error al procesar retiro');
  }

  async rechazarRetiro(retiroId: string, notas?: string): Promise<void> {
    const { data, error } = await this.supabase.cliente
      .rpc('rechazar_retiro_ganancia', { p_retiro_id: retiroId, p_notas: notas ?? null });
    if (error) throw error;
    const res = data as { ok: boolean; error?: string };
    if (!res?.ok) throw new Error(res?.error ?? 'Error al rechazar retiro');
  }
}
