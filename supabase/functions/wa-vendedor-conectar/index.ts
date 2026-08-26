// Crea la instancia Evolution del vendedor (si no existe) y retorna el QR
// para que el usuario lo escanee desde su WhatsApp. Idempotente.
//
// Llamada por: cualquier usuario autenticado (cada uno solo crea SU instancia)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const userId = userRes.user.id

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!evolutionUrl || !evolutionKey) {
      return json({ error: 'Evolution API no configurada' }, 500)
    }

    // Nombre determinístico: lz_<uuid sin guiones>
    const instanceName = 'lz_' + userId.replaceAll('-', '')

    // Intentar crear (idempotente: si ya existe, Evolution retorna 409 o similar
    // — ignoramos y consultamos el estado directamente)
    const createResp = await fetch(`${evolutionUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':       evolutionKey,
      },
      body: JSON.stringify({
        instanceName,
        qrcode:      true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    })

    let qrcode: string | null = null
    let estado = 'conectando'

    if (createResp.ok) {
      const created = await createResp.json().catch(() => ({}))
      // Evolution retorna { instance, qrcode: { base64, code, ... }, hash, ... }
      qrcode = created?.qrcode?.base64 ?? created?.qr?.base64 ?? created?.base64 ?? null
    }

    // Si no obtuvimos QR (instancia ya existía), pedirlo explícitamente
    if (!qrcode) {
      const connectResp = await fetch(`${evolutionUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
        method:  'GET',
        headers: { 'apikey': evolutionKey },
      })
      if (connectResp.ok) {
        const conn = await connectResp.json().catch(() => ({}))
        qrcode = conn?.base64 ?? conn?.qrcode?.base64 ?? conn?.qr?.base64 ?? null
        // Si ya está conectada, no hay QR sino estado open
        if (conn?.instance?.state === 'open' || conn?.state === 'open') {
          estado = 'conectado'
        }
      }
    }

    // Guardar/actualizar el perfil
    const updates: Record<string, unknown> = {
      whatsapp_instance_name: instanceName,
      whatsapp_estado:        estado,
      whatsapp_ultimo_check:  new Date().toISOString(),
    }
    if (estado === 'conectado') {
      updates.whatsapp_conectado_en = new Date().toISOString()
    }
    await admin.from('perfiles').update(updates).eq('id', userId)

    return json({
      status:        'ok',
      instance_name: instanceName,
      estado,
      qrcode,
      ya_conectado:  estado === 'conectado',
    })

  } catch (e: any) {
    return json({ error: e?.message ?? 'Error inesperado' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
