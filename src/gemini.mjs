// Minimal Gemini REST client (text-to-speech + image generation).
// Uses GEMINI_API_KEY if set; inside a proxy that injects credentials, any value works.
// Requests go through curl so HTTPS_PROXY / corporate proxies are honoured
// (Node's built-in fetch ignores them).
import { sleep, run } from './util.mjs';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function post(url, body) {
  const out = await run('curl', ['-sS', '--max-time', '300', '-X', 'POST', url,
    '-H', 'Content-Type: application/json', '-H', `x-goog-api-key: ${process.env.GEMINI_API_KEY || 'set-GEMINI_API_KEY'}`,
    '--data-binary', '@-', '-w', '\n%{http_code}'], { input: JSON.stringify(body) }).catch(e => `\n0 ${e.message}`);
  const cut = out.lastIndexOf('\n');
  const status = parseInt(out.slice(cut + 1)) || 0, text = out.slice(0, cut);
  return { ok: status >= 200 && status < 300, status, text };
}

export async function generate(model, body, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await post(`${BASE}/${model}:generateContent`, body);
    if (res.ok) return JSON.parse(res.text);
    const text = res.text;
    lastErr = new Error(`${model}: HTTP ${res.status} ${text.slice(0, 240)}`);
    lastErr.status = res.status;
    // quota errors for a model don't recover quickly; transient ones do
    const daily = /PerDay|per day/i.test(text);
    if (res.status === 404 || res.status === 400 || res.status === 403 || daily) break;
    if (attempt < retries) await sleep(1500 * Math.pow(2, attempt));
  }
  throw lastErr;
}

export function inlineData(json) {
  for (const p of json?.candidates?.[0]?.content?.parts || []) if (p.inlineData) return p.inlineData;
  return null;
}
