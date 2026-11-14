// Narration: one clip per scene, cached by content hash.
import fs from 'node:fs';
import path from 'node:path';
import { generate, inlineData } from './gemini.mjs';
import { ffmpeg, duration, sha1, warn, ensureDir } from './util.mjs';

const TTS_MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-tts'];
const DEFAULT_STYLE = 'Voice only, no music or sound effects. Read this at a brisk pace, about 170 words per minute, like a punchy, slightly witty YouTube Shorts history narrator. Confident and energetic, with only tiny pauses between sentences';

export async function narrate(text, voice, cacheDir, projectDir) {
  ensureDir(cacheDir);
  const v = Object.assign({ name: 'Charon', speed: 1.0, maxPause: 0.18, style: DEFAULT_STYLE }, voice || {});
  const key = sha1(JSON.stringify([text, v.name, v.style, v.speed, v.maxPause, v.model || '']));
  const final = path.join(cacheDir, `${key}.wav`);
  if (fs.existsSync(final)) return { file: final, dur: await duration(final), cached: true };

  // raw TTS is cached separately so tweaking speed/pauses doesn't call the API again
  const raw = path.join(cacheDir, `${sha1(JSON.stringify([text, v.name, v.style, v.model || '']))}.tts.wav`);
  const models = v.model ? [v.model, ...TTS_MODELS.filter(m => m !== v.model)] : TTS_MODELS;
  let ok = fs.existsSync(raw), lastErr;
  for (const model of ok ? [] : models) {
    try {
      const json = await generate(model, {
        contents: [{ parts: [{ text: `${v.style}:\n${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.name } } } },
      });
      const d = inlineData(json);
      if (!d) throw new Error(`${model}: no audio in response`);
      const buf = Buffer.from(d.data, 'base64');
      if (/wav/i.test(d.mimeType)) fs.writeFileSync(raw, buf);
      else {
        const rate = (/rate=(\d+)/.exec(d.mimeType) || [0, 24000])[1];
        const pcm = raw + '.pcm'; fs.writeFileSync(pcm, buf);
        await ffmpeg(['-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', pcm, raw]);
        fs.unlinkSync(pcm);
      }
      ok = true; break;
    } catch (e) { lastErr = e; }
  }
  if (!ok) {
    if (v.allowSilent === false) throw lastErr;
    warn(`TTS failed (${lastErr?.message?.split('\n')[0]}). Using silent placeholder.`);
    const est = Math.max(1, text.split(/\s+/).length / 2.9);
    const tmp = path.join(cacheDir, `silent-${key}.wav`);
    await ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', est.toFixed(2), tmp]);
    return { file: tmp, dur: est, silent: true };
  }
  // trim leading/trailing silence, shorten long pauses, apply speed
  const sil = 'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.05';
  const gaps = `silenceremove=stop_periods=-1:stop_duration=${v.maxPause}:stop_threshold=-34dB:stop_silence=${v.maxPause}`;
  await ffmpeg(['-i', raw, '-af', `${sil},areverse,${sil},areverse,${gaps},atempo=${v.speed}`, '-ar', '44100', '-ac', '1', final]);
  return { file: final, dur: await duration(final) };
}

// User-supplied recording for a scene.
export async function userClip(file, cacheDir, speed = 1) {
  ensureDir(cacheDir);
  const out = path.join(cacheDir, `user-${sha1(file + fs.statSync(file).mtimeMs + speed)}.wav`);
  if (!fs.existsSync(out)) await ffmpeg(['-i', file, '-af', `atempo=${speed}`, '-ar', '44100', '-ac', '1', out]);
  return { file: out, dur: await duration(out) };
}

// Estimate word timings inside a clip (no forced alignment available offline).
// Longer words and numbers take longer; punctuation adds a pause.
export function wordTimings(text, dur) {
  const toks = text.split(/\s+/).filter(Boolean);
  const weight = w => {
    const letters = (w.match(/\p{L}/gu) || []).length;
    const digits = (w.match(/\d/g) || []).length;
    return 1.2 + letters * 0.32 + digits * 0.9;
  };
  const pause = w => (/[.!?]["')]?$/.test(w) ? 1.6 : /[,;:—–-]["')]?$/.test(w) ? 0.8 : 0);
  let total = 0; const spans = [];
  for (const w of toks) { const a = weight(w), b = pause(w); spans.push([a, b]); total += a + b; }
  const k = dur / (total || 1); let t = 0;
  return toks.map((w, i) => { const t0 = t; t += spans[i][0] * k; const t1 = t; t += spans[i][1] * k; return { w, t0, t1 }; });
}
