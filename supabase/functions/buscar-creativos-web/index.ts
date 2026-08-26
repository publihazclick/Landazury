import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function limpiarNombre(nombre: string): string {
  return nombre
    .replace(/^(REF|ref|Ref|REFERENCIA|referencia)\s*[:\-]?\s*\d*\s*/i, '')
    .replace(/^\d+\s+/, '')
    .trim();
}

async function serperImages(key: string, q: string, num: number) {
  const r = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num, gl: 'co' }),
  });
  if (!r.ok) return [];
  const body = await r.json();
  return (body.images ?? []) as any[];
}


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { producto_id } = await req.json();
    if (!producto_id) return json({ error: 'producto_id requerido' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serperKey   = Deno.env.get('SERPER_API_KEY');
    const openaiKey   = Deno.env.get('OPENAI_API_KEY');

    if (!serperKey) {
      return json({ error: 'Configura SERPER_API_KEY en Supabase secrets' }, 400);
    }

    // Videos desactivados por ahora — solo imágenes

    const db = createClient(supabaseUrl, serviceKey);

    const { data: prod } = await db
      .from('productos')
      .select('id, nombre, descripcion, imagenes, categoria:categorias(nombre)')
      .eq('id', producto_id)
      .single();

    if (!prod) return json({ error: 'Producto no encontrado' }, 404);

    const cat      = (prod.categoria as any)?.nombre ?? '';
    const nombreLimpio = limpiarNombre(prod.nombre as string);
    const desc     = ((prod.descripcion as string) ?? '').split(' ').slice(0, 8).join(' ');
    const imagenUrl = (prod.imagenes as string[])?.[0] ?? null;

    // ── Query base ────────────────────────────────────────────────
    let queryBase = [nombreLimpio, cat].filter(Boolean).join(' ');

    // ── Enriquecer con GPT-4o Vision ─────────────────────────────
    // GPT-4o genera 3 queries distintos: exacto, shopping y en inglés
    let queries: string[] = [queryBase];

    if (openaiKey && (imagenUrl || desc)) {
      try {
        const content: any[] = [];
        if (imagenUrl) {
          content.push({ type: 'image_url', image_url: { url: imagenUrl, detail: 'low' } });
        }
        content.push({
          type: 'text',
          text: `Producto: "${nombreLimpio}" | Categoría: "${cat}"${desc ? ` | Descripción: "${desc}"` : ''}.
${imagenUrl ? 'Analiza la imagen adjunta y el nombre del producto.' : 'Analiza el nombre del producto.'}
Genera exactamente 3 queries de búsqueda para Google Images, separados por el carácter "|":
1. Query con marca, modelo, color y tipo exacto (más específico posible)
2. Mismo query pero agregando palabras de compra: "comprar precio tienda"
3. El mismo concepto en inglés para ampliar resultados internacionales
Responde SOLO los 3 queries separados por "|", sin numeración ni explicación.`,
        });

        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'user', content }],
            max_tokens: 120,
          }),
        });
        if (r.ok) {
          const vd = await r.json();
          const raw = vd.choices?.[0]?.message?.content?.trim() ?? '';
          const parts = raw.split('|').map((s: string) => s.trim()).filter((s: string) => s.length > 2);
          if (parts.length >= 2) queries = parts.slice(0, 3);
          else if (parts.length === 1) queries = [parts[0]];
        }
      } catch { /* usa queryBase */ }
    }

    // ── Búsquedas en paralelo ─────────────────────────────────────
    // 100 imágenes y 20 videos por query, todos en paralelo
    const [q1, q2, q3] = [queries[0], queries[1] ?? queries[0], queries[2] ?? queries[0]];

    const [imgs1, imgs2, imgs3] = await Promise.all([
      serperImages(serperKey, q1, 100),
      serperImages(serperKey, q2, 100),
      serperImages(serperKey, q3, 100),
    ]);

    // Deduplicar por URL
    const seenUrls = new Set<string>();
    const rows: Record<string, unknown>[] = [];

    const addImg = (img: any) => {
      if (!img.imageUrl || seenUrls.has(img.imageUrl)) return;
      seenUrls.add(img.imageUrl);
      rows.push({
        nombre:          img.title || nombreLimpio,
        descripcion:     img.source || 'Google Images',
        tipo:            'imagen',
        archivo_url:     img.imageUrl,
        archivo_path:    null,
        tamano:          null,
        extension:       img.imageUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg',
        producto_id,
        publico:         false,
        fuente:          'web',
        estado_revision: 'sugerido',
        fuente_nombre:   'Google',
      });
    };

    for (const img of imgs1) addImg(img);
    for (const img of imgs2) addImg(img);
    for (const img of imgs3) addImg(img);

    // Limpiar sugerencias anteriores
    await db
      .from('creativos')
      .delete()
      .eq('producto_id', producto_id)
      .eq('fuente', 'web')
      .in('estado_revision', ['sugerido', 'rechazado']);

    if (rows.length > 0) {
      const { error } = await db.from('creativos').insert(rows);
      if (error) throw error;
    }

    return json({
      ok:          true,
      imagenes:    rows.filter(r => r.tipo === 'imagen').length,
      videos:      rows.filter(r => r.tipo === 'video').length,
      total:       rows.length,
      queries_usados: queries,
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
