interface Env { MEDIA_SIGNING_SECRET: string }

function cors(headers = new Headers()) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  return headers;
}

async function verifyJwt(token: string, secret: string): Promise<any> {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new Error('invalid token');
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  if (!(await crypto.subtle.verify('HMAC', key, bytes, data))) throw new Error('invalid signature');
  const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  if (!claims.exp || Date.now() / 1000 >= claims.exp) throw new Error('expired token');
  return claims;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    if (url.pathname !== '/manifest') return new Response('Not found', { status: 404 });
    try {
      const claims = await verifyJwt(url.searchParams.get('token') || '', env.MEDIA_SIGNING_SECRET);
      const upstream = await fetch(claims.source, { headers: request.headers });
      const headers = cors(new Headers(upstream.headers));
      headers.set('Cache-Control', 'private, no-store');
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'unauthorized' }, { status: 401, headers: cors() });
    }
  }
};
