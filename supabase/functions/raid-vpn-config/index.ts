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
const PRIMARY_PROVISION_URL = Deno.env.get('RAID_VPN_PROVISION_URL') || '';
const PROVISION_URLS = Deno.env.get('RAID_VPN_PROVISION_URLS') || '';
const PROVISION_TOKEN = Deno.env.get('RAID_VPN_PROVISION_TOKEN') || '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

function bearer(req: Request) {
  const value = req.headers.get('authorization') || '';
  return value.toLowerCase().startsWith('bearer ') ? value : '';
}

function providerUrls() {
  const raw = [PRIMARY_PROVISION_URL, ...PROVISION_URLS.split(',')]
    .map((value) => value.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const value of raw) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:') continue;
      const normalized = parsed.toString();
      if (!unique.includes(normalized)) unique.push(normalized);
    } catch {}
  }
  return unique.slice(0, 4);
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
  const config = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!config || config.length > 32768 || config.includes('\0')) return false;
  return /^\s*\[Interface\]/im.test(config)
    && /^\s*PrivateKey\s*=\s*\S+/im.test(config)
    && /^\s*\[Peer\]/im.test(config)
    && /^\s*PublicKey\s*=\s*\S+/im.test(config)
    && /^\s*Endpoint\s*=\s*\S+/im.test(config)
    && /^\s*AllowedIPs\s*=\s*\S+/im.test(config);
}

type Profile = {
  configText: string;
  updatedAt: string | null;
};

type ProvisionResult = Profile & {
  providerIndex: number;
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

async function requestProvider(url: string, userId: string, providerIndex: number): Promise<ProvisionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${PROVISION_TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'x-raid-vpn-client': 'supabase-provisioner-v3',
      },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) throw new Error(`PROVIDER_${providerIndex}_${response.status}`);

    const payload = await response.json().catch(() => null) as {
      configText?: string;
      config?: string;
    } | null;
    const configText = String(payload?.configText || payload?.config || '').trim();
    if (!validWireGuardConfig(configText)) throw new Error(`PROVIDER_${providerIndex}_INVALID_CONFIG`);

    await saveProfile(userId, configText);
    return { configText, updatedAt: new Date().toISOString(), providerIndex };
  } finally {
    clearTimeout(timeout);
  }
}

async function provisionProfile(userId: string): Promise<ProvisionResult | null> {
  const urls = providerUrls();
  if (!urls.length || !PROVISION_TOKEN) return null;

  let lastError: unknown = null;
  for (let index = 0; index < urls.length; index += 1) {
    try {
      return await requestProvider(urls[index], userId, index);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : 'UNKNOWN';
      console.warn('raid-vpn provider unavailable', index, message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'));
    }
  }
  if (lastError) throw new Error('PROVISIONING_ALL_PROVIDERS_FAILED');
  return null;
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

  const urls = providerUrls();

  try {
    let profile = await loadProfile(userId);
    let source: 'stored' | 'provisioned' = 'stored';
    let providerIndex: number | null = null;

    if (!profile) {
      const provisioned = await provisionProfile(userId);
      if (provisioned) {
        profile = provisioned;
        providerIndex = provisioned.providerIndex;
      }
      source = 'provisioned';
    }

    if (!profile) {
      return json({
        configured: false,
        reason: urls.length && PROVISION_TOKEN ? 'PROVISIONING_UNAVAILABLE' : 'NO_VPN_SERVER',
        providerCount: urls.length,
      });
    }

    return json({
      configured: true,
      configText: profile.configText,
      updatedAt: profile.updatedAt,
      source,
      providerIndex,
      providerCount: urls.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    console.error('raid-vpn-config failure', message);
    if (message === 'PROFILE_INVALID') return json({ error: 'VPN_PROFILE_INVALID' }, 500);
    if (message.startsWith('PROVISIONING_') || message.startsWith('PROVIDER_')) {
      return json({ configured: false, reason: 'PROVISIONING_UNAVAILABLE', providerCount: urls.length });
    }
    return json({ error: 'VPN_PROFILE_LOOKUP_FAILED' }, 502);
  }
});
