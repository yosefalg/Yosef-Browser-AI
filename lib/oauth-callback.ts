import type { Session } from '@supabase/supabase-js';
import { getCurrentSession, getSupabase, syncCurrentUserProfileBestEffort } from '@/lib/auth';

const inFlightCodeExchanges = new Map<string, Promise<Session>>();
const completedCodeExchanges = new Map<string, { session: Session; expiresAt: number }>();
const COMPLETED_CODE_TTL_MS = 120_000;

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
  if (decoded === 'GOOGLE_EXTERNAL_CODE_EXCHANGE_FAILED' || /unable to exchange external code/i.test(decoded)) {
    return new Error('GOOGLE_EXTERNAL_CODE_EXCHANGE_FAILED');
  }
  if (decoded === 'GOOGLE_PROVIDER_DISABLED' || /provider.+not enabled|unsupported provider/i.test(decoded)) {
    return new Error('GOOGLE_PROVIDER_DISABLED');
  }
  if (/code verifier|pkce/i.test(decoded)) {
    return new Error('GOOGLE_PKCE_SESSION_MISMATCH');
  }
  return new Error(decoded || 'تعذر إكمال تسجيل الدخول بواسطة Google.');
}

async function waitForSession(timeoutMs = 1500): Promise<Session | null> {
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

function getCompletedExchange(code: string) {
  const cached = completedCodeExchanges.get(code);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    completedCodeExchanges.delete(code);
    return null;
  }
  return cached.session;
}

async function exchangeCodeOnce(code: string) {
  const completed = getCompletedExchange(code);
  if (completed?.user) return completed;

  const current = inFlightCodeExchanges.get(code);
  if (current) return current;

  const exchange = (async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const recovered = await waitForSession(1200);
      if (recovered?.user) return recovered;
      throw normalizeOAuthError(error.message);
    }
    if (!data.session?.user) throw new Error('لم تُنشأ جلسة Google صالحة.');
    return data.session;
  })();

  inFlightCodeExchanges.set(code, exchange);
  try {
    const session = await exchange;
    completedCodeExchanges.set(code, { session, expiresAt: Date.now() + COMPLETED_CODE_TTL_MS });
    return session;
  } finally {
    inFlightCodeExchanges.delete(code);
  }
}

export async function completeOAuthRedirect(url: string) {
  const params = oauthParams(url);
  const providerError = params.get('error_description') || params.get('error_code') || params.get('error');
  if (providerError) throw normalizeOAuthError(providerError);

  const code = params.get('code');
  if (code) {
    const completed = getCompletedExchange(code);
    if (completed?.user) {
      await syncCurrentUserProfileBestEffort();
      return { session: completed, user: completed.user };
    }
  }

  let session = await waitForSession();
  if (!session && code) session = await exchangeCodeOnce(code);

  if (!session) {
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await getSupabase().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw normalizeOAuthError(error.message);
      session = data.session;
    }
  }

  if (!session?.user) throw new Error('لم تُنشأ جلسة Google صالحة. أعد المحاولة.');
  await syncCurrentUserProfileBestEffort();
  return { session, user: session.user };
}
