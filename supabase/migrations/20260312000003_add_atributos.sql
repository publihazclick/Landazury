ALTER TABLE productos ADD COLUMN IF NOT EXISTS atributos JSONB DEFAULT '[]'::jsonb;
