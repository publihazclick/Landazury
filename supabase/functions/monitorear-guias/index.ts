// Job batch que actualiza el tracking de todas las guías activas.
// Invocado cada 30 min por pg_cron vía net.http_post.
// Valida identidad con la cabecera x-cron-secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CRON_SECRET = 'lz-cron-2026'

// Mapa de palabras clave en el estado de Mipaquete → nuestro estado
const ESTADO_MAP: Array<[string, string]> = [
  ['entregado',      'entregado'],
  ['entregada',      'entregado'],
  ['delivered',      'entregado'],
  ['devuelto',       'devuelto'],
  ['devuelta',       'devuelto'],
  ['en retorno',     'devuelto'],
  ['retorno',        'devuelto'],
  ['returned',       'devuelto'],
  ['en distribuci',  'en_ruta'],   // "en distribución"
  ['en ruta',        'en_ruta'],
  ['en camino',      'en_ruta'],
  ['out for',        'en_ruta'],   // "out for delivery"
  ['despacho',       'despachado'],
  ['despachado',     'despachado'],
  ['recogido',       'despachado'],
  ['recogida',       'despachado'],
  ['en tr',          'despachado'], // "en tránsito"
  ['transit',        'despachado'],
  ['en bodega',      'despachado'],
]

function mapearEstado(raw: string): string | null {
  if (!raw) return null
  const s = raw.toLowerCase().trim()
  for (const [key, val] of ESTADO_MAP) {
    if (s.includes(key)) return val
  }
  return null
}

function normalizarEventos(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'object' || raw === null) return []
  const r = raw as Record<string, unknown>
  if (Array.isArray(r['events']))   return r['events']
  if (Array.isArray(r['tracking'])) return r['tracking']
  if (Array.isArray(r['data']))     return r['data']
  if (r['data'] && typeof r['data'] === 'object') return [r['data']]
  return []
}

function extraerEstado(evento: unknown): string {
  if (!evento || typeof evento !== 'object') return ''
  const e = evento as Record<string, unknown>
  return String(e['state'] ?? e['estado'] ?? e['status'] ?? e['description'] ?? e['descripcion'] ?? '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  // Autenticación: cron secret o service-role key
  const cronSecret  = req.headers.get('x-cron-secret') ?? ''
  const authHeader  = req.headers.get('Authorization') ?? ''
  const srvKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const autenticado = cronSecret === CRON_SECRET || authHeader.includes(srvKey)

  if (!autenticado) {
    return json({ error: 'No autorizado' }, 401)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    srvKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? ''
  if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500)

  // Obtener pedidos que necesitan actualización de tracking
  const { data: pedidos, error: pedidosErr } = await admin
    .rpc('get_pedidos_para_tracking', { p_limite: 50 })

  if (pedidosErr) return json({ error: pedidosErr.message }, 500)

  if (!pedidos?.length) {
    return json({ ok: true, procesados: 0, mensaje: 'Sin guías activas para monitorear' })
  }

  let procesados = 0
  let cambios    = 0
  let errores    = 0

  for (const pedido of pedidos) {
    try {
      const url = `https://api.mipaquete.com/sendingtracking/${encodeURIComponent(pedido.mipaquete_sending_id)}` +
                  `?deliveryCompany=${encodeURIComponent(pedido.delivery_company_id ?? '')}`

      let resp: Response
      try {
        resp = await fetch(url, {
          headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
          signal:  AbortSignal.timeout(10_000),
        })
      } catch {
        errores++
        continue
      }

      if (!resp.ok) { errores++; continue }

      let rawData: unknown
      try { rawData = await resp.json() } catch { errores++; continue }

      const eventos   = normalizarEventos(rawData)
      const primerEv  = eventos[0] ?? null
      const ultimoEst = extraerEstado(primerEv)
      const nuevoEst  = mapearEstado(ultimoEst)

      // Solo actualizar estado si es una progresión (no retroceder estados finales)
      const estadosFinales  = ['entregado', 'devuelto', 'cancelado']
      const debeProgresion  = nuevoEst !== null
        && nuevoEst !== pedido.estado
        && !estadosFinales.includes(pedido.estado)

      const { data: resultado, error: rpcErr } = await admin.rpc('actualizar_tracking_pedido', {
        p_pedido_id:           pedido.id,
        p_eventos:             eventos,
        p_ultimo_estado:       ultimoEst,
        p_nuevo_estado_pedido: debeProgresion ? nuevoEst : null,
      })

      if (rpcErr) { errores++; continue }

      const res = resultado as { cambio?: boolean; estado_nuevo?: string; seguro?: boolean } | null

      if (res?.cambio) {
        cambios++
        // Notificar al vendedor vía WhatsApp cuando el pedido se entrega o devuelve
        if (['entregado', 'devuelto'].includes(res.estado_nuevo ?? '')) {
          admin.functions.invoke('notificar-pedido-evento', {
            body: { pedido_id: pedido.id }
          }).catch(() => {/* fire-and-forget */})
        }
      }

      procesados++
    } catch (err) {
      console.error(`[monitorear-guias] Error pedido ${pedido.id}:`, err)
      errores++
    }
  }

  console.log(`[monitorear-guias] procesados=${procesados} cambios=${cambios} errores=${errores}`)

  return json({ ok: true, procesados, cambios, errores, ts: new Date().toISOString() })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
