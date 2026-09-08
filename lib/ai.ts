import { getSupabase } from './auth';

export type AgentMessage = { role: 'user' | 'assistant'; content: string };

type FunctionErrorLike = Error & {
  context?: Response;
};

async function getFunctionErrorMessage(error: FunctionErrorLike) {
  const fallback = error.message || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.';
  const response = error.context;
  if (!response) return fallback;

  try {
    const cloned = response.clone();
    const payload = (await cloned.json()) as { error?: string; message?: string } | null;
    return payload?.error || payload?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function askAgent(messages: AgentMessage[], pageText?: string) {
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  let session = sessionData.session;
  if (!session) throw new Error('سجّل الدخول أولاً لاستخدام RAID AI.');

  const expiresSoon = session.expires_at ? session.expires_at * 1000 - Date.now() < 60_000 : false;
  if (expiresSoon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw new Error('انتهت جلسة الحساب. سجّل الدخول مجددًا.');
    session = refreshed.session;
  }

  if (!session?.access_token) throw new Error('تعذر الحصول على جلسة صالحة لـ RAID AI.');

  const cleanMessages = messages
    .slice(-14)
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 6000) }))
    .filter((message) => message.content.length > 0);

  if (!cleanMessages.length) throw new Error('اكتب رسالة أولاً.');

  const { data, error } = await supabase.functions.invoke('raid-ai', {
    body: { messages: cleanMessages, pageText: pageText?.slice(0, 18000) },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error as FunctionErrorLike));
  }

  const payload = data as { text?: string; error?: string; provider?: string } | null;
  if (payload?.error) throw new Error(`تعذر تشغيل RAID AI: ${payload.error}`);
  if (!payload?.text?.trim()) throw new Error('لم يصل رد صالح من RAID AI.');
  return payload.text.trim();
}
