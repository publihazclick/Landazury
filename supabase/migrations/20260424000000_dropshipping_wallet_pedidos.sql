-- ============================================================
-- LANDAZURY — Dropshipping: wallet, pedidos, movimientos
-- ============================================================
-- Este módulo añade:
--   * Saldo en cada perfil (wallet del vendedor)
--   * Tabla config_plataforma (flete plano, recarga mínima)
--   * Tabla movimientos_wallet (historial de recargas/débitos)
--   * Tabla pedidos (órdenes dropshipping con datos del cliente final)
--   * RPC crear_pedido (valida saldo y descuenta atómicamente)
--   * RPC acreditar_wallet (usada por el webhook de ePayco)
--   * RPC reembolsar_pedido (admin cancela → devuelve al wallet)
-- ============================================================

-- ============================================================
-- 1. Configuración de la plataforma (key/value)
-- ============================================================

CREATE TABLE IF NOT EXISTS config_plataforma (
  clave            TEXT PRIMARY KEY,
  valor            JSONB NOT NULL,
  actualizado_en   TIMESTAMPTZ DEFAULT NOW(),
  actualizado_por  UUID REFERENCES auth.users(id)
);

INSERT INTO config_plataforma (clave, valor) VALUES
  ('flete_plano',     '15000'::jsonb),
  ('recarga_minima',  '30000'::jsonb),
  ('moneda',          '"COP"'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- ============================================================
-- 2. Wallet en perfiles
-- ============================================================

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS saldo DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ============================================================
-- 3. Movimientos de wallet (ledger)
-- ============================================================

CREATE TABLE IF NOT EXISTS movimientos_wallet (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  perfil_id       UUID REFERENCES perfiles(id) ON DELETE CASCADE NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN (
                    'recarga',
                    'debito_flete',
                    'debito_anticipado',
                    'reembolso',
                    'ajuste_admin'
                  )),
  monto           DECIMAL(12,2) NOT NULL,
  saldo_despues   DECIMAL(12,2) NOT NULL,
  referencia      TEXT,
  descripcion     TEXT,
  creado_por      UUID REFERENCES auth.users(id),
  creado_en       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mov_wallet_perfil
  ON movimientos_wallet(perfil_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_mov_wallet_ref_recarga
  ON movimientos_wallet(referencia)
  WHERE tipo = 'recarga';

-- ============================================================
-- 4. Pedidos
-- ============================================================

CREATE TABLE IF NOT EXISTS pedidos (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero                    BIGSERIAL UNIQUE,
  vendedor_id               UUID REFERENCES perfiles(id) ON DELETE RESTRICT NOT NULL,
  producto_id               UUID REFERENCES productos(id) ON DELETE RESTRICT NOT NULL,
  cantidad                  INT NOT NULL CHECK (cantidad > 0),
  atributos_seleccionados   JSONB,
  tipo_pago                 TEXT NOT NULL CHECK (tipo_pago IN ('cod', 'anticipado')),

  cliente_nombre            TEXT NOT NULL,
  cliente_cedula            TEXT,
  cliente_telefono          TEXT NOT NULL,
  cliente_direccion         TEXT NOT NULL,
  cliente_ciudad            TEXT NOT NULL,
  cliente_departamento      TEXT NOT NULL,
  cliente_observaciones     TEXT,

  precio_unitario           DECIMAL(10,2) NOT NULL,
  subtotal                  DECIMAL(12,2) NOT NULL,
  flete                     DECIMAL(10,2) NOT NULL,
  precio_venta_cliente      DECIMAL(12,2),
  total_debitado            DECIMAL(12,2) NOT NULL,

  estado                    TEXT NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN (
                              'pendiente','confirmado','despachado',
                              'en_ruta','entregado','devuelto','cancelado'
                            )),
  transportadora            TEXT,
  guia                      TEXT,
  notas_admin               TEXT,
  creado_en                 TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor
  ON pedidos(vendedor_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado
  ON pedidos(estado, creado_en DESC);

CREATE OR REPLACE FUNCTION public.actualizar_timestamp_pedido()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actualizar_pedido ON pedidos;
CREATE TRIGGER trg_actualizar_pedido
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_pedido();

-- ============================================================
-- 5. Row Level Security
-- ============================================================

ALTER TABLE config_plataforma   ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_wallet  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos             ENABLE ROW LEVEL SECURITY;

-- Config
CREATE POLICY "config_lectura_autenticados" ON config_plataforma
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "config_admin_escritura" ON config_plataforma
  FOR ALL USING (public.obtener_rol() = 'admin')
  WITH CHECK (public.obtener_rol() = 'admin');

-- Movimientos
CREATE POLICY "mov_wallet_propios_lectura" ON movimientos_wallet
  FOR SELECT USING (auth.uid() = perfil_id);

CREATE POLICY "mov_wallet_admin_lectura" ON movimientos_wallet
  FOR SELECT USING (public.obtener_rol() = 'admin');

CREATE POLICY "mov_wallet_admin_insert_manual" ON movimientos_wallet
  FOR INSERT WITH CHECK (public.obtener_rol() = 'admin');

-- Pedidos
CREATE POLICY "pedidos_propios_lectura" ON pedidos
  FOR SELECT USING (auth.uid() = vendedor_id);

CREATE POLICY "pedidos_admin_lectura" ON pedidos
  FOR SELECT USING (public.obtener_rol() IN ('admin','inventario'));

CREATE POLICY "pedidos_admin_actualizacion" ON pedidos
  FOR UPDATE USING (public.obtener_rol() IN ('admin','inventario'));

-- Inserción solo vía RPC crear_pedido (SECURITY DEFINER)

-- ============================================================
-- 6. RPC: crear_pedido
--    Valida saldo, descuenta del wallet y crea pedido — atómico.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crear_pedido(
  p_producto_id            UUID,
  p_cantidad               INT,
  p_atributos              JSONB,
  p_tipo_pago              TEXT,
  p_cliente_nombre         TEXT,
  p_cliente_cedula         TEXT,
  p_cliente_telefono       TEXT,
  p_cliente_direccion      TEXT,
  p_cliente_ciudad         TEXT,
  p_cliente_departamento   TEXT,
  p_cliente_observaciones  TEXT,
  p_precio_venta_cliente   DECIMAL DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_vendedor_id    UUID;
  v_precio         DECIMAL(10,2);
  v_flete          DECIMAL(10,2);
  v_subtotal       DECIMAL(12,2);
  v_total          DECIMAL(12,2);
  v_saldo_actual   DECIMAL(12,2);
  v_saldo_nuevo    DECIMAL(12,2);
  v_pedido_id      UUID;
  v_pedido_numero  BIGINT;
BEGIN
  v_vendedor_id := auth.uid();
  IF v_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_tipo_pago NOT IN ('cod','anticipado') THEN
    RAISE EXCEPTION 'Tipo de pago inválido';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad < 1 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  -- Precio del producto (precio_final si existe, si no precio_sugerido, si no precio_base)
  SELECT COALESCE(precio_final, precio_sugerido, precio_base)
  INTO v_precio
  FROM productos
  WHERE id = p_producto_id AND disponible = true;

  IF v_precio IS NULL THEN
    RAISE EXCEPTION 'Producto no disponible';
  END IF;

  -- Flete plano
  SELECT (valor #>> '{}')::numeric INTO v_flete
  FROM config_plataforma WHERE clave = 'flete_plano';

  IF v_flete IS NULL THEN
    RAISE EXCEPTION 'Flete no configurado';
  END IF;

  v_subtotal := v_precio * p_cantidad;
  v_total := CASE
    WHEN p_tipo_pago = 'cod' THEN v_flete
    ELSE v_flete + v_subtotal
  END;

  -- Lock del perfil para evitar condiciones de carrera
  SELECT saldo INTO v_saldo_actual
  FROM perfiles WHERE id = v_vendedor_id FOR UPDATE;

  IF v_saldo_actual IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF v_saldo_actual < v_total THEN
    RAISE EXCEPTION 'Saldo insuficiente: requiere %, disponible %', v_total, v_saldo_actual
      USING ERRCODE = 'P0001';
  END IF;

  v_saldo_nuevo := v_saldo_actual - v_total;

  UPDATE perfiles SET saldo = v_saldo_nuevo WHERE id = v_vendedor_id;

  INSERT INTO pedidos (
    vendedor_id, producto_id, cantidad, atributos_seleccionados, tipo_pago,
    cliente_nombre, cliente_cedula, cliente_telefono,
    cliente_direccion, cliente_ciudad, cliente_departamento, cliente_observaciones,
    precio_unitario, subtotal, flete, precio_venta_cliente, total_debitado
  ) VALUES (
    v_vendedor_id, p_producto_id, p_cantidad, p_atributos, p_tipo_pago,
    p_cliente_nombre, p_cliente_cedula, p_cliente_telefono,
    p_cliente_direccion, p_cliente_ciudad, p_cliente_departamento, p_cliente_observaciones,
    v_precio, v_subtotal, v_flete, p_precio_venta_cliente, v_total
  )
  RETURNING id, numero INTO v_pedido_id, v_pedido_numero;

  INSERT INTO movimientos_wallet (
    perfil_id, tipo, monto, saldo_despues, referencia, descripcion
  ) VALUES (
    v_vendedor_id,
    CASE WHEN p_tipo_pago = 'cod' THEN 'debito_flete' ELSE 'debito_anticipado' END,
    -v_total,
    v_saldo_nuevo,
    v_pedido_id::text,
    'Pedido #' || v_pedido_numero || ' (' || p_tipo_pago || ')'
  );

  RETURN json_build_object(
    'pedido_id',      v_pedido_id,
    'numero',         v_pedido_numero,
    'total_debitado', v_total,
    'saldo_nuevo',    v_saldo_nuevo,
    'flete',          v_flete,
    'subtotal',       v_subtotal
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.crear_pedido TO authenticated;

-- ============================================================
-- 7. RPC: acreditar_wallet (llamada desde webhook ePayco)
--    Idempotente: una referencia = una sola recarga
-- ============================================================

CREATE OR REPLACE FUNCTION public.acreditar_wallet(
  p_perfil_id    UUID,
  p_monto        DECIMAL,
  p_referencia   TEXT,
  p_descripcion  TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_saldo_nuevo DECIMAL(12,2);
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  IF p_referencia IS NULL OR length(p_referencia) = 0 THEN
    RAISE EXCEPTION 'Referencia requerida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM movimientos_wallet
    WHERE tipo = 'recarga' AND referencia = p_referencia
  ) THEN
    SELECT saldo INTO v_saldo_nuevo FROM perfiles WHERE id = p_perfil_id;
    RETURN json_build_object(
      'status',     'duplicado',
      'referencia', p_referencia,
      'saldo',      v_saldo_nuevo
    );
  END IF;

  UPDATE perfiles SET saldo = saldo + p_monto
  WHERE id = p_perfil_id
  RETURNING saldo INTO v_saldo_nuevo;

  IF v_saldo_nuevo IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  INSERT INTO movimientos_wallet (
    perfil_id, tipo, monto, saldo_despues, referencia, descripcion
  ) VALUES (
    p_perfil_id, 'recarga', p_monto, v_saldo_nuevo, p_referencia,
    COALESCE(p_descripcion, 'Recarga ePayco')
  );

  RETURN json_build_object(
    'status', 'ok',
    'saldo',  v_saldo_nuevo
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Solo llamable por service_role (no exponer a authenticated)
REVOKE ALL ON FUNCTION public.acreditar_wallet FROM PUBLIC, authenticated;

-- ============================================================
-- 8. RPC: reembolsar_pedido (admin cancela)
-- ============================================================

CREATE OR REPLACE FUNCTION public.reembolsar_pedido(
  p_pedido_id  UUID,
  p_motivo     TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_rol          TEXT;
  v_pedido       RECORD;
  v_saldo_nuevo  DECIMAL(12,2);
BEGIN
  v_rol := public.obtener_rol();
  IF v_rol NOT IN ('admin','inventario') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  IF v_pedido.estado IN ('cancelado','devuelto') THEN
    RAISE EXCEPTION 'Pedido ya cancelado/devuelto';
  END IF;

  IF v_pedido.estado = 'entregado' THEN
    RAISE EXCEPTION 'No se puede reembolsar un pedido entregado';
  END IF;

  UPDATE perfiles SET saldo = saldo + v_pedido.total_debitado
  WHERE id = v_pedido.vendedor_id
  RETURNING saldo INTO v_saldo_nuevo;

  INSERT INTO movimientos_wallet (
    perfil_id, tipo, monto, saldo_despues, referencia, descripcion, creado_por
  ) VALUES (
    v_pedido.vendedor_id, 'reembolso', v_pedido.total_debitado, v_saldo_nuevo,
    v_pedido.id::text,
    'Reembolso pedido #' || v_pedido.numero ||
      CASE WHEN p_motivo IS NOT NULL THEN ' - ' || p_motivo ELSE '' END,
    auth.uid()
  );

  UPDATE pedidos SET
    estado = 'cancelado',
    notas_admin = COALESCE(notas_admin || E'\n', '') ||
                  'CANCELADO ' || to_char(NOW(),'YYYY-MM-DD HH24:MI') ||
                  CASE WHEN p_motivo IS NOT NULL THEN ': ' || p_motivo ELSE '' END
  WHERE id = p_pedido_id;

  RETURN json_build_object(
    'status',            'ok',
    'monto_reembolsado', v_pedido.total_debitado,
    'saldo_vendedor',    v_saldo_nuevo
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.reembolsar_pedido TO authenticated;

-- ============================================================
-- 9. RPC: ajuste_manual_wallet (admin suma/resta manualmente)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ajuste_manual_wallet(
  p_perfil_id    UUID,
  p_monto        DECIMAL,
  p_descripcion  TEXT
)
RETURNS JSON AS $$
DECLARE
  v_saldo_nuevo DECIMAL(12,2);
BEGIN
  IF public.obtener_rol() <> 'admin' THEN
    RAISE EXCEPTION 'Solo admin';
  END IF;

  IF p_monto = 0 THEN
    RAISE EXCEPTION 'Monto no puede ser cero';
  END IF;

  UPDATE perfiles SET saldo = saldo + p_monto
  WHERE id = p_perfil_id
  RETURNING saldo INTO v_saldo_nuevo;

  IF v_saldo_nuevo IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF v_saldo_nuevo < 0 THEN
    RAISE EXCEPTION 'El saldo no puede quedar negativo';
  END IF;

  INSERT INTO movimientos_wallet (
    perfil_id, tipo, monto, saldo_despues, descripcion, creado_por
  ) VALUES (
    p_perfil_id, 'ajuste_admin', p_monto, v_saldo_nuevo, p_descripcion, auth.uid()
  );

  RETURN json_build_object('status','ok','saldo', v_saldo_nuevo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.ajuste_manual_wallet TO authenticated;
