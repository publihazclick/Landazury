// Consulta el estado de conexión de la instancia WhatsApp del vendedor
// y lo persiste en su perfil. El front lo polea cada pocos segundos
// mientras el usuario está en la pantalla de conexión.

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

    const { data: perfil } = await admin
      .from('perfiles')
      .select('whatsapp_instance_name, whatsapp_estado, whatsapp_numero')
      .eq('id', userId)
      .single()

    if (!perfil?.whatsapp_instance_name) {
      return json({ estado: 'desconectado', conectado: false })
    }

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!evolutionUrl || !evolutionKey) {
      return json({ estado: perfil.whatsapp_estado ?? 'desconectado', conectado: false })
    }

    const r = await fetch(
      `${evolutionUrl}/instance/connectionState/${encodeURIComponent(perfil.whatsapp_instance_name)}`,
      { headers: { apikey: evolutionKey } }
    )

    let estadoRemoto = 'desconectado'
    let numero: string | null = null

    if (r.ok) {
      const body = await r.json().catch(() => ({}))
      // Evolution v2: { instance: { instanceName, state: 'open'|'close'|'connecting' } }
      const state = body?.instance?.state ?? body?.state
      if (state === 'open') estadoRemoto = 'conectado'
      else if (state === 'connecting') estadoRemoto = 'conectando'
      else if (state === 'close') estadoRemoto = 'desconectado'

      numero = body?.instance?.owner ?? body?.instance?.profileName ?? null
      // owner viene como "57XXXX...@s.whatsapp.net" — nos quedamos con la parte antes del @
      if (typeof numero === 'string' && numero.includes('@')) {
        numero = numero.split('@')[0]
      }
    }

    const updates: Record<string, unknown> = {
      whatsapp_estado:       estadoRemoto,
      whatsapp_ultimo_check: new Date().toISOString(),
    }
    if (estadoRemoto === 'conectado') {
      if (numero && !perfil.whatsapp_numero) updates.whatsapp_numero = numero
      if (perfil.whatsapp_estado !== 'conectado') {
        updates.whatsapp_conectado_en = new Date().toISOString()
      }
    }

    await admin.from('perfiles').update(updates).eq('id', userId)

    return json({
      estado:    estadoRemoto,
      conectado: estadoRemoto === 'conectado',
      numero:    numero ?? perfil.whatsapp_numero ?? null,
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
