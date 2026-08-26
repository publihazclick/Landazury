-- ============================================================
-- LANDAZURY — Dashboard del admin
-- ============================================================
-- RPC `dashboard_admin()` que retorna en un solo JSON todas las
-- métricas relevantes para el panel de estadísticas:
--   * Resumen general (usuarios, productos, pedidos, GMV, ingresos)
--   * Pedidos por estado
--   * Pedidos hoy / 7 días / 30 días
--   * Tendencia diaria 30 días
--   * Top vendedores (entregados y monto)
--   * Top productos más vendidos
--   * Top categorías
--   * Top ciudades destino
--   * Wallet: saldo total, recargas, débitos
--   * Mipaquete: ganancia acumulada, pedidos con/sin guía
--   * Referidos: total comisiones, # referidores
-- Solo accesible para admin (verificación interna).
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_admin()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado JSON;
BEGIN
  IF public.obtener_rol() <> 'admin' THEN
    RAISE EXCEPTION 'Solo el admin puede consultar el dashboard.';
  END IF;

  WITH
  resumen AS (
    SELECT
      (SELECT COUNT(*) FROM perfiles)                             AS total_usuarios,
      (SELECT COUNT(*) FROM perfiles WHERE rol = 'admin')         AS usuarios_admin,
      (SELECT COUNT(*) FROM perfiles WHERE rol = 'inventario')    AS usuarios_inventario,
      (SELECT COUNT(*) FROM perfiles WHERE rol = 'usuario')       AS usuarios_normales,
      (SELECT COUNT(*) FROM perfiles WHERE creado_en >= NOW() - INTERVAL '7 days')  AS usuarios_nuevos_7d,
      (SELECT COUNT(*) FROM perfiles WHERE creado_en >= NOW() - INTERVAL '30 days') AS usuarios_nuevos_30d,
      (SELECT COUNT(*) FROM productos)                            AS total_productos,
      (SELECT COUNT(*) FROM productos WHERE estado = 'aprobado')  AS productos_aprobados,
      (SELECT COUNT(*) FROM productos WHERE estado = 'pendiente') AS productos_pendientes,
      (SELECT COUNT(*) FROM productos WHERE estado = 'rechazado') AS productos_rechazados,
      (SELECT COUNT(*) FROM pedidos)                              AS total_pedidos,
      (SELECT COUNT(*) FROM pedidos WHERE creado_en::date = CURRENT_DATE)              AS pedidos_hoy,
      (SELECT COUNT(*) FROM pedidos WHERE creado_en >= NOW() - INTERVAL '7 days')      AS pedidos_7d,
      (SELECT COUNT(*) FROM pedidos WHERE creado_en >= NOW() - INTERVAL '30 days')     AS pedidos_30d,
      (SELECT COUNT(*) FROM pedidos WHERE estado = 'entregado')                        AS pedidos_entregados,
      (SELECT COUNT(*) FROM pedidos WHERE estado IN ('devuelto','cancelado'))          AS pedidos_perdidos,
      (SELECT COALESCE(SUM(total_debitado), 0)
         FROM pedidos
         WHERE estado NOT IN ('devuelto','cancelado'))                                 AS gmv_total,
      (SELECT COALESCE(SUM(total_debitado), 0)
         FROM pedidos
         WHERE estado = 'entregado')                                                   AS gmv_entregado,
      (SELECT COALESCE(SUM(flete_ganancia), 0)
         FROM pedidos
         WHERE estado NOT IN ('devuelto','cancelado'))                                 AS ingreso_margen_flete,
      (SELECT COALESCE(SUM(flete_ganancia), 0)
         FROM pedidos
         WHERE estado = 'entregado')                                                   AS ingreso_margen_flete_entregado,
      (SELECT COALESCE(SUM(saldo), 0) FROM perfiles)                                   AS saldo_total_wallets,
      (SELECT COALESCE(SUM(monto), 0) FROM movimientos_wallet WHERE tipo = 'recarga')  AS total_recargado,
      (SELECT COALESCE(SUM(monto), 0)
         FROM movimientos_wallet
         WHERE tipo IN ('debito_flete','debito_anticipado'))                           AS total_debitado,
      (SELECT COALESCE(SUM(monto), 0) FROM movimientos_wallet WHERE tipo = 'reembolso')          AS total_reembolsado,
      (SELECT COUNT(*) FROM perfiles WHERE referido_por IS NOT NULL)                   AS total_referidores,
      (SELECT COALESCE(SUM(monto), 0) FROM comisiones_referidos)                       AS total_comisiones_referidos,
      (SELECT COUNT(*) FROM pedidos WHERE mipaquete_sending_id IS NOT NULL)            AS pedidos_con_guia,
      (SELECT COUNT(*) FROM pedidos
         WHERE mipaquete_sending_id IS NULL AND estado IN ('confirmado','despachado','en_ruta')) AS pedidos_sin_guia
  ),
  pedidos_por_estado AS (
    SELECT json_object_agg(estado, total) AS data FROM (
      SELECT estado, COUNT(*)::int AS total FROM pedidos GROUP BY estado
    ) sub
  ),
  tendencia AS (
    SELECT json_agg(row_to_json(d) ORDER BY d.dia) AS data FROM (
      SELECT
        gs::date AS dia,
        COALESCE(p.pedidos, 0)::int        AS pedidos,
        COALESCE(p.entregados, 0)::int     AS entregados,
        COALESCE(p.gmv, 0)::numeric        AS gmv,
        COALESCE(p.margen, 0)::numeric     AS margen
      FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day') gs
      LEFT JOIN (
        SELECT
          creado_en::date AS dia,
          COUNT(*)                                          AS pedidos,
          COUNT(*) FILTER (WHERE estado = 'entregado')      AS entregados,
          SUM(total_debitado) FILTER (WHERE estado <> 'cancelado' AND estado <> 'devuelto') AS gmv,
          SUM(flete_ganancia) FILTER (WHERE estado <> 'cancelado' AND estado <> 'devuelto') AS margen
        FROM pedidos
        WHERE creado_en >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY 1
      ) p ON p.dia = gs::date
    ) d
  ),
  top_vendedores AS (
    SELECT json_agg(row_to_json(t)) AS data FROM (
      SELECT
        p.vendedor_id                               AS id,
        per.nombre,
        per.email,
        COUNT(*)::int                               AS pedidos,
        COUNT(*) FILTER (WHERE p.estado = 'entregado')::int AS entregados,
        SUM(p.total_debitado) FILTER (WHERE p.estado <> 'cancelado' AND p.estado <> 'devuelto') AS gmv,
        SUM(p.flete_ganancia) FILTER (WHERE p.estado <> 'cancelado' AND p.estado <> 'devuelto') AS margen
      FROM pedidos p
      JOIN perfiles per ON per.id = p.vendedor_id
      GROUP BY p.vendedor_id, per.nombre, per.email
      ORDER BY pedidos DESC
      LIMIT 10
    ) t
  ),
  top_productos AS (
    SELECT json_agg(row_to_json(t)) AS data FROM (
      SELECT
        p.producto_id        AS id,
        pr.nombre,
        COUNT(*)::int        AS pedidos,
        SUM(p.cantidad)::int AS unidades,
        SUM(p.subtotal) FILTER (WHERE p.estado <> 'cancelado' AND p.estado <> 'devuelto') AS gmv
      FROM pedidos p
      JOIN productos pr ON pr.id = p.producto_id
      GROUP BY p.producto_id, pr.nombre
      ORDER BY pedidos DESC
      LIMIT 10
    ) t
  ),
  top_ciudades AS (
    SELECT json_agg(row_to_json(t)) AS data FROM (
      SELECT
        cliente_ciudad        AS ciudad,
        cliente_departamento  AS depto,
        COUNT(*)::int         AS pedidos,
        SUM(total_debitado) FILTER (WHERE estado <> 'cancelado' AND estado <> 'devuelto') AS gmv
      FROM pedidos
      GROUP BY 1, 2
      ORDER BY pedidos DESC
      LIMIT 10
    ) t
  ),
  top_recargadores AS (
    SELECT json_agg(row_to_json(t)) AS data FROM (
      SELECT
        m.perfil_id     AS id,
        per.nombre,
        per.email,
        SUM(m.monto)::numeric AS total_recargado,
        COUNT(*)::int         AS recargas
      FROM movimientos_wallet m
      JOIN perfiles per ON per.id = m.perfil_id
      WHERE m.tipo = 'recarga'
      GROUP BY m.perfil_id, per.nombre, per.email
      ORDER BY total_recargado DESC
      LIMIT 10
    ) t
  ),
  top_referidores AS (
    SELECT json_agg(row_to_json(t)) AS data FROM (
      SELECT
        per.id,
        per.nombre,
        per.email,
        per.referral_code,
        COUNT(ref.id)::int                              AS referidos_directos,
        COALESCE(SUM(c.monto), 0)::numeric              AS comisiones
      FROM perfiles per
      LEFT JOIN perfiles ref ON ref.referido_por = per.id
      LEFT JOIN comisiones_referidos c ON c.referidor_id = per.id
      GROUP BY per.id, per.nombre, per.email, per.referral_code
      HAVING COUNT(ref.id) > 0
      ORDER BY referidos_directos DESC, comisiones DESC
      LIMIT 10
    ) t
  )
  SELECT json_build_object(
    'resumen',             (SELECT row_to_json(resumen.*) FROM resumen),
    'pedidos_por_estado',  (SELECT data FROM pedidos_por_estado),
    'tendencia_30d',       (SELECT data FROM tendencia),
    'top_vendedores',      (SELECT data FROM top_vendedores),
    'top_productos',       (SELECT data FROM top_productos),
    'top_ciudades',        (SELECT data FROM top_ciudades),
    'top_recargadores',    (SELECT data FROM top_recargadores),
    'top_referidores',     (SELECT data FROM top_referidores),
    'generado_en',         NOW()
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_admin() TO authenticated;
