import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getSupabase, getSupabasePublicRuntimeConfig } from '@/lib/auth';
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

  // Always start a fresh Google chooser. Returning an already-existing RAID
  // session here prevented users who were signed in by email (or another
  // Google account) from actually switching/choosing the requested account.
  // Supabase replaces the local session only after the OAuth exchange succeeds,
  // so a cancelled Google flow does not destroy the current signed-in session.
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
