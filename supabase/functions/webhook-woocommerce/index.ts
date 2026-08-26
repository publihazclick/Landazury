// Recibe pedidos nuevos desde una tienda WooCommerce vía webhook.
// URL pública: /webhook-woocommerce?token=<webhook_token>
// WooCommerce envía POST con JSON cuando el evento es "order.created".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url   = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return new Response('Token requerido', { status: 400 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: integ, error: integErr } = await admin
    .from('integraciones')
    .select('id, vendedor_id, activa, plataforma')
    .eq('webhook_token', token)
    .eq('plataforma', 'woocommerce')
    .single()

  if (integErr || !integ) {
    console.warn('WooCommerce webhook: token no encontrado', token)
    return new Response('OK', { status: 200 })
  }

  if (!integ.activa) return new Response('OK', { status: 200 })

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  const orderId     = String(payload.id ?? '')
  const orderNumber = payload.number ? `#${payload.number}` : orderId

  if (!orderId) return new Response('OK', { status: 200 })

  // WooCommerce usa shipping si está rellena, sino billing
  const shipping = payload.shipping ?? {}
  const billing  = payload.billing  ?? {}
  const addr     = (shipping.address_1 || shipping.city) ? shipping : billing

  const clienteNombre    = [addr.first_name, addr.last_name].filter(Boolean).join(' ').trim()
  const clienteTelefono  = addr.phone || billing.phone || ''
  const clienteEmail     = billing.email || ''
  const clienteDireccion = addr.address_1 || ''
  const clienteCiudad    = addr.city || ''
  const clienteDpto      = addr.state || ''

  const lineItems = (payload.line_items ?? []).map((li: any) => ({
    nombre:     li.name ?? li.product_name ?? '',
    cantidad:   Number(li.quantity ?? 1),
    precio:     String(li.price ?? li.subtotal ?? '0'),
    sku:        li.sku ?? '',
    product_id: li.product_id ?? null,
  }))

  const totalExterno = parseFloat(String(payload.total ?? '0')) || null
  const moneda       = payload.currency ?? 'COP'

  const { error: insertErr } = await admin
    .from('pedidos_externos')
    .insert({
      integracion_id:      integ.id,
      vendedor_id:         integ.vendedor_id,
      plataforma:          'woocommerce',
      order_id_externo:    orderId,
      order_number:        orderNumber,
      cliente_nombre:      clienteNombre    || null,
      cliente_email:       clienteEmail     || null,
      cliente_telefono:    clienteTelefono  || null,
      cliente_direccion:   clienteDireccion || null,
      cliente_ciudad:      clienteCiudad    || null,
      cliente_departamento: clienteDpto     || null,
      items_json:          lineItems,
      total_externo:       totalExterno,
      moneda,
      datos_raw:           payload,
    })
    .select('id')
    .single()

  if (insertErr && insertErr.code !== '23505') {
    console.error('WooCommerce webhook insert error', insertErr.message)
  }

  return new Response('OK', { status: 200 })
})
