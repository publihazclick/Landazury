// Cotiza con Mipaquete y suma la ganancia configurada (default 3000 COP)
// al costo de cada transportadora antes de devolverlo al cliente.
// Entrada: { producto_id, destino_dane_code, cantidad?, declared_value? }
//
// declaredValue = costo del producto (precio_base * cantidad). Es el valor que
// Mipaquete usa para calcular seguro y reposición — debe reflejar lo que vale
// la mercancía para nosotros, NO el precio final al consumidor. Si se sobre-
// declara, Mipaquete cobra más caro y la operación pierde dinero.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CotizarBody {
  producto_id:           string
  destino_dane_code:     string
  cantidad?:             number
  declared_value?:       number
  precio_venta_cliente?: number  // precio que el vendedor le cobrará al cliente (para saleValue)
}

interface Carrier {
  deliveryCompanyId:   string
  deliveryCompanyName: string
  deliveryCompanyImgUrl?: string
  shippingCost:        number
  shippingTime?:       number
  pickupTime?:         number
  pickupService?:      boolean
  singleOfficeDelivery?: boolean
  score?:              number
  id:                  string   // quote id
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

    const body = (await req.json()) as CotizarBody
    const productoId    = body.producto_id
    const destinoCode   = (body.destino_dane_code ?? '').toString().trim()
    const cantidad      = Math.max(1, Number(body.cantidad ?? 1))

