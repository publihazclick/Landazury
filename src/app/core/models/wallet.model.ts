export type TipoMovimiento =
  | 'recarga'
  | 'debito_flete'
  | 'debito_anticipado'
  | 'reembolso'
  | 'ajuste_admin'
  | 'comision_referido';

export interface MovimientoWallet {
  id: string;
  perfil_id: string;
  tipo: TipoMovimiento;
  monto: number;
  saldo_despues: number;
  referencia?: string;
  descripcion?: string;
  creado_por?: string;
  creado_en: string;
}

export interface ConfigPlataforma {
  flete_plano: number;
  recarga_minima: number;
  moneda: string;
  referral_commission_mode?: 'pct' | 'flat';
  referral_commission_pct?: number;
  referral_commission_flat?: number;
  referral_commission_base?: 'subtotal' | 'flete_total' | 'flete_ganancia' | 'total_debitado';
}

export interface CheckoutEpaycoData {
  referencia: string;
  monto_neto: number;    // lo que se acreditará en el wallet
  monto_cobrar: number;  // lo que paga el usuario (neto + comisión)
  fee_total: number;     // comisión pasarela trasladada al usuario
  checkout: Record<string, string>;
}
