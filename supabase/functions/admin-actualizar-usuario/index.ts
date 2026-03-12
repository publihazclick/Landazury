import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Validate user token using anon client with Authorization header
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: requester }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !requester) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: perfilRequester } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .eq('id', requester.id)
      .single()

    if (perfilRequester?.rol !== 'admin') {
      return new Response(JSON.stringify({ error: 'Solo administradores pueden editar usuarios' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { userId, email, password, nombre, rol, pais, telefono } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authUpdate: Record<string, string> = {}
    if (email) authUpdate.email = email
    if (password) {
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      authUpdate.password = password
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdate)
      if (updateAuthError) {
        return new Response(JSON.stringify({ error: updateAuthError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const perfilUpdate: Record<string, string | null | undefined> = {}
    if (nombre !== undefined) perfilUpdate.nombre = nombre
    if (email !== undefined) perfilUpdate.email = email
    if (rol !== undefined) perfilUpdate.rol = rol
    if (pais !== undefined) perfilUpdate.pais = pais || null
    if (telefono !== undefined) perfilUpdate.telefono = telefono || null

    if (Object.keys(perfilUpdate).length > 0) {
      const { error: updatePerfilError } = await supabaseAdmin
        .from('perfiles')
        .update(perfilUpdate)
        .eq('id', userId)
      if (updatePerfilError) {
        return new Response(JSON.stringify({ error: updatePerfilError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? 'Error interno del servidor' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
