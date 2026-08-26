-- Fix seguridad CRITICO: vista_retiros_admin (Landazury) es SECURITY DEFINER (por defecto, sin
-- security_invoker) sin ningun filtro de rol embebido, y estaba GRANTeada a anon con
-- SELECT/INSERT/UPDATE/DELETE -- cualquiera con la anon key publica podia leer datos bancarios
-- completos (titular, numero de cuenta, banco, tipo de cuenta) + telefono/email de TODOS los
-- vendedores para TODAS las solicitudes de retiro, sin sesion. Verificado en codigo real
-- (ganancias.service.ts/admin.component.ts): se consulta directo client-side, sin ningun chequeo
-- de rol adicional -- dependia por completo de que esto estuviera protegido a nivel de base de
-- datos, y no lo estaba.
--
-- Fix: se agrega el mismo chequeo de rol que ya usa dashboard_admin() (obtener_rol() = 'admin')
-- directo en el WHERE de la vista -- sigue siendo SECURITY DEFINER (necesario para que el admin
-- pueda ver los metodos de pago de OTROS vendedores, ya que metodos_pago_vendedor/retiros_ganancias
-- tienen RLS "solo el dueño"), pero ahora un no-admin obtiene 0 filas en vez de todo. Se revocan
-- ademas los grants directos de anon (no deberia ni intentar tocarla).
drop view if exists public.vista_retiros_admin;
create view public.vista_retiros_admin as
SELECT r.id,
    r.monto,
    r.estado,
    r.notas_admin,
    r.creado_en,
    r.procesado_en,
    p.nombre AS vendedor_nombre,
    p.email AS vendedor_email,
    p.telefono AS vendedor_telefono,
    mp.tipo AS metodo_tipo,
    mp.titular,
    mp.numero,
    mp.banco,
    mp.tipo_cuenta,
    r.vendedor_id,
    r.metodo_pago_id
   FROM retiros_ganancias r
     JOIN perfiles p ON p.id = r.vendedor_id
     JOIN metodos_pago_vendedor mp ON mp.id = r.metodo_pago_id
  WHERE obtener_rol() = 'admin'
  ORDER BY r.creado_en DESC;

revoke all on public.vista_retiros_admin from anon;
revoke insert, update, delete, truncate, references, trigger on public.vista_retiros_admin from authenticated;

-- mis_referidos ya es seguro (WHERE p.referido_por = auth.uid() embebido, un no-dueño o anon
-- siempre obtiene 0 filas), pero igual se le quitan los grants de escritura/anon que nunca
-- deberian haber estado ahi, por higiene y consistencia con el resto del proyecto.
revoke all on public.mis_referidos from anon;
revoke insert, update, delete, truncate, references, trigger on public.mis_referidos from authenticated;
