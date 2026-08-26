import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { Pedido, NuevoPedidoDto, ResultadoPedido, EstadoPedido } from '../models/pedido.model';

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly SELECT_PEDIDO =
    '*, producto:productos(id, nombre, imagenes), vendedor:perfiles!pedidos_vendedor_id_fkey(id, nombre, email, telefono)';

  private normalizar(rows: any[]): Pedido[] {
    return (rows ?? []).map(p => ({
      ...p,
      cantidad: Number(p.cantidad),
      precio_unitario: Number(p.precio_unitario),
      subtotal: Number(p.subtotal),
      flete: Number(p.flete),
      precio_venta_cliente: p.precio_venta_cliente != null ? Number(p.precio_venta_cliente) : undefined,
      total_debitado: Number(p.total_debitado),
    })) as Pedido[];
  }

  async crearPedido(dto: NuevoPedidoDto): Promise<ResultadoPedido> {
    const { data, error } = await this.supabase.cliente.rpc('crear_pedido', {
      p_producto_id: dto.producto_id,
      p_cantidad: dto.cantidad,
      p_atributos: dto.atributos ?? null,
      p_tipo_pago: dto.tipo_pago,
      p_cliente_nombre: dto.cliente_nombre,
      p_cliente_cedula: dto.cliente_cedula ?? null,
      p_cliente_telefono: dto.cliente_telefono,
      p_cliente_direccion: dto.cliente_direccion,
      p_cliente_ciudad: dto.cliente_ciudad,
      p_cliente_departamento: dto.cliente_departamento,
      p_cliente_observaciones: dto.cliente_observaciones ?? null,
      p_destino_dane_code: dto.destino_dane_code,
      p_delivery_company_id: dto.delivery_company_id,
      p_delivery_company_name: dto.delivery_company_name,
      p_mipaquete_quote_id: dto.mipaquete_quote_id,
      p_flete_mipaquete: dto.flete_mipaquete,
      p_precio_venta_cliente: dto.precio_venta_cliente ?? null,
      p_seguro_antidevoluciones: dto.seguro_antidevoluciones ?? false,
    });
    if (error) throw error;
    const result = data as ResultadoPedido;
    if (result?.pedido_id) this.dispararNotificaciones(result.pedido_id);
    return result;
  }

  async misPedidos(filtros?: { estado?: EstadoPedido }): Promise<Pedido[]> {
    const usuario = this.auth.usuario();
    if (!usuario) return [];
    let q = this.supabase.cliente
      .from('pedidos')
      .select(this.SELECT_PEDIDO)
      .eq('vendedor_id', usuario.id)
      .order('creado_en', { ascending: false });
    if (filtros?.estado) q = q.eq('estado', filtros.estado);
    const { data, error } = await q;
    if (error) throw error;
    return this.normalizar(data);
  }

  async todosPedidos(filtros?: { estado?: EstadoPedido; busqueda?: string }): Promise<Pedido[]> {
    let q = this.supabase.cliente
      .from('pedidos')
      .select(this.SELECT_PEDIDO)
      .order('creado_en', { ascending: false });
    if (filtros?.estado) q = q.eq('estado', filtros.estado);
    if (filtros?.busqueda) q = q.ilike('cliente_nombre', `%${filtros.busqueda}%`);
    const { data, error } = await q;
    if (error) throw error;
    return this.normalizar(data);
  }

  async obtenerPedido(id: string): Promise<Pedido | null> {
    const { data, error } = await this.supabase.cliente
      .from('pedidos')
      .select(this.SELECT_PEDIDO)
      .eq('id', id)
      .single();
    if (error) return null;
    return this.normalizar([data])[0] ?? null;
  }

  async actualizarEstado(id: string, cambios: {
    estado?: EstadoPedido;
    transportadora?: string;
    guia?: string;
    notas_admin?: string;
  }) {
    const { error } = await this.supabase.cliente
      .from('pedidos')
      .update(cambios)
      .eq('id', id);
    if (error) throw error;
    if (cambios.estado) this.dispararNotificaciones(id);
  }

  async reembolsar(pedidoId: string, motivo: string) {
    const { data, error } = await this.supabase.cliente.rpc('reembolsar_pedido', {
      p_pedido_id: pedidoId,
      p_motivo: motivo,
    });
    if (error) throw error;
    this.dispararNotificaciones(pedidoId);
    return data;
  }

  /**
   * Dispara la edge function que envía las notificaciones pendientes de un pedido
   * (vía Evolution API). Fire-and-forget: no bloquea la UI ni rompe el flujo
   * principal si el envío falla — el admin puede reenviar manualmente desde
   * el panel.
   */
  dispararNotificaciones(pedidoId: string): void {
    this.supabase.cliente.functions
      .invoke('notificar-pedido-evento', { body: { pedido_id: pedidoId } })
      .catch(() => {});
  }

  async listarNotificaciones(pedidoId: string): Promise<NotificacionPedido[]> {
    const { data, error } = await this.supabase.cliente
      .from('notificaciones_pedidos')
      .select('*')
      .eq('pedido_id', pedidoId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []) as NotificacionPedido[];
  }

  async reenviarNotificacion(notifId: string): Promise<void> {
    const { error } = await this.supabase.cliente.rpc('reenviar_notificacion', {
      p_notif_id: notifId,
    });
    if (error) throw error;
    await this.supabase.cliente.functions
      .invoke('notificar-pedido-evento', { body: { notif_id: notifId } });
  }
}

export interface NotificacionPedido {
  id: string;
  pedido_id: string;
  evento: string;
  destinatario_tipo: 'vendedor' | 'cliente';
  destinatario_nombre: string | null;
  destinatario_telefono: string;
  mensaje: string;
  estado: 'pendiente' | 'enviado' | 'fallido' | 'desactivado';
  intentos: number;
  ultimo_error: string | null;
  evolution_response: any;
  creado_en: string;
  enviado_en: string | null;
}
