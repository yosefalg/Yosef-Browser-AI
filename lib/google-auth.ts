import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getCurrentSession, getSupabase, getSupabasePublicRuntimeConfig } from '@/lib/auth';
import { completeOAuthRedirect } from '@/lib/oauth-callback';

WebBrowser.maybeCompleteAuthSession();

async function ensureGoogleProviderEnabled() {
  const { url, publishableKey } = getSupabasePublicRuntimeConfig();
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
    });
    if (!response.ok) return;
    const settings = await response.json() as { external?: { google?: boolean } };
    if (settings.external?.google !== true) throw new Error('GOOGLE_PROVIDER_DISABLED');
  } catch (error) {
    if (error instanceof Error && error.message === 'GOOGLE_PROVIDER_DISABLED') throw error;
  }
}

export async function signInWithGoogle() {
  await ensureGoogleProviderEnabled();

  const existing = await getCurrentSession().catch(() => null);
  if (existing?.user) return { session: existing, user: existing.user };

  const redirectTo = Linking.createURL('auth/callback', { scheme: 'raidbrowser' });
  const { data, error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('تعذر بدء تسجيل الدخول بواسطة Google.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    throw new Error('تم إلغاء تسجيل الدخول بواسطة Google.');
  }

  return completeOAuthRedirect(result.url);
}
