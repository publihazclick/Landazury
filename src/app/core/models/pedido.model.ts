export type TipoPago = 'cod' | 'anticipado';

export type EstadoPedido =
  | 'pendiente'
  | 'guia_generada'
  | 'confirmado'
  | 'despachado'
  | 'en_ruta'
  | 'entregado'
  | 'devuelto'
  | 'cancelado';

export interface Pedido {
  id: string;
  numero: number;
  vendedor_id: string;
  producto_id: string;
  cantidad: number;
  atributos_seleccionados?: Record<string, string>;
  tipo_pago: TipoPago;

  cliente_nombre: string;
  cliente_cedula?: string;
  cliente_telefono: string;
  cliente_direccion: string;
  cliente_ciudad: string;
  cliente_departamento: string;
  cliente_observaciones?: string;

  precio_unitario: number;
  subtotal: number;
  flete: number;
  precio_venta_cliente?: number;
  total_debitado: number;

  estado: EstadoPedido;
  transportadora?: string;
  guia?: string;
  notas_admin?: string;
  creado_en: string;
  actualizado_en: string;

  destino_dane_code?: string;
  origen_dane_code?: string;
  delivery_company_id?: string;
  delivery_company_name?: string;
  mipaquete_quote_id?: string;
  mipaquete_sending_id?: string;
  flete_mipaquete?: number;
  flete_ganancia?: number;

  // Seguro antidevoluciones
  seguro_antidevoluciones?: boolean;
  costo_seguro?: number;

  // Tracking automático
  tracking_eventos?: TrackingEvento[];
  tracking_actualizado_en?: string;
  tracking_ultimo_estado?: string;

  producto?: { id: string; nombre: string; imagenes?: string[] };
  vendedor?: { id: string; nombre: string; email?: string; telefono?: string };
}

export interface TrackingEvento {
  state?:       string;
  estado?:      string;
  status?:      string;
  description?: string;
  descripcion?: string;
  date?:        string;
  fecha?:       string;
  time?:        string;
  hora?:        string;
  city?:        string;
  ciudad?:      string;
  office?:      string;
  oficina?:     string;
  [key: string]: unknown;
}

export interface NuevoPedidoDto {
  producto_id: string;
  cantidad: number;
  atributos?: Record<string, string>;
  tipo_pago: TipoPago;
  cliente_nombre: string;
  cliente_cedula?: string;
  cliente_telefono: string;
  cliente_direccion: string;
  cliente_ciudad: string;
  cliente_departamento: string;
  cliente_observaciones?: string;
  precio_venta_cliente?: number;
  // Datos de la transportadora elegida (desde Mipaquete)
  destino_dane_code: string;
  delivery_company_id: string;
  delivery_company_name: string;
  mipaquete_quote_id: string;
  flete_mipaquete: number;
  seguro_antidevoluciones?: boolean;
}

export interface ResultadoPedido {
  pedido_id: string;
  numero: number;
  total_debitado: number;
  saldo_nuevo: number;
  flete: number;
  subtotal: number;
  costo_seguro?: number;
}
