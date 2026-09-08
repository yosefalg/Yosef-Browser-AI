import { getSupabase } from './auth';

export type AgentMessage = { role: 'user' | 'assistant'; content: string };

export async function askAgent(messages: AgentMessage[], pageText?: string) {
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) throw new Error('سجّل الدخول أولاً لاستخدام RAID AI.');

  const cleanMessages = messages
    .slice(-14)
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 6000) }))
    .filter((message) => message.content.length > 0);

  if (!cleanMessages.length) throw new Error('اكتب رسالة أولاً.');

  const { data, error } = await supabase.functions.invoke('raid-ai', {
    body: { messages: cleanMessages, pageText: pageText?.slice(0, 18000) },
  });

  if (error) {
    const message = error.message || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.';
    throw new Error(message);
  }

  const payload = data as { text?: string; error?: string } | null;
  if (payload?.error) throw new Error(`تعذر تشغيل RAID AI: ${payload.error}`);
  if (!payload?.text?.trim()) throw new Error('لم يصل رد صالح من RAID AI.');
  return payload.text.trim();
}
