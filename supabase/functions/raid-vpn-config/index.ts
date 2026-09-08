declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

function bearer(req: Request) {
  const value = req.headers.get('authorization') || '';
  return value.toLowerCase().startsWith('bearer ') ? value : '';
}

async function getUserId(auth: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: SUPABASE_ANON_KEY },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as { id?: string } | null;
  return payload?.id ? String(payload.id) : null;
}

function validWireGuardConfig(value: string) {
  const config = value.trim();
  return config.includes('[Interface]') && config.includes('[Peer]') && config.includes('Endpoint');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const auth = bearer(req);
  if (!auth) return json({ error: 'UNAUTHORIZED' }, 401);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return json({ error: 'VPN_SERVICE_NOT_CONFIGURED' }, 503);
  }

  const userId = await getUserId(auth);
  if (!userId) return json({ error: 'UNAUTHORIZED' }, 401);

  try {
    const endpoint = `${SUPABASE_URL}/rest/v1/raid_vpn_profiles?select=config_text,enabled,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        accept: 'application/json',
      },
    });
    if (!response.ok) {
      console.error('raid-vpn-config profile lookup failed', response.status);
      return json({ error: 'VPN_PROFILE_LOOKUP_FAILED' }, 502);
    }

    const rows = await response.json().catch(() => []) as Array<{
      config_text?: string;
      enabled?: boolean;
      updated_at?: string;
    }>;
    const row = rows[0];
    if (!row || !row.enabled) {
      return json({ configured: false, reason: 'NO_PROFILE' });
    }

    const configText = typeof row.config_text === 'string' ? row.config_text.trim() : '';
    if (!validWireGuardConfig(configText)) {
      console.error('raid-vpn-config invalid profile for user', userId);
      return json({ error: 'VPN_PROFILE_INVALID' }, 500);
    }

    return json({
      configured: true,
      configText,
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    });
  } catch (error) {
    console.error('raid-vpn-config unexpected failure', error);
    return json({ error: 'VPN_PROFILE_LOOKUP_FAILED' }, 502);
  }
});
