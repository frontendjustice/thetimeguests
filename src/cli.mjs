#!/usr/bin/env node
// Usage:
//   node src/cli.mjs projects/<name>                 full render -> projects/<name>/out/<name>.mp4
//   node src/cli.mjs projects/<name> --still 12.5    single PNG at t=12.5s (fast layout check)
//   node src/cli.mjs projects/<name> --stills 6      contact sheet of 6 evenly spaced frames
//   options: --fps 30  --preview (half-res, 24fps)  --workers 4  --no-sfx  --out file.mp4
//   --shots         contact sheet with one frame per shot
//   --remux         rebuild only the audio mix and swap it into the existing MP4
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { narrate, userClip, alignedTimings } from './voice.mjs';
import { resolveAll, resolveCue, sortKeyframes } from './timeline.mjs';
import { ensureSfx, sfxEvents, buildAudio } from './audio.mjs';
import { renderVideo, renderStill } from './render.mjs';
import { generate, inlineData } from './gemini.mjs';
import { ensureDir, log, warn, sha1, ffmpeg } from './util.mjs';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const nx = argv[i + 1]; if (nx != null && !nx.startsWith('--')) { o[k] = nx; i++; } else o[k] = true; }
    else o._.push(a);
  }
  return o;
}

const IMG_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image', 'gemini-3-pro-image'];
async function genImage(prompt, file) {
  for (const model of IMG_MODELS) {
    try {
      const json = await generate(model, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } } }, { retries: 1 });
      const d = inlineData(json); if (!d) continue;
      fs.writeFileSync(file, Buffer.from(d.data, 'base64')); return true;
    } catch (e) { warn(`image gen ${model}: ${e.message.split('\n')[0].slice(0, 120)}`); }
  }
  return false;
}

