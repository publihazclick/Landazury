// Recibe pedidos nuevos desde una tienda Shopify vía webhook.
// URL pública: /webhook-shopify?token=<webhook_token>
// El token identifica la integración del vendedor.
// No requiere Authorization header — Shopify llama desde sus servidores.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Shopify solo usa POST para webhooks
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url    = new URL(req.url)
  const token  = url.searchParams.get('token')
  if (!token) return new Response('Token requerido', { status: 400 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Identificar la integración por su webhook_token
  const { data: integ, error: integErr } = await admin
    .from('integraciones')
    .select('id, vendedor_id, activa, plataforma')
    .eq('webhook_token', token)
    .eq('plataforma', 'shopify')
    .single()

  if (integErr || !integ) {
    console.warn('Shopify webhook: token no encontrado', token)
    return new Response('OK', { status: 200 }) // siempre 200 para Shopify
  }

  if (!integ.activa) {
    return new Response('OK', { status: 200 })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Extraer datos clave del pedido Shopify
  const orderId     = String(payload.id ?? payload.order_id ?? '')
  const orderNumber = payload.order_number ? `#${payload.order_number}` : String(payload.name ?? orderId)

  if (!orderId) return new Response('OK', { status: 200 })

  // Dirección de envío tiene prioridad; si no existe, usar billing
  const addr    = payload.shipping_address ?? payload.billing_address ?? {}
  const billing = payload.billing_address  ?? {}

  const clienteNombre   = [addr.first_name, addr.last_name].filter(Boolean).join(' ').trim()
    || [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim()
  const clienteTelefono = addr.phone || billing.phone || ''
  const clienteEmail    = billing.email || payload.email || ''
  const clienteDireccion= addr.address1 || ''
  const clienteCiudad   = addr.city || ''
  const clienteDpto     = addr.province || addr.province_code || ''

  const lineItems = (payload.line_items ?? []).map((li: any) => ({
    nombre:    li.title ?? li.name ?? '',
    cantidad:  Number(li.quantity ?? 1),
    precio:    li.price ?? li.price_set?.shop_money?.amount ?? '0',
    sku:       li.sku ?? '',
    product_id: li.product_id ?? null,
  }))

  const totalExterno = parseFloat(payload.total_price ?? payload.subtotal_price ?? '0') || null
  const moneda       = payload.currency ?? 'COP'

  // Insertar en pedidos_externos (ignorar duplicados — idempotencia)
  const { error: insertErr } = await admin
    .from('pedidos_externos')
    .insert({
      integracion_id:   integ.id,
      vendedor_id:      integ.vendedor_id,
      plataforma:       'shopify',
      order_id_externo: orderId,
      order_number:     orderNumber,
      cliente_nombre:   clienteNombre   || null,
      cliente_email:    clienteEmail    || null,
      cliente_telefono: clienteTelefono || null,
      cliente_direccion: clienteDireccion || null,
      cliente_ciudad:   clienteCiudad   || null,
      cliente_departamento: clienteDpto || null,
      items_json:       lineItems,
      total_externo:    totalExterno,
      moneda,
      datos_raw:        payload,
    })
    .select('id')
    .single()

  if (insertErr && insertErr.code !== '23505') { // 23505 = unique violation (duplicado OK)
    console.error('Shopify webhook insert error', insertErr.message)
  }

  return new Response('OK', { status: 200 })
})
