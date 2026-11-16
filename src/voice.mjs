// Narration: one clip per scene, cached by content hash.
import fs from 'node:fs';
import path from 'node:path';
import { generate, inlineData } from './gemini.mjs';
import { ffmpeg, duration, sha1, warn, ensureDir, run, syllables } from './util.mjs';

const TTS_MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-tts'];
const DEFAULT_STYLE = 'Voice only, no music or sound effects. Read this at a brisk pace, about 170 words per minute, like a punchy, slightly witty YouTube Shorts history narrator. Confident and energetic, with only tiny pauses between sentences';

// voice: { name, style, speed, maxPause (false = keep natural pauses), lufs (loudness target), model }
// direction: per-line delivery note appended to the style (not spoken).
export async function narrate(text, voice, cacheDir, { direction, raw: rawIn } = {}) {
  ensureDir(cacheDir);
  const v = Object.assign({ name: 'Charon', speed: 1.0, maxPause: 0.18, style: DEFAULT_STYLE }, voice || {});
  // keep prompts short: long instructions get read aloud by the TTS model
  const style = direction ? `${v.style}, ${direction}` : v.style;
  // extra fields only enter the key when used, so older projects keep their cached clips
  const extra = [direction, v.lufs, v.sps, rawIn].some(x => x != null) ? [direction || '', v.lufs || '', v.sps || '', rawIn ? rawIn + fs.statSync(rawIn).size : '', 'p2', v.postVersion || ''] : [];
  const key = sha1(JSON.stringify([text, v.name, v.style, v.speed, v.maxPause, v.model || '', ...extra]));
  const final = path.join(cacheDir, `${key}.wav`);
  if (fs.existsSync(final)) return { file: final, dur: await duration(final), cached: true };

  // raw TTS is cached separately so tweaking speed/pauses doesn't call the API again
  // an approved take (scene.rawAudio) skips TTS entirely and only goes through post-processing
  const raw = rawIn || path.join(cacheDir, `${sha1(JSON.stringify([text, v.name, style, v.model || '']))}.tts.wav`);
  // a pinned model is used alone: silently falling back to another model changes the voice and delivery
  const models = v.model ? [v.model] : TTS_MODELS;
  let ok = fs.existsSync(raw), lastErr;
  // attempts: full prompt, then style only, then bare text; reject clips far longer than the text allows
  const prompts = [`${style}:\n${text}`];
  const maxDur = Math.max(2.5, syllables(text) / 2.2);
  for (const [model, prompt] of ok ? [] : models.flatMap(m => prompts.map(p => [m, p]))) {
    try {
      const json = await generate(model, {
        contents: [{ parts: [{ text: prompt }] }],
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
      const rd = await duration(raw);
      if (rd > maxDur) warn(`${model}: ${rd.toFixed(1)}s clip for a line of ~${maxDur.toFixed(1)}s max (instructions read aloud?) — check the transcript`);
      ok = true; break;
    } catch (e) { lastErr = e; }
  }
  if (!ok) {
    if (v.allowSilent === false || v.model) throw new Error(`TTS failed for "${text.slice(0, 40)}…": ${lastErr?.message?.split('\n')[0]}`);
    warn(`TTS failed (${lastErr?.message?.split('\n')[0]}). Using silent placeholder.`);
    const est = Math.max(1, text.split(/\s+/).length / 2.9);
    const tmp = path.join(cacheDir, `silent-${key}.wav`);
    await ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', est.toFixed(2), tmp]);
    return { file: tmp, dur: est, silent: true };
  }
  // trim leading/trailing silence, shorten long pauses, apply speed
  const sil = 'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.05';
  const half = v.maxPause / 2; // silenceremove keeps stop_duration + stop_silence, so each gets half the budget
  const gaps = v.maxPause ? `,silenceremove=stop_periods=-1:stop_duration=${half}:stop_threshold=-34dB:stop_silence=${half}` : '';
  await ffmpeg(['-i', raw, '-af', `${sil},areverse,${sil},areverse${gaps},atempo=${v.speed}`, '-ar', '44100', '-ac', '1', final]);
  if (v.sps) { // nudge speaking rate (syllables/s, pauses excluded) toward the target; pitch-preserving, capped
    const d = await duration(final), ps = await pauses(final, 0.1);
    const speech = d - ps.reduce((a, p) => a + p[1] - p[0], 0), f = Math.min(1.25, Math.max(0.9, v.sps / (syllables(text) / Math.max(speech, 0.5))));
    if (Math.abs(f - 1) > 0.03) { const tmp = final + '.tmp.wav'; await ffmpeg(['-i', final, '-af', `atempo=${f.toFixed(3)}`, tmp]); fs.renameSync(tmp, final); }
  }
  if (v.lufs) { // static gain so every clip sits at the same loudness
    const I = await loudness(final);
    if (isFinite(I)) { const tmp = final + '.tmp.wav'; await ffmpeg(['-i', final, '-af', `volume=${(v.lufs - I).toFixed(2)}dB,alimiter=limit=0.97`, tmp]); fs.renameSync(tmp, final); }
  }
  return { file: final, dur: await duration(final), model: rawIn ? 'approved take' : undefined };
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

// Word timings anchored to real pauses in the audio. Punctuation breaks are matched
// (in order, each at most once) to detected silences when one lies within maxErr of the
// estimate; words between anchors are spread by length. Unmatched breaks keep estimates.
export async function alignedTimings(text, file, dur, { maxErr = 0.7, missCost = 0.35 } = {}) {
  const est = wordTimings(text, dur);
  let out = '';
  try { out = await run('bash', ['-c', `ffmpeg -hide_banner -i '${file.replace(/'/g, "'\\''")}' -af silencedetect=n=-35dB:d=0.06 -f null - 2>&1`]); } catch { return est; }
  const sil = [...out.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map(m => [+m[1], +m[2]]).filter(s => s[0] > 0.05 && s[1] < dur - 0.05 && s[1] - s[0] >= 0.1);
  const breaks = est.map((w, k) => k).filter(k => k < est.length - 1 && /[.,?!:;—–]["')]?$/.test(est[k].w));
  if (!breaks.length || !sil.length) return est;
  // DP: best monotonic assignment of breaks -> silences (or none)
  const B = breaks.length, S = sil.length, INF = 1e9;
  const cost = Array.from({ length: B + 1 }, () => Array(S + 1).fill(INF)), from = Array.from({ length: B + 1 }, () => Array(S + 1).fill(null));
  for (let j = 0; j <= S; j++) cost[0][j] = 0;
  for (let i = 1; i <= B; i++) {
    const k = breaks[i - 1], e = (est[k].t1 + est[k + 1].t0) / 2;
    for (let j = 0; j <= S; j++) {
      if (cost[i - 1][j] + missCost < cost[i][j]) { cost[i][j] = cost[i - 1][j] + missCost; from[i][j] = [i - 1, j, null]; }
      if (j > 0) {
        if (cost[i][j - 1] < cost[i][j]) { cost[i][j] = cost[i][j - 1]; from[i][j] = [i, j - 1, null]; }
        const mid = (sil[j - 1][0] + sil[j - 1][1]) / 2, d = Math.abs(mid - e);
        if (d <= maxErr && cost[i - 1][j - 1] + d < cost[i][j]) { cost[i][j] = cost[i - 1][j - 1] + d; from[i][j] = [i - 1, j - 1, j - 1]; }
      }
    }
  }
  const anchors = []; let i = B, j = S;
  while (i > 0 && from[i][j]) { const [pi, pj, s] = from[i][j]; if (s != null) anchors.unshift({ k: breaks[i - 1], sil: sil[s] }); i = pi; j = pj; }
  if (!anchors.length) return est;
  // piecewise re-spread: segment = words between anchors, mapped onto [segStart, segEnd]
  const res = est.map(w => ({ ...w }));
  const cuts = [{ k: -1, end: 0 }, ...anchors.map(a => ({ k: a.k, start: a.sil[0], end: a.sil[1] })), { k: est.length - 1, start: dur }];
  for (let c = 1; c < cuts.length; c++) {
    const a = cuts[c - 1], b = cuts[c], first = a.k + 1, last = b.k;
    const s0 = est[first].t0, s1 = est[last].t1, t0 = a.end, t1 = b.start;
    for (let k = first; k <= last; k++) {
      res[k].t0 = t0 + (est[k].t0 - s0) / ((s1 - s0) || 1) * (t1 - t0);
      res[k].t1 = t0 + (est[k].t1 - s0) / ((s1 - s0) || 1) * (t1 - t0);
    }
  }
  res.anchors = anchors.length;
  return res;
}

// Integrated loudness (LUFS) of a file.
export async function loudness(file) {
  const out = await run('bash', ['-c', `ffmpeg -hide_banner -nostats -i '${file.replace(/'/g, "'\\''")}' -af ebur128 -f null - 2>&1`]);
  const m = [...out.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return m ? parseFloat(m[1]) : NaN;
}
export async function pauses(file, min = 0.1) {
  const out = await run('bash', ['-c', `ffmpeg -hide_banner -i '${file.replace(/'/g, "'\\''")}' -af silencedetect=n=-35dB:d=${min} -f null - 2>&1`]);
  return [...out.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map(m => [+m[1], +m[2]]);
}
