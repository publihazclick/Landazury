export interface ComisionReferido {
  id: string;
  referidor_id: string;
  referido_id: string;
  pedido_id: string;
  monto: number;
  porcentaje_aplicado: number;
  base_calculo: number;
  base_tipo: string;
  creado_en: string;
}

export interface ReferidoListado {
  id: string;
  nombre: string;
  email?: string;
  pais?: string;
  creado_en: string;
  pedidos_entregados: number;
  pedidos_pendientes: number;
  comisiones_generadas: number;
}

export interface StatsReferidos {
  total_referidos: number;
  total_ganado: number;
  pedidos_pendientes: number;
}
