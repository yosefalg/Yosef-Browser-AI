import { router } from 'expo-router';
import { normalizeInput } from './url';
import { remember } from './db';

export type LocalAgentResult = {
  handled: boolean;
  message?: string;
};

export async function executeLocalAgentCommand(raw: string): Promise<LocalAgentResult> {
  const text = raw.trim();
  if (!text) return { handled: false };

  const rememberMatch = text.match(/^(?:تذكّر|تذكر)\s+(?:أن\s+)?(.+)$/i);
  if (rememberMatch?.[1]) {
    await remember('user_preference', rememberMatch[1]);
    return { handled: true, message: 'تم حفظ هذه المعلومة في ذاكرة RAID المحلية على هذا الجهاز.' };
  }

  const openMatch = text.match(/^(?:افتح|اذهب إلى|اذهب الى)\s+(.+)$/i);
  if (openMatch?.[1]) {
    const target = normalizeInput(openMatch[1]);
    router.push({ pathname: '/browser', params: { url: target } });
    return { handled: true, message: `سأفتح: ${openMatch[1]}` };
  }

  const searchMatch = text.match(/^(?:ابحث(?: لي)?(?: عن)?|بحث عن)\s+(.+)$/i);
  if (searchMatch?.[1]) {
    const target = normalizeInput(searchMatch[1]);
    router.push({ pathname: '/browser', params: { url: target } });
    return { handled: true, message: `سأبحث عن: ${searchMatch[1]}` };
  }

  return { handled: false };
}
