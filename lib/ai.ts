import { getSupabase } from './auth';

export type AgentMessage = { role: 'user' | 'assistant'; content: string };

type FunctionErrorLike = Error & {
  context?: Response;
};

type FunctionFailurePayload = {
  error?: string;
  message?: string;
  detail?: string;
  status?: number;
};

function friendlyFunctionError(payload: FunctionFailurePayload | null, httpStatus?: number) {
  const code = payload?.error?.trim();
  const status = payload?.status || httpStatus;

  if (status === 401 || code === 'UNAUTHORIZED') {
    return 'انتهت جلسة RAID. افتح الحساب وسجّل الدخول مجددًا ثم أعد المحاولة.';
  }
  if (code === 'AI_NOT_CONFIGURED') {
    return 'خدمة RAID AI غير مهيأة على الخادم حاليًا.';
  }
  if (code === 'AI_UPSTREAM_ERROR') {
    return 'مزود RAID AI غير متاح مؤقتًا. أعد المحاولة بعد قليل.';
  }
  if (code === 'EMPTY_RESPONSE') {
    return 'وصل رد فارغ من مزود الذكاء الاصطناعي. أعد إرسال الطلب.';
  }
  if (code === 'MESSAGE_REQUIRED') {
    return 'اكتب رسالة أولاً.';
  }
  if (code === 'BAD_REQUEST') {
    return 'تعذر معالجة الطلب. اختصر الرسالة أو أعد المحاولة.';
  }
  if (status === 429) {
    return 'تم بلوغ حد الطلبات مؤقتًا. انتظر قليلًا ثم أعد المحاولة.';
  }
  if (status && status >= 500) {
    return 'خدمة RAID AI تواجه مشكلة مؤقتة على الخادم. أعد المحاولة بعد قليل.';
  }

  return payload?.message?.trim() || code || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.';
}

async function getFunctionErrorMessage(error: FunctionErrorLike) {
  const fallback = error.message || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.';
  const response = error.context;
  if (!response) return fallback;

  try {
    const cloned = response.clone();
    const payload = (await cloned.json()) as FunctionFailurePayload | null;
    return friendlyFunctionError(payload, response.status);
  } catch {
    if (response.status === 401) return friendlyFunctionError(null, 401);
    if (response.status === 429) return friendlyFunctionError(null, 429);
    if (response.status >= 500) return friendlyFunctionError(null, response.status);
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
    if (refreshError || !refreshed.session?.access_token) {
      throw new Error('انتهت جلسة الحساب. سجّل الدخول مجددًا.');
    }
    session = refreshed.session;
  }

  if (!session.access_token) throw new Error('تعذر الحصول على جلسة صالحة لـ RAID AI.');

  const cleanMessages = messages
    .slice(-14)
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 6000) }))
    .filter((message) => message.content.length > 0);

  if (!cleanMessages.length) throw new Error('اكتب رسالة أولاً.');

  const body = { messages: cleanMessages, pageText: pageText?.slice(0, 18000) };
  const invoke = (accessToken: string) => supabase.functions.invoke('raid-ai', {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let { data, error } = await invoke(session.access_token);

  // A token can be revoked or expire between getSession() and the Edge Function call.
  // Refresh once and retry only for HTTP 401; never retry provider/server failures.
  if (error && (error as FunctionErrorLike).context?.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.session?.access_token;
    if (!refreshError && refreshedToken) {
      ({ data, error } = await invoke(refreshedToken));
    }
  }

  if (error) {
    throw new Error(await getFunctionErrorMessage(error as FunctionErrorLike));
  }

  const payload = data as FunctionFailurePayload & { text?: string; provider?: string } | null;
  if (payload?.error) throw new Error(friendlyFunctionError(payload));
  if (!payload?.text?.trim()) throw new Error('لم يصل رد صالح من RAID AI.');
  return payload.text.trim();
}
