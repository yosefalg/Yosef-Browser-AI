import { router } from 'expo-router';
import { normalizeInput } from './url';
import { createAgentTask, getTabContexts, remember } from './db';

export type LocalAgentResult = {
  handled: boolean;
  message?: string;
  aiPrompt?: string;
};

function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export async function executeLocalAgentCommand(raw: string): Promise<LocalAgentResult> {
  const text = raw.trim();
  if (!text) return { handled: false };

  const rememberMatch = text.match(/^(?:تذكّر|تذكر)\s+(?:أن\s+)?(.+)$/i);
  if (rememberMatch?.[1]) {
    await remember('user_preference', rememberMatch[1]);
    return { handled: true, message: 'تم حفظ هذه المعلومة في ذاكرة RAID المحلية على هذا الجهاز.' };
  }

  const remindTomorrow = text.match(/^(?:ذكرني|ذكّرني)\s+(?:غد(?:اً|ا)|باجر)\s+(.+)$/i);
  if (remindTomorrow?.[1]) {
    const dueAt = tomorrowMorning();
    await createAgentTask(remindTomorrow[1], JSON.stringify({ kind: 'reminder', text: remindTomorrow[1] }), dueAt);
    return { handled: true, message: `تم حفظ المهمة لليوم التالي الساعة 9:00 صباحاً: ${remindTomorrow[1]}` };
  }

  const taskMatch = text.match(/^(?:نفّذ مهمة|نفذ مهمة|أنشئ مهمة|انشئ مهمة)\s*[:：-]?\s*(.+)$/i);
  if (taskMatch?.[1]) {
    await createAgentTask(taskMatch[1], JSON.stringify({ kind: 'agent_task', instruction: taskMatch[1] }), null);
    return { handled: true, message: `تمت إضافة المهمة إلى قائمة RAID Agent: ${taskMatch[1]}` };
  }

  if (/^(?:لخّص|لخص)\s+(?:كل\s+)?(?:التبويبات|الصفحات)\s+(?:المفتوحة)?/i.test(text)) {
    const tabs = await getTabContexts(null, 12);
    if (!tabs.length) return { handled: true, message: 'لا يوجد سياق محفوظ لتبويبات مفتوحة بعد.' };
    const context = tabs.map((tab, i) => `TAB ${i + 1}: ${tab.title}\nURL: ${tab.url}\n${tab.text.slice(0, 3500)}`).join('\n\n');
    return { handled: false, aiPrompt: `لخّص جميع التبويبات التالية مع أهم النقاط والروابط:\n\n${context}` };
  }

  const compareMatch = text.match(/^(?:قارن بين)\s+(.+)$/i);
  if (compareMatch?.[1]) {
    const tabs = await getTabContexts(null, 8);
    const context = tabs.map((tab, i) => `TAB ${i + 1}: ${tab.title}\nURL: ${tab.url}\n${tab.text.slice(0, 3000)}`).join('\n\n');
    return { handled: false, aiPrompt: `قارن بين ${compareMatch[1]}. استخدم سياق التبويبات المتاح إن كان ذا صلة، واذكر الفروق بوضوح.\n\n${context}` };
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
