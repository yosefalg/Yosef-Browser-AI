import { getSupabase } from './auth';

export type AgentMessage = { role: 'user' | 'assistant'; content: string };

type FunctionErrorLike = Error & { context?: Response };
type FunctionFailurePayload = { error?: string; message?: string; detail?: string; status?: number };

const MAX_AI_PAGE_CONTEXT_LENGTH = 9000;
const SECRET_REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi, 'Bearer [محجوب]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[JWT محجوب]'],
  [/\b(?:sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[مفتاح محجوب]'],
  [/((?:password|passwd|pwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|secret)\s*[:=]\s*)([^\s,;]{4,})/gi, '$1[محجوب]'],
];

function sanitizeAutomaticPageContext(pageText?: string) {
  if (!pageText) return undefined;

  let value = pageText
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, '')
    .replace(/[ \t]{3,}/g, '  ')
    .trim();

  for (const [pattern, replacement] of SECRET_REDACTIONS) {
    value = value.replace(pattern, replacement);
  }

  return value ? value.slice(0, MAX_AI_PAGE_CONTEXT_LENGTH) : undefined;
}

function friendlyFunctionError(payload: FunctionFailurePayload | null, httpStatus?: number) {
  const code = payload?.error?.trim();
  const status = payload?.status || httpStatus;
  if (status === 401 || code === 'UNAUTHORIZED') return 'انتهت جلسة RAID. سجّل الدخول مجددًا ثم أعد المحاولة.';
  if (code === 'AI_NOT_CONFIGURED') return 'خدمة RAID AI غير مهيأة على الخادم حاليًا.';
  if (code === 'AI_QUOTA_EXHAUSTED') return 'حصة مزود RAID AI انتهت أو وصلت حدها مؤقتًا. تم تفعيل التبديل التلقائي بين المزودين؛ أعد المحاولة بعد قليل.';
  if (code === 'AI_UPSTREAM_ERROR') return 'مزود RAID AI غير متاح مؤقتًا. أعد المحاولة بعد قليل.';
  if (code === 'EMPTY_RESPONSE') return 'وصل رد فارغ من مزود الذكاء الاصطناعي. أعد إرسال الطلب.';
  if (code === 'MESSAGE_REQUIRED') return 'اكتب رسالة أولاً.';
  if (code === 'BAD_REQUEST') return 'تعذر معالجة الطلب. اختصر الرسالة أو أعد المحاولة.';
  if (status === 429) return 'تم بلوغ حد الطلبات مؤقتًا. انتظر قليلًا ثم أعد المحاولة.';
  if (status && status >= 500) return 'خدمة RAID AI تواجه مشكلة مؤقتة على الخادم. أعد المحاولة.';
  return payload?.message?.trim() || code || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.';
}

async function getFunctionErrorMessage(error: FunctionErrorLike) {
  const fallback = error.message || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.';
  const response = error.context;
  if (!response) return fallback;
  try {
    const payload = await response.clone().json() as FunctionFailurePayload | null;
    return friendlyFunctionError(payload, response.status);
  } catch {
    return friendlyFunctionError(null, response.status) || fallback;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function askAgent(messages: AgentMessage[], pageText?: string) {
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  let session = sessionData.session;
  if (!session) throw new Error('سجّل الدخول أولاً لاستخدام RAID AI.');

  const expiresSoon = session.expires_at ? session.expires_at * 1000 - Date.now() < 60_000 : false;
  if (expiresSoon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) throw new Error('انتهت جلسة الحساب. سجّل الدخول مجددًا.');
    session = refreshed.session;
  }
  if (!session.access_token) throw new Error('تعذر الحصول على جلسة صالحة لـ RAID AI.');

  const cleanMessages = messages
    .slice(-10)
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 4000) }))
    .filter((message) => message.content.length > 0);
  if (!cleanMessages.length) throw new Error('اكتب رسالة أولاً.');

  const body = { messages: cleanMessages, pageText: sanitizeAutomaticPageContext(pageText) };
  const invoke = (accessToken: string) => supabase.functions.invoke('raid-ai', {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let { data, error } = await invoke(session.access_token);

  if (error && (error as FunctionErrorLike).context?.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token;
    if (!refreshError && token) ({ data, error } = await invoke(token));
  }

  const transientStatus = error ? (error as FunctionErrorLike).context?.status : undefined;
  if (error && transientStatus && [502, 503, 504].includes(transientStatus)) {
    await delay(250);
    ({ data, error } = await invoke((await supabase.auth.getSession()).data.session?.access_token || session.access_token));
  }

  if (error) throw new Error(await getFunctionErrorMessage(error as FunctionErrorLike));

  const payload = data as FunctionFailurePayload & { text?: string; provider?: string; model?: string } | null;
  if (payload?.error) throw new Error(friendlyFunctionError(payload));
  if (!payload?.text?.trim()) throw new Error('لم يصل رد صالح من RAID AI.');
  return payload.text.trim();
}
