const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    key: () => process.env.GROQ_API_KEY,
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    key: () => process.env.OPENAI_API_KEY,
  },
};

function chooseProvider() {
  const requested = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  if (requested === 'openai' && PROVIDERS.openai.key()) return PROVIDERS.openai;
  if (PROVIDERS.groq.key()) return PROVIDERS.groq;
  if (PROVIDERS.openai.key()) return PROVIDERS.openai;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const provider = chooseProvider();
  if (!provider) return res.status(503).json({ error: 'No AI provider key configured' });

  const { messages = [], pageText = '', stream = false } = req.body || {};
  const safeMessages = Array.isArray(messages)
    ? messages.filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-30)
    : [];
  const system = {
    role: 'system',
    content: `You are RAID Browser AI, an Arabic-first browser agent. Be concise, factual and privacy-aware. Never claim an action happened unless the client reports it. Page/browser context follows:\n${String(pageText).slice(0, 50000)}`,
  };

  const upstream = await fetch(provider.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.key()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [system, ...safeMessages],
      temperature: 0.35,
      stream: Boolean(stream),
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return res.status(upstream.status).json({ error: 'AI provider request failed', detail: detail.slice(0, 500) });
  }

  if (!stream) {
    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return res.status(502).json({ error: 'Invalid provider response' });
    return res.status(200).json({ text, provider: provider.url.includes('groq.com') ? 'groq' : 'openai' });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  const reader = upstream.body?.getReader();
  if (!reader) return res.end();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const token = json?.choices?.[0]?.delta?.content;
        if (token) res.write(token);
      } catch {}
    }
  }
  res.end();
}
