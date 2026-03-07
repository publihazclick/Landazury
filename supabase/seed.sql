-- =============================================================
-- USUARIOS DE PRUEBA — LANDAZURY
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- Requisito: extensión pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------
-- 1. Insertar usuarios en auth.users
-- -------------------------------------------------------------
DO $$
DECLARE
  id_admin      uuid := gen_random_uuid();
  id_inventario uuid := gen_random_uuid();
  id_usuario    uuid := gen_random_uuid();
BEGIN

  -- Admin
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    id_admin, 'authenticated', 'authenticated',
    'admin@landazury.com',
    crypt('Admin2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Admin Landazury"}',
    '', '', '', ''
  );

  -- Inventario
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    id_inventario, 'authenticated', 'authenticated',
    'inventario@landazury.com',
    crypt('Inv2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Gestor Inventario"}',
    '', '', '', ''
  );

  -- Usuario regular
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    id_usuario, 'authenticated', 'authenticated',
    'usuario@landazury.com',
    crypt('User2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Usuario Dropshipper"}',
    '', '', '', ''
  );

  -- -------------------------------------------------------------
  -- 2. Crear perfiles (el trigger los crea como 'usuario' por defecto,
  --    aquí los insertamos manualmente por si el trigger ya corrió)
  -- -------------------------------------------------------------
  INSERT INTO public.perfiles (id, nombre, rol, creado_en)
  VALUES
    (id_admin,      'Admin Landazury',    'admin',      now()),
    (id_inventario, 'Gestor Inventario',  'inventario', now()),
    (id_usuario,    'Usuario Dropshipper','usuario',    now())
  ON CONFLICT (id) DO UPDATE
    SET rol = EXCLUDED.rol;

END $$;

-- =============================================================
-- CREDENCIALES DE PRUEBA
-- =============================================================
-- ROL ADMIN
--   Email:      admin@landazury.com
--   Contraseña: Admin2024!
--
-- ROL INVENTARIO
--   Email:      inventario@landazury.com
--   Contraseña: Inv2024!
--
-- ROL USUARIO
--   Email:      usuario@landazury.com
--   Contraseña: User2024!
-- =============================================================
