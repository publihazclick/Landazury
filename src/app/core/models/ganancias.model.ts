export interface BilleteraGanancias {
  id: string;
  vendedor_id: string;
  saldo: number;
  creado_en: string;
  actualizado_en: string;
}

export type TipoMovimientoGanancia = 'acreditacion' | 'retiro' | 'ajuste';

export interface MovimientoGanancia {
  id: string;
  vendedor_id: string;
  pedido_id?: string;
  tipo: TipoMovimientoGanancia;
  monto: number;
  descripcion?: string;
  creado_en: string;
}

export type TipoMetodoPago = 'nequi' | 'daviplata' | 'bancolombia' | 'otro_banco';

export interface MetodoPagoVendedor {
  id: string;
  vendedor_id: string;
  tipo: TipoMetodoPago;
  titular: string;
  numero: string;
  banco?: string;
  tipo_cuenta?: string;
  activo: boolean;
  creado_en: string;
}

export type EstadoRetiro = 'pendiente' | 'procesado' | 'rechazado';

export interface RetiroGanancia {
  id: string;
  vendedor_id: string;
  monto: number;
  metodo_pago_id: string;
  estado: EstadoRetiro;
  notas_admin?: string;
  creado_en: string;
  procesado_en?: string;
  // Joins para admin
  vendedor_nombre?: string;
  vendedor_email?: string;
  vendedor_telefono?: string;
  metodo_tipo?: TipoMetodoPago;
  titular?: string;
  numero?: string;
  banco?: string;
  tipo_cuenta?: string;
}
