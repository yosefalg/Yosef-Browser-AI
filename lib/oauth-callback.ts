import type { Session } from '@supabase/supabase-js';
import { getCurrentSession, getSupabase, syncCurrentUserProfileBestEffort } from '@/lib/auth';

const inFlightCodeExchanges = new Map<string, Promise<Session>>();

function oauthParams(url: string) {
  const question = url.indexOf('?');
  const hash = url.indexOf('#');
  const queryPart = question >= 0 ? url.slice(question + 1, hash >= 0 ? hash : undefined) : '';
  const hashPart = hash >= 0 ? url.slice(hash + 1) : '';
  return new URLSearchParams([queryPart, hashPart].filter(Boolean).join('&'));
}

function decodeOAuthMessage(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value.replace(/\+/g, ' ');
  }
}

export function normalizeOAuthError(message: string) {
  const decoded = decodeOAuthMessage(message || '');
  if (/unable to exchange external code/i.test(decoded)) {
    return new Error('GOOGLE_EXTERNAL_CODE_EXCHANGE_FAILED');
  }
  if (/provider.+not enabled|unsupported provider/i.test(decoded)) {
    return new Error('GOOGLE_PROVIDER_DISABLED');
  }
  return new Error(decoded || 'تعذر إكمال تسجيل الدخول بواسطة Google.');
}

async function waitForSession(timeoutMs = 900): Promise<Session | null> {
  const existing = await getCurrentSession().catch(() => null);
  if (existing?.user) return existing;

  const supabase = getSupabase();
  return new Promise<Session | null>((resolve) => {
    let finished = false;
    let unsubscribe = () => {};

    const finish = (session: Session | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(session);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish(session);
    });
    unsubscribe = () => data.subscription.unsubscribe();
  });
}

async function exchangeCodeOnce(code: string) {
  const current = inFlightCodeExchanges.get(code);
  if (current) return current;

  const exchange = (async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const recovered = await waitForSession(650);
      if (recovered?.user) return recovered;
      throw error;
    }
    if (!data.session?.user) throw new Error('لم تُنشأ جلسة Google صالحة.');
    return data.session;
  })();

  inFlightCodeExchanges.set(code, exchange);
  try {
    return await exchange;
  } finally {
    inFlightCodeExchanges.delete(code);
  }
}

export async function completeOAuthRedirect(url: string) {
  const params = oauthParams(url);
  const providerError = params.get('error_description') || params.get('error');
  if (providerError) throw normalizeOAuthError(providerError);

  let session = await waitForSession();
  if (!session) {
    const code = params.get('code');
    if (code) session = await exchangeCodeOnce(code);
  }

  if (!session) {
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await getSupabase().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      session = data.session;
    }
  }

  if (!session?.user) throw new Error('لم تُنشأ جلسة Google صالحة. أعد المحاولة.');
  await syncCurrentUserProfileBestEffort();
  return { session, user: session.user };
}
