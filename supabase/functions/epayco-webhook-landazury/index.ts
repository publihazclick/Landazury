// Webhook de confirmación ePayco para recargas del wallet de Landazury.
// ePayco envía POST con los parámetros de la transacción; verificamos la firma
// y, si x_cod_response = 1 (aceptada), acreditamos el wallet vía RPC.
//
// Campos usados:
//   x_extra1  = perfil_id del usuario
//   x_extra2  = 'landazury_wallet' (filtro de seguridad)
//   x_extra3  = monto_neto a acreditar en el wallet (lo que se le prometió al usuario)
//   x_amount  = monto bruto cobrado (neto + comisión pasarela)
//
// El webhook acredita x_extra3, NO x_amount, para que la comisión ePayco
// quede absorbida por el cargo bruto que ya pagó el usuario.
//
// Retrocompatibilidad: antes de implementar fee pass-through, x_extra3 == x_amount,
// por lo que pagos anteriores se acreditan correctamente con la misma lógica.
//
// Firma ePayco (v2):
//   x_signature = sha256(p_cust_id_cliente ^ p_key ^ x_ref_payco ^
//                        x_transaction_id ^ x_amount ^ x_currency_code)
// (^ = concatenación)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ePayco puede enviar POST con form o JSON
    let params: Record<string, string> = {}
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      params = await req.json()
    } else {
      const form = await req.formData()
      for (const [k, v] of form.entries()) params[k] = String(v)
    }

    const xRefPayco       = params['x_ref_payco']       ?? ''
    const xTransactionId  = params['x_transaction_id']  ?? ''
    const xAmount         = params['x_amount']          ?? ''
    const xCurrency       = params['x_currency_code']   ?? ''
    const xSignature      = (params['x_signature']      ?? '').toLowerCase()
    const xCodResponse    = params['x_cod_response']    ?? ''
    const xExtra1         = params['x_extra1']          ?? ''  // perfil_id
    const xExtra2         = params['x_extra2']          ?? ''  // 'landazury_wallet'
    const xExtra3         = params['x_extra3']          ?? ''  // monto_neto a acreditar
    const xIdInvoice      = params['x_id_invoice']      ?? params['x_ref_payco'] ?? ''

    if (xExtra2 !== 'landazury_wallet') {
      return json({ status: 'ignored', reason: 'extra2 mismatch' })
    }

    const custId  = Deno.env.get('EPAYCO_P_CUST_ID_CLIENTE') ?? ''
    const pKey    = Deno.env.get('EPAYCO_P_KEY')             ?? ''
    if (!custId || !pKey) {
      return json({ error: 'ePayco no configurado en secrets' }, 500)
    }

    // Verificar firma HMAC sobre el monto bruto cobrado (x_amount)
    const raw = `${custId}^${pKey}^${xRefPayco}^${xTransactionId}^${xAmount}^${xCurrency}`
    const expected = await sha256Hex(raw)
    if (expected.toLowerCase() !== xSignature) {
      console.error('Firma ePayco inválida', { expected, received: xSignature })
      return json({ error: 'Firma inválida' }, 401)
    }

    // x_cod_response: 1 aceptada, 2 rechazada, 3 pendiente, 4 fallida
    if (xCodResponse !== '1') {
      return json({
        status: 'no_acreditado',
        motivo: `x_cod_response=${xCodResponse}`,
      })
    }

    // Validar perfil_id
    if (!xExtra1 || xExtra1.length < 20) {
      return json({ error: 'perfil_id ausente en x_extra1' }, 400)
    }

    // Monto a acreditar: x_extra3 (neto prometido al usuario).
    // Si x_extra3 está vacío o inválido, rechazar — no acreditamos el bruto
    // para evitar acreditar la comisión de pasarela.
    const montoNeto = Number(xExtra3)
    if (!Number.isFinite(montoNeto) || montoNeto <= 0) {
      console.error('x_extra3 inválido', { xExtra3 })
      return json({ error: 'monto_neto ausente o inválido en x_extra3' }, 400)
    }

    // Sanidad: el neto a acreditar no puede superar el bruto cobrado (con margen de 1 COP por redondeo)
    const montoBruto = Number(xAmount)
    if (montoNeto > montoBruto + 1) {
      console.error('monto_neto > monto_bruto — posible manipulación', { montoNeto, montoBruto })
      return json({ error: 'monto_neto supera el monto cobrado' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Acreditar SOLO el monto_neto — la diferencia (fee) quedó en ePayco
    const { data, error } = await supabase.rpc('acreditar_wallet', {
      p_perfil_id:   xExtra1,
      p_monto:       montoNeto,
      p_referencia:  xIdInvoice,
      p_descripcion: `Recarga ePayco — ref ${xRefPayco}`,
    })

    if (error) {
      console.error('acreditar_wallet error', error)
      return json({ error: error.message }, 500)
    }

    return json({ status: 'ok', resultado: data, monto_acreditado: montoNeto })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error('webhook error', message)
    return json({ error: message }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
