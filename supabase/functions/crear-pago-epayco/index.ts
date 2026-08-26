import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Comisión ePayco que se traslada al usuario.
// 3.5 % cubre tarjetas, PSE y Nequi en todos los planes.
// El fee fijo de $900 cubre el cargo base por transacción.
const EPAYCO_FEE_PCT  = 0.035   // 3.5 %
const EPAYCO_FEE_FIJO = 900     // COP

function calcularBruto(montoNeto: number): { fee: number; montoCobrar: number } {
  const fee        = Math.ceil(montoNeto * EPAYCO_FEE_PCT) + EPAYCO_FEE_FIJO
  const montoCobrar = montoNeto + fee
  return { fee, montoCobrar }
}

interface RecargaBody {
  monto: number   // monto_neto — lo que quedará acreditado en el wallet
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No autorizado' }, 401)
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !userRes?.user) {
      return json({ error: 'No autorizado' }, 401)
    }
    const user = userRes.user

    const body = (await req.json()) as RecargaBody
    const montoNeto = Number(body?.monto)
    if (!Number.isFinite(montoNeto) || montoNeto <= 0) {
      return json({ error: 'Monto inválido' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: cfg } = await supabaseAdmin
      .from('config_plataforma')
      .select('valor')
      .eq('clave', 'recarga_minima')
      .single()
    const recargaMinima = Number(cfg?.valor ?? 30000)

    if (montoNeto < recargaMinima) {
      return json({ error: `El monto mínimo de recarga es ${recargaMinima} COP` }, 400)
    }

    const { data: perfil } = await supabaseAdmin
      .from('perfiles')
      .select('id, nombre, email, telefono')
      .eq('id', user.id)
      .single()

    const publicKey  = Deno.env.get('EPAYCO_PUBLIC_KEY') ?? ''
    const test       = (Deno.env.get('EPAYCO_TEST') ?? 'false').toLowerCase() === 'true'
    const confirmUrl = Deno.env.get('EPAYCO_CONFIRM_URL_LANDAZURY') ??
                       `${Deno.env.get('SUPABASE_URL')}/functions/v1/epayco-webhook-landazury`
    const responseUrl = Deno.env.get('EPAYCO_RESPONSE_URL_LANDAZURY') ??
                        'https://landazury.vercel.app/wallet'

    if (!publicKey) {
      return json({ error: 'ePayco no configurado' }, 500)
    }

    const { fee, montoCobrar } = calcularBruto(montoNeto)
    const referencia = `lz_wallet_${user.id}_${Date.now()}`

    return json({
      referencia,
      monto_neto:    montoNeto,    // lo que se acreditará en el wallet
      monto_cobrar:  montoCobrar,  // lo que se cobrará al usuario
      fee_total:     fee,          // comisión trasladada
      checkout: {
        public_key:     publicKey,
        name:           'Recarga wallet Landazury',
        description:    `Recarga ${montoNeto.toLocaleString('es-CO')} COP (comisión pasarela incluida)`,
        invoice:        referencia,
        currency:       'cop',
        amount:         String(montoCobrar),          // bruto — lo que paga el usuario
        tax_base:       '0',
        tax:            '0',
        country:        'co',
        lang:           'es',
        external:       'false',
        extra1:         user.id,                      // perfil_id → webhook usa esto para identificar al usuario
        extra2:         'landazury_wallet',           // filtro de seguridad
        extra3:         String(montoNeto),            // monto_neto a acreditar → webhook usa esto para saber cuánto acreditar
        confirmation:   confirmUrl,
        response:       responseUrl,
        name_billing:   perfil?.nombre ?? user.email ?? '',
        address_billing: '',
        type_doc_billing: 'CC',
        mobilephone_billing: perfil?.telefono ?? '',
        number_doc_billing: '',
        email_billing:  user.email ?? perfil?.email ?? '',
        methodconfirmation: 'POST',
        test:           test ? 'true' : 'false',
      },
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
