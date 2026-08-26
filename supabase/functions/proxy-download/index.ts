import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// IPs/hosts internos bloqueados para evitar SSRF
function esUrlSegura(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { url, filename } = await req.json();

    if (!url || !esUrlSegura(url)) {
      return json({ error: 'URL inválida' }, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
          'Accept': 'image/*,video/*,*/*;q=0.8',
          'Referer': new URL(url).origin + '/',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status} al obtener el recurso`);

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const blob = await res.arrayBuffer();
    const fname = (filename || 'descarga').replace(/[^\w\-. ]/g, '_');

    return new Response(blob, {
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'no-store',
      },
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
