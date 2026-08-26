// Desconecta y elimina la instancia Evolution del vendedor.

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
      .select('whatsapp_instance_name')
      .eq('id', userId)
      .single()

    const instance = perfil?.whatsapp_instance_name
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

    if (instance && evolutionUrl && evolutionKey) {
      // Logout (cierra sesión WhatsApp)
      await fetch(`${evolutionUrl}/instance/logout/${encodeURIComponent(instance)}`, {
        method:  'DELETE',
        headers: { apikey: evolutionKey },
      }).catch(() => {})

      // Delete (elimina la instancia)
      await fetch(`${evolutionUrl}/instance/delete/${encodeURIComponent(instance)}`, {
        method:  'DELETE',
        headers: { apikey: evolutionKey },
      }).catch(() => {})
    }

    await admin
      .from('perfiles')
      .update({
        whatsapp_instance_name: null,
        whatsapp_estado:        'desconectado',
        whatsapp_numero:        null,
        whatsapp_conectado_en:  null,
        whatsapp_ultimo_check:  new Date().toISOString(),
      })
      .eq('id', userId)

    return json({ status: 'ok' })

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
