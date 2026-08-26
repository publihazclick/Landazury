// Procesa notificaciones pendientes de un pedido y las envía vía Evolution API
// (WhatsApp). Llamada por:
//   - El frontend tras actualizar estado o crear pedido (pedido_id)
//   - El frontend tras pedir reenviar manualmente (notif_id)
// Si Evolution no está configurado en config_plataforma, marca cada notif
// como fallida con un mensaje claro y deja que el admin la reenvíe luego.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Body {
  pedido_id?: string
  notif_id?:  string
}

interface NotifRow {
  id: string
  pedido_id: string
  destinatario_telefono: string
  destinatario_tipo: 'vendedor' | 'cliente'
  destinatario_nombre: string | null
  mensaje: string
  estado: string
  intentos: number
  pedido?: { vendedor_id: string }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    // Validar usuario llamante
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

    // Verificar rol (admin/inventario o el propio vendedor del pedido)
    const { data: perfil } = await admin
      .from('perfiles')
      .select('rol')
      .eq('id', userRes.user.id)
      .single()
    const esStaff = perfil && ['admin', 'inventario'].includes(perfil.rol)

    const body = (await req.json()) as Body
    if (!body.pedido_id && !body.notif_id) {
      return json({ error: 'pedido_id o notif_id requerido' }, 400)
    }

    // Cargar config Evolution
    const { data: configRows } = await admin
      .from('config_plataforma')
      .select('clave, valor')
      .in('clave', ['notificaciones_whatsapp_activas', 'evolution_instance_name'])

    const config = Object.fromEntries((configRows ?? []).map(r => [r.clave, r.valor]))
    const activas = config['notificaciones_whatsapp_activas'] !== false
    const instance = String(config['evolution_instance_name'] ?? '').trim()

    if (!activas) {
      return json({ status: 'skipped', reason: 'notificaciones desactivadas' })
    }

    // Resolver lista de notificaciones a procesar (incluyendo el vendedor_id
    // para poder usar la instancia WhatsApp del vendedor en mensajes al cliente)
    let query = admin
      .from('notificaciones_pedidos')
      .select('id, pedido_id, destinatario_telefono, destinatario_tipo, destinatario_nombre, mensaje, estado, intentos, pedido:pedidos(vendedor_id)')
      .eq('estado', 'pendiente')

    if (body.notif_id) {
      query = query.eq('id', body.notif_id)
    } else if (body.pedido_id) {
      query = query.eq('pedido_id', body.pedido_id)

      // Si quien llama no es staff, validar que sea el dueño del pedido
      if (!esStaff) {
        const { data: pedido } = await admin
          .from('pedidos')
          .select('vendedor_id')
          .eq('id', body.pedido_id)
          .single()
        if (!pedido || pedido.vendedor_id !== userRes.user.id) {
          return json({ error: 'No autorizado' }, 403)
        }
      }
    }

    const { data: notifs } = await query as { data: NotifRow[] | null }
    if (!notifs || notifs.length === 0) {
      return json({ status: 'ok', sent: 0, failed: 0, total: 0 })
    }

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

    // Cache de instancias por vendedor_id para no consultar la BD múltiples
    // veces dentro del mismo lote
    const cacheVendedorInstance = new Map<string, { instance: string | null, conectada: boolean }>()

    async function instanciaDelVendedor(vendedorId: string) {
      if (cacheVendedorInstance.has(vendedorId)) {
        return cacheVendedorInstance.get(vendedorId)!
      }
      const { data: per } = await admin
        .from('perfiles')
        .select('whatsapp_instance_name, whatsapp_estado')
        .eq('id', vendedorId)
        .single()
      const result = {
        instance:  per?.whatsapp_instance_name ?? null,
        conectada: per?.whatsapp_estado === 'conectado',
      }
      cacheVendedorInstance.set(vendedorId, result)
      return result
    }

    let sent = 0
    let failed = 0

    for (const n of notifs) {
      // Para notificaciones al CLIENTE: usar la instancia del vendedor (para que
      // el mensaje salga del número del propio vendedor).
      // Para notificaciones al VENDEDOR: usar la instancia global de la plataforma.
      let instanceToUse: string | null = null
      let errorInstancia: string | null = null

      if (n.destinatario_tipo === 'cliente') {
        const vendedorId = (n as any).pedido?.vendedor_id
        if (vendedorId) {
          const v = await instanciaDelVendedor(vendedorId)
          if (v.instance && v.conectada) {
            instanceToUse = v.instance
          } else if (v.instance && !v.conectada) {
            errorInstancia = 'WhatsApp del vendedor no está conectado. El vendedor debe ir a "Mi WhatsApp" y escanear el QR.'
          } else {
            errorInstancia = 'El vendedor no ha conectado su WhatsApp todavía.'
          }
        } else {
          errorInstancia = 'No se pudo identificar al vendedor del pedido.'
        }
      } else {
        // Vendedor: instancia global
        instanceToUse = instance || null
        if (!instanceToUse) {
          errorInstancia = 'Falta el nombre de la instancia global (config: evolution_instance_name)'
        }
      }

      if (!evolutionUrl || !evolutionKey) {
        await admin
          .from('notificaciones_pedidos')
          .update({
            estado: 'fallido',
            ultimo_error: 'Evolution API no configurada (faltan secrets EVOLUTION_API_URL/KEY)',
            intentos: n.intentos + 1,
          })
          .eq('id', n.id)
        failed++
        continue
      }

      if (!instanceToUse) {
        await admin
          .from('notificaciones_pedidos')
          .update({
            estado: 'fallido',
            ultimo_error: errorInstancia ?? 'Instancia WhatsApp no disponible',
            intentos: n.intentos + 1,
          })
          .eq('id', n.id)
        failed++
        continue
      }

      try {
        const r = await fetch(`${evolutionUrl}/message/sendText/${encodeURIComponent(instanceToUse)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionKey,
          },
          body: JSON.stringify({
            number: n.destinatario_telefono,
            text:   n.mensaje,
          }),
        })

        const respJson = await r.json().catch(() => ({}))

        if (!r.ok) {
          await admin
            .from('notificaciones_pedidos')
            .update({
              estado: 'fallido',
              ultimo_error: `HTTP ${r.status}: ${JSON.stringify(respJson).slice(0, 400)}`,
              evolution_response: respJson,
              intentos: n.intentos + 1,
            })
            .eq('id', n.id)
          failed++
        } else {
          await admin
            .from('notificaciones_pedidos')
            .update({
              estado: 'enviado',
              enviado_en: new Date().toISOString(),
              evolution_response: respJson,
              intentos: n.intentos + 1,
              ultimo_error: null,
            })
            .eq('id', n.id)
          sent++
        }
      } catch (e: any) {
        await admin
          .from('notificaciones_pedidos')
          .update({
            estado: 'fallido',
            ultimo_error: String(e?.message ?? e).slice(0, 400),
            intentos: n.intentos + 1,
          })
          .eq('id', n.id)
        failed++
      }

      // Pausa entre envíos: anti-spam suave (transactional, pero por si acaso)
      await new Promise((res) => setTimeout(res, 800))
    }

    return json({ status: 'ok', sent, failed, total: notifs.length })

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
