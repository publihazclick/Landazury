-- Fix seguridad: sucursales (Landazury) tenia RLS deshabilitado por completo con GRANT full
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) a anon y authenticated -- cualquiera con la anon key
-- publica podia leer/modificar/borrar datos del remitente (telefono, email, NIT) usados para
-- generar guias de envio reales. Verificado en codigo real (catalogo.service.ts,
-- inventario.component.ts, cotizar-flete-mipaquete/generar-guia-mipaquete): el unico acceso
-- cliente-side es una lectura SIEMPRE filtrada por propietario_id = auth.uid() (obtenerSucursalesUsuario);
-- no hay ningun INSERT/UPDATE/DELETE desde el cliente -- las 2 edge functions que la leen usan
-- service_role (bypasea RLS). Se cierra con el mismo patron ya usado en productos/creativos de
-- este proyecto (obtener_rol() IN admin/inventario para gestion, dueño para lectura propia).

alter table public.sucursales enable row level security;

create policy sucursales_lectura_propia_o_admin on public.sucursales
  for select using (
    propietario_id = auth.uid()
    or obtener_rol() = any (array['admin', 'inventario'])
  );

create policy sucursales_gestion_admin_inventario on public.sucursales
  for insert with check (obtener_rol() = any (array['admin', 'inventario']));

create policy sucursales_actualizacion_admin_inventario on public.sucursales
  for update using (obtener_rol() = any (array['admin', 'inventario']))
  with check (obtener_rol() = any (array['admin', 'inventario']));

create policy sucursales_eliminacion_admin_inventario on public.sucursales
  for delete using (obtener_rol() = any (array['admin', 'inventario']));