// Collect every image file referenced in the project and inline it as a data URL.
function collectAssets(scenes, dir) {
  const assets = {};
  const visit = o => {
    if (Array.isArray(o)) return o.forEach(visit);
    if (!o || typeof o !== 'object') return;
    for (const k of ['src', 'faceImage']) if (typeof o[k] === 'string' && !assets[o[k]]) {
      const f = path.resolve(dir, o[k]);
      if (!fs.existsSync(f)) { warn(`missing asset ${o[k]}`); continue; }
      const ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg');
      assets[o[k]] = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${fs.readFileSync(f).toString('base64')}`;
    }
    Object.values(o).forEach(visit);
  };
  visit(scenes);
  return assets;
}

// ---- shot continuity helpers ----
const TRANSIENT = new Set(['boom', 'plane', 'flow', 'vehicle', 'drawer', 'bridge', 'tunnel', 'dynamite', 'char', 'text', 'image', 'bunker']);
// Map state at the end of the previous shot, frozen (no re-animation).
function settledBg(prev) {
  const bg = JSON.parse(JSON.stringify(prev.bg || {}));
  if (Array.isArray(bg.view)) bg.view = bg.view.filter(v => (v.at || 0) <= prev.dur).reduce((a, v) => ({ ...a, ...v }), {});
  if (bg.view) { delete bg.view.at; delete bg.view.dur; }
  if (bg.fills) bg.fills = bg.fills.filter(f => (f.at || 0) <= prev.dur && !(f.until != null && f.until <= prev.dur)).map(f => ({ ...f, at: -10, fade: 0, until: undefined }));
  return bg;
}
function mergeBg(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v === undefined) continue;
    if (k === 'fills') out.fills = [...(base.fills || []), ...v]; else out[k] = v;
  }
  return out;
}
// keep:true carries over persistent map items; keep:[ids] carries those exact items.
function keptItems(prev, keep) {
  return (prev.items || []).filter(it => {
    if (Array.isArray(keep)) return keep.includes(it.id);
    if (TRANSIENT.has(it.type)) return false;
    return (it.at || 0) <= prev.dur && !(it.until != null && it.until <= prev.dur);
  }).map(it => ({ ...it, at: -10, until: undefined, enter: 'none', moveAt: it.to ? -10 : it.moveAt }))
    .map(it => it.to && it.type === 'token' ? { ...it, pos: it.to, to: undefined } : it);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(args._[0] || '.');
  const projFile = fs.existsSync(path.join(dir, 'project.json')) ? path.join(dir, 'project.json') : dir;
  const projDir = path.dirname(projFile);
  const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));
  const name = proj.name || path.basename(projDir);
  const cache = path.join(projDir, '.cache'); ensureDir(cache);
  const outDir = path.join(projDir, 'out'); ensureDir(outDir);

  // 1. backgrounds from prompts (optional; falls back to a drawn background)
  for (const sc of proj.scenes) {
    const bg = sc.bg || {};
    if (bg.type === 'image' && !bg.src && bg.prompt) {
      const f = path.join('assets', `gen-${sha1(bg.prompt)}.png`); const abs = path.join(projDir, f);
      ensureDir(path.dirname(abs));
      if (fs.existsSync(abs) || await genImage(bg.prompt + (proj.imageStyle ? `. Style: ${proj.imageStyle}` : ''), abs)) bg.src = f;
      else { warn(`no image for "${bg.prompt.slice(0, 50)}…", using fallback background`); sc.bg = bg.fallback || { type: 'plain', color: '#e9e4d8' }; }
    }
  }

  // 2. narration per scene
  log(`narration for ${proj.scenes.length} scenes`);
  const clips = [];
  for (let i = 0; i < proj.scenes.length; i++) {
    const sc = proj.scenes[i];
    if (sc.audio) clips.push(await userClip(path.resolve(projDir, sc.audio), path.join(cache, 'tts'), proj.voice?.speed || 1));
    else if (sc.say) clips.push(await narrate(sc.say, proj.voice, path.join(cache, 'tts'), projDir));
    else clips.push({ file: null, dur: 0 });
    process.stdout.write(`\r› voice ${i + 1}/${proj.scenes.length}${clips[i].cached ? ' (cached)' : ''}   `);
  }
  process.stdout.write('\n');
  // silent clip for scenes with no narration
  const silent = path.join(cache, 'silence.wav');
  if (!fs.existsSync(silent)) await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.1', silent]);
  clips.forEach(c => { if (!c.file) c.file = silent; });

  // 3. timeline: each narration scene may be cut into several shots
  let t = 0;
  const shots = [], narr = [];
  const aligned = [];
  for (let i = 0; i < proj.scenes.length; i++) {
    const raw = proj.scenes[i];
    aligned.push(raw.say && clips[i].file !== silent && !clips[i].silent ? await alignedTimings(raw.say, clips[i].file, clips[i].dur) : raw.say ? (await import('./voice.mjs')).wordTimings(raw.say, clips[i].dur) : []);
  }
  const anchored = aligned.reduce((a, w) => a + (w.anchors || 0), 0);
  if (clips.some(c => c.silent)) warn('some narration is a SILENT PLACEHOLDER (TTS failed) — do not publish this render');
  proj.scenes.forEach((raw, i) => {
    const words = aligned[i];
    const gap = raw.pause == null ? (proj.pause == null ? 0.2 : proj.pause) : raw.pause;
    const dur = Math.max(raw.dur || 0, clips[i].dur + gap, raw.minDur || 0, 0.5);
    narr.push({ dur });
    const list = raw.shots || [{ bg: raw.bg, items: raw.items, camera: raw.camera, flash: raw.flash }];
    const starts = list.map((s, k) => (k === 0 ? 0 : Math.min(dur, Math.max(0, resolveCue(s.at, words, dur, `scene ${i + 1} shot ${k + 1}`)))));
    list.forEach((s, k) => {
      const st = starts[k], en = k < list.length - 1 ? starts[k + 1] : dur;
      if (en - st < 0.05) return warn(`scene ${i + 1} shot ${k + 1} has no time (check its "at" cue)`);
      const sw = words.map(w => ({ ...w, t0: w.t0 - st, t1: w.t1 - st }));
      const { at, keep, ...body } = s; void at;
      if (body.items) body.items = body.items.map(it => (it.cast ? { ...(proj.cast || {})[it.cast], id: it.cast, ...it } : it));
      const same = body.bg === 'same' || (body.bg && body.bg.same);
      const bgOver = same ? (typeof body.bg === 'object' ? { ...body.bg, same: undefined } : {}) : body.bg;
      const sh = sortKeyframes(resolveAll({ ...body, bg: bgOver, items: body.items || [] }, sw, en - st, `scene ${i + 1} shot ${k + 1}`));
      const prev = shots[shots.length - 1];
      if (same && prev) sh.bg = mergeBg(settledBg(prev), sh.bg);
      if (keep && prev) sh.items = [...keptItems(prev, keep), ...sh.items];
      Object.assign(sh, { start: t + st, dur: en - st, words: sw, first: k === 0, idx: shots.length });
      shots.push(sh);
    });
    t += dur;
  });
  const scenes = shots;
  const total = t;
  const topo = require('world-atlas/countries-50m.json');
  const data = { scenes, duration: total, topo, assets: collectAssets(scenes, projDir), captions: proj.captions || {}, handle: proj.handle, autoPush: proj.autoPush };
  log(`timeline: ${narr.length} scenes, ${anchored} pause anchors, ${shots.length} shots, ${total.toFixed(1)}s (avg ${(total / shots.length).toFixed(1)}s/shot)`);

  // stills for quick checks
  if (args.still != null) {
    const out = path.join(outDir, `still-${args.still}.png`);
    await renderStill(data, parseFloat(args.still), out, parseFloat(args.scale || 0.5));
    return log(`wrote ${out}`);
  }
  if (args.stills != null || args.shots) {
    const times = args.shots ? shots.map(s => s.start + s.dur * parseFloat(args.shots === true ? 0.8 : args.shots)) : null;
    const n = times ? times.length : parseInt(args.stills) || 8; const files = [];
    for (let k = 0; k < n; k++) {
      const tt = times ? times[k] : (k + 0.5) * total / n, f = path.join(cache, `sheet-${k}.png`);
      await renderStill(data, tt, f, 0.25); files.push(f);
    }
    const out = path.join(outDir, 'contact-sheet.png');
    await ffmpeg([...files.flatMap(f => ['-i', f]), '-filter_complex', `${files.map((_, k) => `[${k}]`).join('')}xstack=inputs=${n}:layout=${files.map((_, k) => `${(k % 5) * 270}_${Math.floor(k / 5) * 480}`).join('|')}:fill=black`, out]);
    return log(`wrote ${out}`);
  }

  // 4. audio
  const sfx = await ensureSfx(path.join(cache, 'sfx'));
  const events = args['no-sfx'] ? [] : sfxEvents(scenes, proj.sfx || {});
  const audio = path.join(cache, 'mix.m4a');
  await buildAudio({ scenes: narr, clips, sfx, events, music: proj.music && path.resolve(projDir, proj.music), musicVolume: proj.musicVolume, total, outFile: audio, workDir: cache });
  log(`audio mixed (${events.length} sound effects)`);

  if (args.remux) {
    const outFile = path.resolve(args.out || path.join(outDir, `${name}.mp4`)), tmp = outFile.replace(/\.mp4$/, '.remux.mp4');
    await ffmpeg(['-i', outFile, '-i', audio, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', tmp]);
    fs.renameSync(tmp, outFile);
    return log(`replaced audio in ${outFile}`);
  }

  // 5. video
  const preview = !!args.preview;
  const fps = parseInt(args.fps || (preview ? 24 : proj.fps || 30));
  const outFile = path.resolve(args.out || path.join(outDir, `${name}${preview ? '-preview' : ''}.mp4`));
  await renderVideo(data, { fps, scale: preview ? 0.5 : 1, outFile, audioFile: audio, workDir: cache, workers: args.workers && parseInt(args.workers) });
}

main().catch(e => { console.error(e); process.exit(1); });
