const axios = require('axios');

async function generate(prompt, context = {}) {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (!provider) return null;

  if (provider === 'ollama') {
    const url = process.env.OLLAMA_URL;
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    if (!url) return null;
    const res = await axios.post(`${url}/api/generate`, {
      model,
      prompt: `Context: ${JSON.stringify(context)}\n\nSystem Task: ${prompt}\n\nResponse:`,
      stream: false,
      options: { temperature: 0.1, num_predict: 500 }
    }, { timeout: 60000 });
    return res.data && (res.data.response || res.data);
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    if (!key) return null;
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model,
      messages: [
        { role: 'system', content: `Context: ${JSON.stringify(context)}` },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    }, {
      headers: { Authorization: `Bearer ${key}` },
      timeout: 60000
    });
    const choices = res.data && res.data.choices;
    if (!choices || !choices[0] || !choices[0].message) return null;
    return choices[0].message.content;
  }

  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
    if (!key) return null;
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model,
      max_tokens: 1000,
      messages: [
        { role: 'user', content: [{ type: 'text', text: `Context: ${JSON.stringify(context)}\n\n${prompt}` }] }
      ]
    }, {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      timeout: 60000
    });
    const content = res.data && res.data.content;
    if (!content || !content[0] || !content[0].text) return null;
    return content[0].text;
  }

  if (provider === 'gemini') {
    const key = process.env.GOOGLE_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    if (!key) return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await axios.post(url, {
      contents: [
        {
          role: 'user',
          parts: [{ text: `Context: ${JSON.stringify(context)}\n\n${prompt}` }]
        }
      ]
    }, { timeout: 60000 });
    const candidates = res.data && res.data.candidates;
    const parts = candidates && candidates[0] && candidates[0].content && candidates[0].content.parts;
    if (!parts || !parts[0] || !parts[0].text) return null;
    return parts[0].text;
  }

  return null;
}

module.exports = { generate };
