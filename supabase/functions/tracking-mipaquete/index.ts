// Consulta el estado de seguimiento de un envío en Mipaquete.
// Entrada: { pedido_id: string }
// Requiere: pedido.mipaquete_sending_id y pedido.delivery_company_id

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TrackingBody {
  pedido_id: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: userRes, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userRes?.user) return json({ error: 'No autorizado' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = (await req.json()) as TrackingBody
    if (!body.pedido_id) return json({ error: 'pedido_id requerido' }, 400)

    const { data: pedido, error: pedidoErr } = await admin
      .from('pedidos')
      .select('id, vendedor_id, mipaquete_sending_id, delivery_company_id, delivery_company_name, guia')
      .eq('id', body.pedido_id)
      .single()

    if (pedidoErr || !pedido) return json({ error: 'Pedido no encontrado' }, 404)

    // Autorización: solo el vendedor o admin/inventario puede consultar
    const { data: perfil } = await admin
      .from('perfiles')
      .select('rol')
      .eq('id', userRes.user.id)
      .single()

    const esAdminOInventario = perfil && ['admin','inventario'].includes(perfil.rol)
    const esVendedorDelPedido = perfil?.rol === 'usuario' && pedido.vendedor_id === userRes.user.id

    if (!esAdminOInventario && !esVendedorDelPedido) {
      return json({ error: 'No autorizado' }, 403)
    }

    if (!pedido.mipaquete_sending_id) {
      return json({ tracking: [], mensaje: 'Guía no generada aún' })
    }

    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? ''
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500)

    const mpCode    = pedido.mipaquete_sending_id
    const company   = pedido.delivery_company_id ?? ''

    const resp = await fetch(
      `https://api.mipaquete.com/sendingtracking/${encodeURIComponent(mpCode)}?deliveryCompany=${encodeURIComponent(company)}`,
      {
        method: 'GET',
        headers: {
          'apikey':       apiKey,
          'Content-Type': 'application/json',
        },
      }
    )

    const respText = await resp.text()
    if (!resp.ok) {
      console.error('tracking error', resp.status, respText)
      return json({ error: 'Error al consultar tracking', status: resp.status, detail: respText.slice(0, 500) }, 200)
    }

    let parsed: any
    try { parsed = JSON.parse(respText) } catch { parsed = { raw: respText } }

    // Normalizar eventos al formato esperado por el frontend
    const eventos = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.events)
        ? parsed.events
        : Array.isArray(parsed?.tracking)
          ? parsed.tracking
          : parsed?.data
            ? (Array.isArray(parsed.data) ? parsed.data : [parsed.data])
            : []

    return json({
      sending_id:    mpCode,
      guia:          pedido.guia,
      transportadora: pedido.delivery_company_name,
      tracking:      eventos,
      raw:           parsed,
    })
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
