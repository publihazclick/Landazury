// Admin/inventario: genera la guía de envío real en Mipaquete para un pedido
// ya creado. Usa config_plataforma para datos del remitente + datos del pedido
// para el destinatario. Tras éxito, guarda sending_id + guía en el pedido.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GenerarGuiaBody {
  pedido_id:       string
  request_pickup?: boolean
  comments?:       string
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

    // Verificar rol admin/inventario
    const { data: perfil } = await admin
      .from('perfiles')
      .select('rol')
      .eq('id', userRes.user.id)
      .single()

    const esAdminOInventario = perfil && ['admin','inventario'].includes(perfil.rol)
    const esVendedor         = perfil?.rol === 'usuario'

    if (!esAdminOInventario && !esVendedor) {
      return json({ error: 'No autorizado' }, 403)
    }

    const body = (await req.json()) as GenerarGuiaBody
    if (!body.pedido_id) return json({ error: 'pedido_id requerido' }, 400)

    // Pedido + producto con sucursal propia + subido_por para fallback
    const { data: pedido, error: pedidoErr } = await admin
      .from('pedidos')
      .select('*, producto:productos(id, nombre, peso_kg, alto_cm, ancho_cm, largo_cm, precio_base, subido_por, sucursal_id, sucursal:sucursales(dane_code, direccion, ciudad, sender_name, sender_surname, sender_cellphone, sender_email, sender_nit, sender_nit_type))')
      .eq('id', body.pedido_id)
      .single()

    if (pedidoErr || !pedido) return json({ error: 'Pedido no encontrado' }, 404)

    // Vendedor solo puede generar guía para sus propios pedidos
    if (esVendedor && pedido.vendedor_id !== userRes.user.id) {
      return json({ error: 'No autorizado para este pedido' }, 403)
    }
    if (pedido.mipaquete_sending_id) {
      return json({ error: 'Este pedido ya tiene guía generada', sending_id: pedido.mipaquete_sending_id }, 409)
    }
    if (!pedido.delivery_company_id) return json({ error: 'Pedido sin transportadora asignada' }, 400)
    if (!pedido.destino_dane_code) return json({ error: 'Pedido sin DANE destino' }, 400)

    // Config global + sucursal del subidor como fallback si el producto no tiene sucursal propia
    const subidoPor = pedido.producto?.subido_por ?? null
    const sucursalProducto = (pedido.producto as any)?.sucursal ?? null
    const [cfgResult, perfilResult] = await Promise.all([
      admin.from('config_plataforma').select('clave, valor').in('clave', [
        'origen_dane_code',
        'sender_name','sender_surname','sender_cellphone','sender_email',
        'sender_pickup_address','sender_nit','sender_nit_type',
      ]),
      (!sucursalProducto && subidoPor)
        ? admin.from('perfiles').select('sucursal_id, sucursales(dane_code, direccion, ciudad, sender_name, sender_surname, sender_cellphone, sender_email, sender_nit, sender_nit_type)').eq('id', subidoPor).single()
        : Promise.resolve({ data: null }),
    ])
    const cfg: Record<string, any> = {}
    for (const row of cfgResult.data ?? []) cfg[row.clave as string] = row.valor

    // Prioridad: sucursal del producto > sucursal del perfil del subidor > config global
    const suc = sucursalProducto ?? (perfilResult.data as any)?.sucursales ?? null

    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? ''
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500)

    // Armar payload
    const [nombreFirst, ...restNombre] = (pedido.cliente_nombre ?? '').trim().split(/\s+/)
    const apellidoCliente = restNombre.join(' ') || '.'

    // paymentType ePayco: 1 = ya pagado (anticipado), 101 = COD (cobro contra entrega)
    const paymentType = pedido.tipo_pago === 'cod' ? 101 : 1
    // Valor a recaudar al cliente final (solo COD):
    //   = precio que el vendedor puso al cliente
    //   + flete_cliente (lo que el cliente paga al domiciliario por el envío)
    // Mipaquete cobra su comisión (~5.5%) sobre este total, por eso ambos valores
    // deben incluirse para que el cálculo sea correcto.
    const precioVentaCliente = Math.round(Number(pedido.precio_venta_cliente ?? pedido.subtotal ?? 0))
    const fleteCliente       = Math.round(Number(pedido.flete ?? 0))  // flete_cliente guardado en pedidos.flete
    const valueCollection = pedido.tipo_pago === 'cod'
      ? precioVentaCliente + fleteCliente
      : 0
    // Valor declarado = costo real del producto (snapshot guardado en el pedido,
    // o precio_base actual del producto como fallback). NUNCA usar el precio
    // final al consumidor: Mipaquete cobra seguro/reposición sobre este valor.
    const cantidadPedido    = Number(pedido.cantidad ?? 1)
    const costoUnit         = Number(
      pedido.precio_costo_unitario ?? pedido.producto?.precio_base ?? 0
    )
    const declaredValue     = Math.max(
      1,
      Math.round(costoUnit * cantidadPedido) || 10000
    )

    // Peso con el mismo redondeo que usa cotizar-flete-mipaquete:
    // Math.max(1, ceil(peso)) → mínimo 1 kg, entero hacia arriba.
    // Esto garantiza que el precio de la guía coincide con el precio cotizado.
    // Sin este redondeo, billeteras (0.2 kg) y calzado (0.8 kg) podrían
    // ser rechazados por Mipaquete o cotizarse a un precio diferente.
    const pesoKgRaw   = Number(pedido.producto?.peso_kg ?? 1) || 1
    const pesoKgEnvio = Math.max(1, Math.ceil(pesoKgRaw))

    const sendingPayload = {
      sender: {
        name:          String(suc?.sender_name     ?? cfg['sender_name']     ?? 'Landazury'),
        surname:       String(suc?.sender_surname  ?? cfg['sender_surname']  ?? 'Dropshipping'),
        cellPhone:     String(suc?.sender_cellphone ?? cfg['sender_cellphone'] ?? '3134453649'),
        prefix:        '+57',
        email:         String(suc?.sender_email    ?? cfg['sender_email']    ?? ''),
        pickupAddress: String(suc?.direccion       ?? cfg['sender_pickup_address'] ?? ''),
        nit:           String(suc?.sender_nit      ?? cfg['sender_nit']      ?? ''),
        nitType:       String(suc?.sender_nit_type ?? cfg['sender_nit_type'] ?? 'CC'),
      },
      receiver: {
        name:                nombreFirst || 'Cliente',
        surname:             apellidoCliente,
        email:               '',
        prefix:              '+57',
        cellPhone:           String(pedido.cliente_telefono ?? ''),
        destinationAddress:  String(pedido.cliente_direccion ?? ''),
        nit:                 String(pedido.cliente_cedula ?? ''),
        nitType:             'CC',
      },
      productInformation: {
        quantity:         cantidadPedido,
        width:            Number(pedido.producto?.ancho_cm ?? 29) || 29,
        large:            Number(pedido.producto?.largo_cm ?? 30) || 30,
        height:           Number(pedido.producto?.alto_cm  ?? 18) || 18,
        weight:           pesoKgEnvio,
        forbiddenProduct: false,
        productReference: String(pedido.producto?.nombre ?? 'Producto'),
        declaredValue,
      },
      locate: {
        originDaneCode:  String(suc?.dane_code ?? pedido.origen_dane_code ?? cfg['origen_dane_code'] ?? '11001000'),
        destinyDaneCode: String(pedido.destino_dane_code),
      },
      channel:         'Landazury',
      deliveryCompany: String(pedido.delivery_company_id),
      criteria:        'price',
      description:     String(pedido.producto?.nombre ?? 'Producto dropshipping'),
      comments:        body.comments ?? '',
      paymentType,
      valueCollection,
      requestPickup:   !!body.request_pickup,
    }

    const sessionTracker = crypto.randomUUID()
    const resp = await fetch('https://api.mipaquete.com/createSending', {
      method: 'POST',
      headers: {
        'apikey':          apiKey,
        'session-tracker': sessionTracker,
        'Content-Type':    'application/json',
      },
      body: JSON.stringify(sendingPayload),
    })

    const respText = await resp.text()
    if (!resp.ok) {
      console.error('createSending error', resp.status, respText)
      return json({ error: 'Error al crear guía en Mipaquete', status: resp.status, detail: respText }, 502)
    }

    let parsed: any
    try { parsed = JSON.parse(respText) } catch { parsed = { raw: respText } }

    const sendingId = parsed?.mpCode ?? parsed?._id ?? parsed?.id ?? null
    const guia      = parsed?.guideNumber ?? parsed?.guide ?? parsed?.trackingNumber ?? sendingId

    await admin.rpc('registrar_guia_mipaquete', {
      p_pedido_id:      body.pedido_id,
      p_sending_id:     sendingId ?? '',
      p_guia:           guia ?? '',
      p_transportadora: pedido.delivery_company_name ?? null,
    })

    return json({
      status:        'ok',
      sending_id:    sendingId,
      guia:          guia,
      transportadora: pedido.delivery_company_name,
      mipaquete_response: parsed,
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
