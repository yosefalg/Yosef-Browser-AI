import { getSupabase } from './auth';

export type AgentMessage = { role: 'user' | 'assistant'; content: string };

export async function askAgent(messages: AgentMessage[], pageText?: string) {
  const endpoint = process.env.EXPO_PUBLIC_AI_API_URL;
  if (!endpoint) throw new Error('AI backend is not configured');

  const supabase = getSupabase();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ messages, pageText }),
  });

  if (!response.ok) throw new Error(`AI request failed (${response.status})`);
  const data = await response.json() as { text?: string };
  if (!data.text) throw new Error('AI backend returned an invalid response');
  return data.text;
}
