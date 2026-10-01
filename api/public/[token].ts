// Read-only JSON for a published tracker: GET /api/public/<token>.
//
// A thin wrapper over the public_tracker() database function, which does the
// access control: it returns data only for a valid token, and anon can reach
// nothing else. This endpoint exists to give outside sites a stable, readable
// shape (values keyed by field name) instead of the raw schema, and to put a
// shared cache in front of the database.
//
// Only GET and OPTIONS are answered, and there is no write path behind either.

import {
  PUBLIC_TOKEN_PATTERN,
  toApiResponse,
  type PublicTrackerPayload,
} from '../../src/core/publicTracker';

// Vercel exposes the project's env vars to functions whatever their prefix, so
// the VITE_ ones the client build already uses work here too.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

// Short, because it is also how long a revoked or edited tracker can keep
// being served from the edge cache.
const CACHE_SECONDS = 60;

// Any site may read a public tracker; that is the feature. No credentials are
// ever involved, so a wildcard origin gives nothing away.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).pathname.split('/').pop() ?? '';
  if (!PUBLIC_TOKEN_PATTERN.test(token)) {
    return json({ error: 'not found' }, 404);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'server not configured' }, 500);
  }

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_tracker`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
  } catch {
    return json({ error: 'upstream unavailable' }, 502);
  }

  if (!response.ok) {
    return json({ error: 'upstream error' }, 502);
  }

  const payload = (await response.json()) as PublicTrackerPayload | null;
  if (!payload) {
    // Unknown and revoked tokens are indistinguishable by design.
    return json({ error: 'not found' }, 404, CACHE_SECONDS);
  }

  return json(toApiResponse(payload), 200, CACHE_SECONDS);
}

function json(body: unknown, status: number, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'content-type': 'application/json',
      'cache-control': maxAge
        ? `public, max-age=${maxAge}, s-maxage=${maxAge}`
        : 'no-store',
    },
  });
}
