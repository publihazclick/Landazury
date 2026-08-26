// Proxy de /getLocations de Mipaquete (con caché en memoria por 1h).
// Query param: q (texto a buscar por ciudad o departamento)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MipaqueteLocation {
  _id:                   string
  locationName:          string
  departmentOrStateName: string
  locationCode:          string
  countryName:           string
}

let CACHE: MipaqueteLocation[] | null = null
let CACHE_AT = 0
const CACHE_TTL_MS = 60 * 60 * 1000  // 1 hora

async function loadLocations(): Promise<MipaqueteLocation[]> {
  const now = Date.now()
  if (CACHE && (now - CACHE_AT) < CACHE_TTL_MS) return CACHE

  const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? ''
  if (!apiKey) throw new Error('MIPAQUETE_API_KEY no configurada')

  const sessionTracker = crypto.randomUUID()
  const resp = await fetch('https://api.mipaquete.com/getLocations?countryId=CO', {
    headers: {
      'apikey':          apiKey,
      'session-tracker': sessionTracker,
    },
  })
  if (!resp.ok) throw new Error(`Mipaquete ${resp.status}: ${await resp.text()}`)

  const data = (await resp.json()) as MipaqueteLocation[]
  CACHE = Array.isArray(data) ? data : []
  CACHE_AT = now
  return CACHE
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Soporta GET con query params o POST con body JSON
    let q = ''
    let limit = 20
    const url = new URL(req.url)
    if (req.method === 'GET') {
      q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
      limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)))
    } else {
      try {
        const body = await req.json()
        q = String(body?.q ?? '').trim().toLowerCase()
        limit = Math.min(50, Math.max(1, Number(body?.limit ?? 20)))
      } catch { /* body vacío */ }
    }

    const all = await loadLocations()

    let result = all
    if (q.length >= 2) {
      const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      const qn = norm(q)
      result = all.filter(l =>
        norm(l.locationName ?? '').includes(qn) ||
        norm(l.departmentOrStateName ?? '').includes(qn)
      )
    }

    const mapped = result.slice(0, limit).map(l => ({
      dane_code:   l.locationCode,
      ciudad:      l.locationName,
      departamento: l.departmentOrStateName,
      label:       `${l.locationName}, ${l.departmentOrStateName}`,
    }))

    return json({ resultados: mapped, total_catalogo: all.length, cached: CACHE_AT > 0 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return json({ error: message }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
