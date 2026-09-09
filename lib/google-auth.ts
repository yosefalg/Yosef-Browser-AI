import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getSupabase, getSupabasePublicRuntimeConfig } from '@/lib/auth';

WebBrowser.maybeCompleteAuthSession();

function oauthParams(url: string) {
  const question = url.indexOf('?');
  const hash = url.indexOf('#');
  const queryPart = question >= 0 ? url.slice(question + 1, hash >= 0 ? hash : undefined) : '';
  const hashPart = hash >= 0 ? url.slice(hash + 1) : '';
  return new URLSearchParams([queryPart, hashPart].filter(Boolean).join('&'));
}

async function ensureGoogleProviderEnabled() {
  const { url, publishableKey } = getSupabasePublicRuntimeConfig();
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
    });
    if (!response.ok) return;
    const settings = await response.json() as { external?: { google?: boolean } };
    if (settings.external?.google !== true) {
      throw new Error('GOOGLE_PROVIDER_DISABLED');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'GOOGLE_PROVIDER_DISABLED') throw error;
  }
}

function friendlyProviderError(message: string) {
  const decoded = decodeURIComponent(message.replace(/\+/g, ' '));
  if (/unable to exchange external code/i.test(decoded)) {
    return new Error('تعذر إكمال ربط Google بالخادم. تحقق من Google OAuth Client ID/Secret في Supabase ثم حاول مجددًا.');
  }
  return new Error(decoded || 'تعذر تسجيل الدخول بواسطة Google.');
}

export async function signInWithGoogle() {
  await ensureGoogleProviderEnabled();

  const supabase = getSupabase();
  const redirectTo = Linking.createURL('auth/callback', { scheme: 'raidbrowser' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account',
        access_type: 'offline',
      },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('تعذر بدء تسجيل الدخول بواسطة Google.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    throw new Error('تم إلغاء تسجيل الدخول بواسطة Google.');
  }

  const params = oauthParams(result.url);
  const providerError = params.get('error_description') || params.get('error');
  if (providerError) throw friendlyProviderError(providerError);

  const code = params.get('code');
  if (code) {
    const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    if (!exchanged.session?.user) throw new Error('لم تُنشأ جلسة Google صالحة.');
    return exchanged;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('لم تُرجع Google جلسة دخول صالحة.');

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) throw sessionError;
  if (!sessionData.session?.user) throw new Error('لم تُنشأ جلسة Google صالحة.');
  return sessionData;
}
