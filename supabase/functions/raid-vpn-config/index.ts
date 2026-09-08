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
const PROVISION_URL = Deno.env.get('RAID_VPN_PROVISION_URL') || '';
const PROVISION_TOKEN = Deno.env.get('RAID_VPN_PROVISION_TOKEN') || '';

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

function serviceHeaders(prefer?: string) {
  return {
    apikey: SERVICE_ROLE_KEY,
    authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    accept: 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

function validWireGuardConfig(value: string) {
  const config = value.trim();
  return config.includes('[Interface]')
    && config.includes('PrivateKey')
    && config.includes('[Peer]')
    && config.includes('PublicKey')
    && config.includes('Endpoint');
}

type Profile = {
  configText: string;
  updatedAt: string | null;
};

async function loadProfile(userId: string): Promise<Profile | null> {
  const endpoint = `${SUPABASE_URL}/rest/v1/raid_vpn_profiles?select=config_text,enabled,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
  const response = await fetch(endpoint, { headers: serviceHeaders() });
  if (!response.ok) throw new Error(`PROFILE_LOOKUP_${response.status}`);

  const rows = await response.json().catch(() => []) as Array<{
    config_text?: string;
    enabled?: boolean;
    updated_at?: string;
  }>;
  const row = rows[0];
  if (!row || !row.enabled) return null;

  const configText = typeof row.config_text === 'string' ? row.config_text.trim() : '';
  if (!validWireGuardConfig(configText)) throw new Error('PROFILE_INVALID');
  return {
    configText,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

async function saveProfile(userId: string, configText: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/raid_vpn_profiles?on_conflict=user_id`, {
    method: 'POST',
    headers: serviceHeaders('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify({
      user_id: userId,
      config_text: configText,
      enabled: true,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`PROFILE_SAVE_${response.status}`);
}

async function provisionProfile(userId: string): Promise<Profile | null> {
  if (!PROVISION_URL || !PROVISION_TOKEN) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(PROVISION_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${PROVISION_TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) throw new Error(`PROVISION_${response.status}`);

    const payload = await response.json().catch(() => null) as {
      configText?: string;
      config?: string;
    } | null;
    const configText = String(payload?.configText || payload?.config || '').trim();
    if (!validWireGuardConfig(configText)) throw new Error('PROVISION_INVALID_CONFIG');

    await saveProfile(userId, configText);
    return { configText, updatedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
  }
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
    let profile = await loadProfile(userId);
    let source: 'stored' | 'provisioned' = 'stored';

    if (!profile) {
      profile = await provisionProfile(userId);
      source = 'provisioned';
    }

    if (!profile) {
      return json({
        configured: false,
        reason: PROVISION_URL && PROVISION_TOKEN ? 'PROVISIONING_UNAVAILABLE' : 'NO_VPN_SERVER',
      });
    }

    return json({
      configured: true,
      configText: profile.configText,
      updatedAt: profile.updatedAt,
      source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    console.error('raid-vpn-config failure', message);
    if (message === 'PROFILE_INVALID') return json({ error: 'VPN_PROFILE_INVALID' }, 500);
    if (message.startsWith('PROVISION_')) {
      return json({ configured: false, reason: 'PROVISIONING_UNAVAILABLE' });
    }
    return json({ error: 'VPN_PROFILE_LOOKUP_FAILED' }, 502);
  }
});
