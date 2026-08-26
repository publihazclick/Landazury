export interface CotizacionTransportadora {
  quote_id:              string;
  delivery_company_id:   string;
  delivery_company_name: string;
  logo_url:              string | null;
  flete_mipaquete:       number;
  flete_cliente:         number;  // flete_mipaquete + ganancia + comision_recaudo
  comision_recaudo:      number;  // 0 si anticipado, ~5.5% del precio cliente si COD
  tiempo_min:            number | null;
  score:                 number | null;
  solo_entrega_oficina:  boolean;
  pickup_service:        boolean;
}

export interface CotizacionResponse {
  producto: {
    id: string;
    nombre: string;
    precio: number;
    peso_kg: number;
    alto_cm: number;
    ancho_cm: number;
    largo_cm: number;
  };
  origen_dane_code:     string;
  destino_dane_code:    string;
  cantidad:             number;
  declared_value:       number;
  ganancia_plataforma:  number;
  cotizaciones:         CotizacionTransportadora[];
}

export interface CiudadMipaquete {
  dane_code:    string;
  ciudad:       string;
  departamento: string;
  label:        string;
}