    if (!productoId || !destinoCode) {
      return json({ error: 'producto_id y destino_dane_code son requeridos' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Producto → peso, dimensiones, precio, subidor, sucursal propia
    const { data: producto, error: prodErr } = await admin
      .from('productos')
      .select('id, nombre, precio_base, precio_final, precio_sugerido, peso_kg, alto_cm, ancho_cm, largo_cm, disponible, subido_por, sucursal_id, sucursal:sucursales(dane_code)')
      .eq('id', productoId)
      .single()

    if (prodErr || !producto || !producto.disponible) {
      return json({ error: 'Producto no disponible' }, 400)
    }

    const precioUnit = Number(
      producto.precio_final ?? producto.precio_sugerido ?? producto.precio_base ?? 0
    )
    const precioCosto = Number(producto.precio_base ?? precioUnit)
    const declaredValue = Math.max(1, Number(body.declared_value ?? precioCosto * cantidad))

    // 2. Config global + sucursal del subidor como fallback
    // Prioridad: sucursal del producto > sucursal del subidor (perfil) > config global
    const [cfgRes, perfilRes] = await Promise.all([
      admin.from('config_plataforma').select('clave, valor').in('clave', ['origen_dane_code', 'ganancia_flete']),
      (!producto.sucursal_id && producto.subido_por)
        ? admin.from('perfiles').select('sucursal_id, sucursales(dane_code)').eq('id', producto.subido_por).single()
        : Promise.resolve({ data: null }),
    ])

    const cfgMap: Record<string, any> = {}
    for (const row of cfgRes.data ?? []) cfgMap[row.clave as string] = row.valor

    const daneProducto  = (producto.sucursal as any)?.dane_code
    const danePerfil    = (perfilRes.data as any)?.sucursales?.dane_code
    const origenCode    = String(daneProducto ?? danePerfil ?? cfgMap['origen_dane_code'] ?? '11001000')
    const ganancia      = Number(cfgMap['ganancia_flete'] ?? 3000)

    // 3. Llamar a Mipaquete
    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? ''
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500)

    const sessionTracker = crypto.randomUUID()

    // Mipaquete requiere weight >= 1 kg (entero o decimal). Sub-kilos como 0.2
    // (billeteras) o 0.8 (calzado) los redondeamos hacia arriba a 1 kg para
    // que la cotización pase. El peso real queda guardado en el producto para
    // referencia interna pero no se cobra menos por menor peso.
    const pesoKgReal = Number(producto.peso_kg ?? 1) || 1
    const pesoKgEnvio = Math.max(1, Math.ceil(pesoKgReal))

    // saleValue = precio de catálogo × cantidad.
    // Usamos el precio del producto (no el precio que el vendedor le cobra al cliente)
    // porque Mipaquete valida que saleValue sea coherente con declaredValue.
    // El precio_venta_cliente del vendedor puede ser muy diferente al costo declarado
    // y causa que Mipaquete devuelva 0 cotizaciones.
    const saleValue = Math.max(1, Math.round(precioUnit * cantidad))

    const mipaquetePayload = {
      originLocationCode:  origenCode,
      destinyLocationCode: destinoCode,
      height:  Number(producto.alto_cm  ?? 18) || 18,
      width:   Number(producto.ancho_cm ?? 29) || 29,
      length:  Number(producto.largo_cm ?? 30) || 30,
      weight:  pesoKgEnvio,
      quantity: cantidad,
      declaredValue: declaredValue,
      saleValue:     saleValue,
    }

    let resp: Response
    try {
      resp = await fetch('https://api.mipaquete.com/quoteShipping', {
        method: 'POST',
        headers: {
          'apikey':          apiKey,
          'session-tracker': sessionTracker,
          'Content-Type':    'application/json',
        },
        body: JSON.stringify(mipaquetePayload),
      })
    } catch (fetchErr: any) {
      console.error('Mipaquete fetch threw', fetchErr?.message, JSON.stringify(mipaquetePayload))
      return json({
        error: 'No se pudo contactar a Mipaquete',
        detail: fetchErr?.message ?? 'network error',
        payload_sent: mipaquetePayload,
      }, 200)
    }

    if (!resp.ok) {
      const detail = await resp.text()
      console.error('Mipaquete non-2xx', resp.status, detail, JSON.stringify(mipaquetePayload))
      return json({
        error: 'Mipaquete rechazó la cotización: ' + detail.slice(0, 500),
        status: resp.status,
        detail,
        payload_sent: mipaquetePayload,
      }, 200)
    }

    const raw = (await resp.json()) as Carrier[]

    // 4. Sumar ganancia + comisión de recaudo (solo COD) y normalizar.
    //
    // Para COD, Mipaquete cobra 5.5% sobre valueCollection = precio_venta + flete_cliente.
    // Esto significa que el flete mismo también paga comisión (efecto circular).
    // La fórmula correcta que garantiza ganancia = G exacta:
    //   flete_cliente = (flete_mipaquete + G + precio_venta × T) / (1 − T)
    // donde T = 0.055
    const TASA_RECAUDO = 0.055
    const precioVentaClienteNum = body.precio_venta_cliente ? Number(body.precio_venta_cliente) : 0

    const cotizaciones = (Array.isArray(raw) ? raw : []).map(c => {
      const fleteMP = Number(c.shippingCost)
      let fleteCliente: number
      let comisionRecaudo: number
      if (precioVentaClienteNum > 0) {
        // COD: formula algebraica que garantiza ganancia exacta sin importar el precio
        fleteCliente    = Math.ceil((fleteMP + ganancia + precioVentaClienteNum * TASA_RECAUDO) / (1 - TASA_RECAUDO))
        comisionRecaudo = fleteCliente - fleteMP - ganancia
      } else {
        // Anticipado: sin comisión de recaudo
        fleteCliente    = fleteMP + ganancia
        comisionRecaudo = 0
      }
      return {
        quote_id:              c.id,
        delivery_company_id:   c.deliveryCompanyId,
        delivery_company_name: c.deliveryCompanyName,
        logo_url:              c.deliveryCompanyImgUrl ?? null,
        flete_mipaquete:       fleteMP,
        flete_cliente:         fleteCliente,
        comision_recaudo:      comisionRecaudo,
        tiempo_min:            c.shippingTime ?? null,
        score:                 c.score ?? null,
        solo_entrega_oficina:  !!c.singleOfficeDelivery,
        pickup_service:        !!c.pickupService,
      }
    })

    cotizaciones.sort((a, b) => a.flete_cliente - b.flete_cliente)

    // 5. Guardar en cache (server-authoritative) — el RPC crear_pedido leerá
    //    estos valores en lugar de confiar en lo que mande el cliente.
    //    TTL: 30 minutos. Uso de upsert para idempotencia si el user re-cotiza.
    if (cotizaciones.length > 0) {
      const expiraEn = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      const cacheRows = cotizaciones.map(c => ({
        vendedor_id:         userRes.user!.id,
        quote_id:            c.quote_id,
        delivery_company_id: c.delivery_company_id,
        flete_mipaquete:     c.flete_mipaquete,
        flete_cliente:       c.flete_cliente,
        ganancia:            ganancia,
        expira_en:           expiraEn,
        usado:               false,
      }))
      // Ignoramos errores de cache — si falla la escritura, el fallback del RPC
      // acepta el valor del cliente con validación mínima.
      await admin
        .from('cotizaciones_cache')
        .upsert(cacheRows, {
          onConflict:       'vendedor_id,quote_id,delivery_company_id',
          ignoreDuplicates: false,  // actualiza expira_en y usado=false si re-cotiza
        })
        .then(({ error }) => {
          if (error) console.warn('cotizaciones_cache upsert warn:', error.message)
        })
    }

    return json({
      producto: {
        id:         producto.id,
        nombre:     producto.nombre,
        precio:     precioUnit,
        peso_kg:    producto.peso_kg,
        alto_cm:    producto.alto_cm,
        ancho_cm:   producto.ancho_cm,
        largo_cm:   producto.largo_cm,
      },
      origen_dane_code:  origenCode,
      destino_dane_code: destinoCode,
      cantidad,
      declared_value:    declaredValue,
      ganancia_plataforma: ganancia,
      cotizaciones,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    const stack = error instanceof Error ? error.stack : undefined
    console.error('cotizar-flete crashed:', message, stack)
    // Devolvemos 200 con error en body para que supabase-js exponga el detalle
    // al frontend (con 4xx/5xx, supabase-js no propaga el body al cliente).
    return json({ error: message, stack }, 200)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
