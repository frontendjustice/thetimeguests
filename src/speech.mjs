// Speech check: run before building visuals (node src/cli.mjs <project> --audio).
// Per clip: duration, words/min, loudness, real pauses, and a round-trip transcript
// compared with the script. Also writes a narration-only preview to listen to.
import fs from 'node:fs';
import path from 'node:path';
import { generate } from './gemini.mjs';
import { loudness, pauses } from './voice.mjs';
import { ffmpeg, ensureDir, log, warn, sleep, sha1, syllables } from './util.mjs';

const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
// word-level similarity: 1 - editDistance / max(len)
function similarity(a, b) {
  const A = norm(a), B = norm(b), d = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)]);
  for (let j = 1; j <= B.length; j++) d[0][j] = j;
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  return 1 - d[A.length][B.length] / Math.max(A.length, B.length, 1);
}

async function transcribe(file, cacheDir) {
  ensureDir(cacheDir);
  const f = path.join(cacheDir, sha1(file + fs.statSync(file).size) + '.txt');
  if (fs.existsSync(f)) return { text: fs.readFileSync(f, 'utf8'), cached: true };
  const mp3 = f.replace('.txt', '.mp3');
  await ffmpeg(['-i', file, '-ar', '16000', '-ac', '1', '-b:a', '48k', mp3]);
  const body = { contents: [{ parts: [{ inline_data: { mime_type: 'audio/mp3', data: fs.readFileSync(mp3).toString('base64') } }, { text: 'Transcribe this speech verbatim, with punctuation. Output only the words spoken, nothing else.' }] }] };
  for (const m of ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash']) {
    try {
      const j = await generate(m, body, { retries: 2 });
      const text = j.candidates[0].content.parts.map(p => p.text || '').join('').trim();
      fs.writeFileSync(f, text); fs.unlinkSync(mp3);
      return { text };
    } catch (e) { warn(`transcribe ${m}: ${e.message.split('\n')[0].slice(0, 100)}`); }
  }
  return { text: '' };
}

export async function speechReport({ proj, clips, outDir, cache }) {
  const rows = []; let fails = 0;
  const gap = proj.pause == null ? 0.2 : proj.pause;
  for (let i = 0; i < proj.scenes.length; i++) {
    const sc = proj.scenes[i], c = clips[i];
    if (!sc.say) continue;
    const words = sc.say.split(/\s+/).length, wpm = words / c.dur * 60;
    const I = c.silent ? NaN : await loudness(c.file);
    const ps = c.silent ? [] : (await pauses(c.file, 0.1)).filter(p => p[0] > 0.05 && p[1] < c.dur - 0.05);
    const tr = c.silent ? { text: '' } : await transcribe(c.file, path.join(cache, 'transcripts'));
    if (!tr.cached && !c.silent) await sleep(7000); // stay under the per-minute quota
    const sim = similarity(sc.say, tr.text);
    const flags = [];
    if (c.silent) flags.push('SILENT (TTS failed)');
    if (!tr.text && !c.silent) flags.push('NOT CHECKED (transcription failed)');
    else if (sim < 0.9) flags.push(`transcript differs (${(sim * 100).toFixed(0)}%)`);
    const speech = c.dur - ps.reduce((a, p) => a + p[1] - p[0], 0), sps = syllables(sc.say) / Math.max(speech, 0.5);
    if (proj.voice?.lufs && Math.abs(I - proj.voice.lufs) > 1.5) flags.push(`loudness ${I.toFixed(1)}`);
    if (flags.length) fails++;
    rows.push({ sps, target: (sc.voice && sc.voice.sps) || (proj.voice && proj.voice.sps), i: i + 1, voice: sc.voice?.name || proj.voice?.name || 'Charon', dur: c.dur, wpm, I, ps, say: sc.say, heard: tr.text, flags, pauseAfter: sc.pause == null ? gap : sc.pause });
  }
  const med = (a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)])(rows.map(r => r.sps));
  for (const r of rows) { const tgt = r.target || med; if (Math.abs(r.sps / tgt - 1) > 0.15) { r.flags.push(`pace ${r.sps.toFixed(1)} syl/s vs target ${tgt.toFixed(1)}`); if (r.flags.length === 1) fails++; } }
  // narration-only preview with the real gaps between lines
  const list = proj.scenes.map((sc, i) => ({ f: clips[i].file, d: clips[i].dur + (sc.pause == null ? gap : sc.pause) }));
  const prev = path.join(outDir, 'narration-preview.m4a');
  await ffmpeg([...list.flatMap(x => ['-i', x.f]), '-filter_complex', list.map((x, k) => `[${k}]aresample=44100,aformat=channel_layouts=mono,apad,atrim=0:${x.d.toFixed(3)},asetpts=N/SR/TB[a${k}]`).join(';') + ';' + list.map((_, k) => `[a${k}]`).join('') + `concat=n=${list.length}:v=0:a=1[o]`, '-map', '[o]', '-c:a', 'aac', '-b:a', '160k', prev]);
  const total = list.reduce((a, x) => a + x.d, 0), allWords = proj.scenes.reduce((a, s) => a + (s.say ? s.say.split(/\s+/).length : 0), 0);

  let md = `# Speech report\n\n${allWords} words in ${total.toFixed(1)}s = **${(allWords / total * 60).toFixed(0)} wpm overall** (including pauses).\n\n| # | voice | dur | wpm | syl/s (excl. pauses) | LUFS | pauses inside | pause after | check |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${r.i} | ${r.voice} | ${r.dur.toFixed(2)}s | ${r.wpm.toFixed(0)} | ${r.sps.toFixed(1)} | ${isFinite(r.I) ? r.I.toFixed(1) : '-'} | ${r.ps.map(p => `${p[0].toFixed(2)}(${(p[1] - p[0]).toFixed(2)})`).join(' ') || '—'} | ${r.pauseAfter}s | ${r.flags.join('; ') || 'ok'} |\n`;
  md += '\n## Heard vs script\n\n';
  for (const r of rows) md += `${r.i}. **script:** ${r.say}\n   **heard:** ${r.heard}\n\n`;
  const rep = path.join(outDir, 'speech-report.md');
  fs.writeFileSync(rep, md);
  console.log(md);
  log(`wrote ${prev} and ${rep}`);
  if (fails) warn(`${fails} line(s) need attention before building visuals`);
}
