-- ============================================================
-- LANDAZURY — Integraciones externas (Shopify / WooCommerce)
-- ============================================================
-- Permite a cada vendedor conectar su tienda externa para recibir
-- pedidos automáticamente. Los pedidos llegan vía webhook, el
-- vendedor los aprueba y el sistema genera la guía.
--
-- Flujo:
--   1. Vendedor conecta su tienda → se genera webhook_token único
--   2. Vendedor pega la URL del webhook en su tienda
--   3. Cuando llega un pedido → se guarda en pedidos_externos
--   4. Vendedor aprueba → se llama crear_pedido + generar-guia
-- ============================================================

-- ── 1. Tabla de integraciones ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integraciones (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id   UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  plataforma    TEXT NOT NULL CHECK (plataforma IN ('shopify','woocommerce')),
  nombre        TEXT NOT NULL,
  url_tienda    TEXT NOT NULL,
  webhook_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  activa        BOOLEAN NOT NULL DEFAULT true,
  total_ordenes INT NOT NULL DEFAULT 0,
  creado_en     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_integracion UNIQUE (vendedor_id, plataforma, url_tienda),
  CONSTRAINT uq_webhook_token UNIQUE (webhook_token)
);

CREATE INDEX IF NOT EXISTS idx_integraciones_vendedor
  ON integraciones(vendedor_id);

CREATE INDEX IF NOT EXISTS idx_integraciones_token
  ON integraciones(webhook_token);

-- ── 2. Tabla de pedidos externos ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pedidos_externos (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  integracion_id   UUID NOT NULL REFERENCES integraciones(id) ON DELETE CASCADE,
  vendedor_id      UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  plataforma       TEXT NOT NULL,
  order_id_externo TEXT NOT NULL,
  order_number     TEXT,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','aprobado','rechazado')),
  -- Cliente (extraído del webhook)
  cliente_nombre      TEXT,
  cliente_email       TEXT,
  cliente_telefono    TEXT,
  cliente_direccion   TEXT,
  cliente_ciudad      TEXT,
  cliente_departamento TEXT,
  -- Líneas de la orden (para mostrar en el panel)
  items_json          JSONB,
  total_externo       DECIMAL(12,2),
  moneda              TEXT DEFAULT 'COP',
  -- Producto Landazury asignado al momento de aprobar
  producto_id         UUID REFERENCES productos(id),
  cantidad            INT DEFAULT 1,
  -- Pedido Landazury resultante
  pedido_id           UUID REFERENCES pedidos(id),
  -- Payload completo del webhook (para auditoría)
  datos_raw           JSONB,
  notas               TEXT,
  recibido_en         TIMESTAMPTZ DEFAULT NOW(),
  procesado_en        TIMESTAMPTZ,
  CONSTRAINT uq_orden_externa UNIQUE (integracion_id, order_id_externo)
);

CREATE INDEX IF NOT EXISTS idx_externos_vendedor
  ON pedidos_externos(vendedor_id, recibido_en DESC);

CREATE INDEX IF NOT EXISTS idx_externos_estado
  ON pedidos_externos(vendedor_id, estado)
  WHERE estado = 'pendiente';

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE integraciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_externos ENABLE ROW LEVEL SECURITY;

-- integraciones: el vendedor gestiona solo las suyas
CREATE POLICY "integ_select" ON integraciones FOR SELECT
  USING (vendedor_id = auth.uid());
CREATE POLICY "integ_insert" ON integraciones FOR INSERT
  WITH CHECK (vendedor_id = auth.uid());
CREATE POLICY "integ_update" ON integraciones FOR UPDATE
  USING (vendedor_id = auth.uid());
CREATE POLICY "integ_delete" ON integraciones FOR DELETE
  USING (vendedor_id = auth.uid());

-- pedidos_externos: el vendedor solo lee los suyos.
-- La escritura (INSERT) la hace el webhook con service_role.
-- La actualización (aprobar/rechazar) va a través de RPC.
CREATE POLICY "ext_select" ON pedidos_externos FOR SELECT
  USING (vendedor_id = auth.uid());

-- ── 4. RPC marcar_pedido_externo ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.marcar_pedido_externo(
  p_externo_id UUID,
  p_estado     TEXT,          -- 'aprobado' | 'rechazado'
  p_pedido_id  UUID DEFAULT NULL,
  p_notas      TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_estado NOT IN ('aprobado','rechazado') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado;
  END IF;

  UPDATE pedidos_externos SET
    estado       = p_estado,
    pedido_id    = COALESCE(p_pedido_id, pedido_id),
    notas        = COALESCE(p_notas, notas),
    procesado_en = NOW()
  WHERE id         = p_externo_id
    AND vendedor_id = auth.uid()
    AND estado      = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido externo no encontrado o ya procesado';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.marcar_pedido_externo TO authenticated;

-- ── 5. Contador de órdenes por integración (trigger) ────────────────────────

CREATE OR REPLACE FUNCTION public.incrementar_total_ordenes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE integraciones
    SET total_ordenes = total_ordenes + 1
  WHERE id = NEW.integracion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_incrementar_ordenes ON pedidos_externos;
CREATE TRIGGER trg_incrementar_ordenes
  AFTER INSERT ON pedidos_externos
  FOR EACH ROW EXECUTE FUNCTION public.incrementar_total_ordenes();
