-- Agrega SKU y stock a productos; elimina uso de proveedor
ALTER TABLE productos ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock INTEGER;
