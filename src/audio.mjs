// Narration track + synthesized sound effects + optional music -> final mix.
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ensureDir } from './util.mjs';

const SFX = {
  pop: ['-f', 'lavfi', '-i', "aevalsrc='0.55*sin(2*PI*(500+2600*t)*t)*exp(-34*t)':s=44100:d=0.16"],
  tick: ['-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*1700*t)*exp(-70*t)+0.3*sin(2*PI*900*t)*exp(-50*t)':s=44100:d=0.1"],
  whoosh: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.5:c=pink:a=0.6:r=44100', '-af', 'bandpass=f=1400:w=1200,afade=t=in:d=0.22,afade=t=out:st=0.22:d=0.28'],
  boom: ['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*48*t)*exp(-2.6*t)+0.5*sin(2*PI*31*t)*exp(-1.8*t)':s=44100:d=1.8", '-f', 'lavfi', '-i', 'anoisesrc=d=1.8:c=brown:a=0.9:r=44100',
    '-filter_complex', '[1]lowpass=f=420,afade=t=out:st=0.03:d=1.7[n];[0][n]amix=inputs=2:normalize=0,volume=1.4'],
  drone: ['-f', 'lavfi', '-i', "aevalsrc='0.22*sin(2*PI*92*t)+0.18*sin(2*PI*95.5*t)+0.08*sin(2*PI*184*t)':s=44100:d=3", '-af', 'afade=t=in:d=0.6,afade=t=out:st=2.2:d=0.8'],
  thud: ['-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*(140-80*t)*t)*exp(-14*t)':s=44100:d=0.3"],
  slam: ['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*(110-60*t)*t)*exp(-10*t)':s=44100:d=0.5", '-f', 'lavfi', '-i', 'anoisesrc=d=0.5:c=brown:a=0.8:r=44100',
    '-filter_complex', '[1]lowpass=f=900,afade=t=out:st=0.01:d=0.35[n];[0][n]amix=inputs=2:normalize=0'],
  whistle: ['-f', 'lavfi', '-i', "aevalsrc='0.35*(sin(2*PI*660*t)+sin(2*PI*830*t)+0.5*sin(2*PI*990*t))*(1-exp(-20*t))*lt(t,1.1)':s=44100:d=1.4", '-af', 'afade=t=out:st=0.9:d=0.5'],
  rumble: ['-f', 'lavfi', '-i', 'anoisesrc=d=2.5:c=brown:a=0.8:r=44100', '-af', 'lowpass=f=180,tremolo=f=9:d=0.5,afade=t=in:d=0.4,afade=t=out:st=1.8:d=0.7'],
  cash: ['-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*2093*t)*exp(-9*t)+0.4*sin(2*PI*2637*(t-0.09))*exp(-9*(t-0.09))*gt(t,0.09)':s=44100:d=0.7"],
  crumble: ['-f', 'lavfi', '-i', 'anoisesrc=d=1.4:c=pink:a=0.7:r=44100', '-af', 'lowpass=f=1200,tremolo=f=23:d=0.8,afade=t=out:st=0.2:d=1.2'],
};

export async function ensureSfx(dir) {
  ensureDir(dir);
  const out = {};
  for (const [name, args] of Object.entries(SFX)) {
    const f = path.join(dir, `${name}.wav`);
    if (!fs.existsSync(f)) await ffmpeg([...args, '-ac', '1', f]);
    out[name] = f;
  }
  return out;
}

// Decide which sound plays when, from the resolved timeline.
export function sfxEvents(scenes, opts = {}) {
  if (opts.enabled === false) return [];
  const ev = [];
  const add = (type, t, vol = 1) => ev.push({ type, t, vol: vol * (opts.volume == null ? 1 : opts.volume) });
  scenes.forEach((sc, i) => {
    if (i > 0 && sc.transitionSfx !== false) add('whoosh', sc.start, sc.first ? 0.32 : 0.16);
    for (const it of sc.items || []) {
      const t = sc.start + (it.at || 0);
      if (it.sfx === false || (it.at || 0) < -0.01 && it.type !== 'char') { if (it.blowAt == null) continue; }
      if (typeof it.sfx === 'string') { add(it.sfx, t, 0.8); continue; }
      switch (it.type) {
        case 'boom': add('boom', t, 0.6 * Math.min(it.size || 1, 1.2)); break;
        case 'arrow': add('whoosh', t, 0.45); break;
        case 'plane': add('drone', t, 0.6); break;
        case 'check': case 'cross': add('tick', t, 0.8); break;
        case 'text': add(it.style === 'stamp' ? 'thud' : it.style === 'date' ? 'tick' : 'pop', t, it.style === 'stamp' ? 0.5 : 0.7); break;
        case 'marker': case 'token': case 'image': case 'label': case 'flagpole': add('pop', t, 0.45); break;
        case 'char':
          if ((it.at || 0) >= 0 && (it.enter || 'pop') !== 'none') add(it.enter === 'pop' || !it.enter ? 'pop' : 'whoosh', t, 0.4);
          for (const th of it.throws || []) add('whoosh', sc.start + th.at, 0.5);
          if (it.fly) add('whoosh', sc.start + it.fly.at, 0.6);
          for (const e of it.emotes || []) add('pop', sc.start + e.at, 0.35);
          for (const h of it.holds || []) if (h.drop) add('thud', sc.start + h.at + 0.4, 0.6);
          break;
        case 'vehicle': if ((it.at || 0) >= 0) add(it.kind === 'train' ? 'whistle' : 'rumble', t, it.kind === 'train' ? 0.25 : 0.6); break;
        case 'flow': if ((it.at || 0) >= 0) add((it.icon || 'money') === 'money' || it.icon === 'gold' ? 'cash' : 'whoosh', t, 0.45); break;
        case 'wararrow': add('boom', t, 0.5); break;
        case 'route': if ((it.at || 0) >= 0) add('whoosh', t, 0.35); break;
        case 'mushroom': add('boom', t, 1); break;
        case 'icon': case 'fire': case 'bunker': case 'tunnel': case 'bridge': if ((it.at || 0) >= 0) add('pop', t, 0.4); break;
        case 'drawer': if (it.closeAt != null) add('slam', sc.start + it.closeAt + 0.1, 0.45); break;
        case 'door': if (it.closeAt != null) add('slam', sc.start + it.closeAt + 0.1, 0.35); break;
        case 'typewriter': { const t0 = sc.start + (it.typeAt == null ? (it.at || 0) : it.typeAt); for (let k = 0; k < Math.floor((it.dur || 1.5) / 0.11); k++) add('tick', t0 + k * 0.11 + (k % 3) * 0.02, 0.35); break; }
        case 'radio': if (it.sendAt != null) for (let k = 0; k < 8; k++) add('tick', sc.start + it.sendAt + k * 0.16 + (k % 2) * 0.06, 0.3); break;
        case 'doc': case 'medal': case 'agentcard': case 'chicken': case 'rat': case 'crate': case 'thought': case 'desk': if ((it.at || 0) >= 0) add('pop', t, 0.4); break;
        case 'web': if ((it.at || 0) >= 0) for (let k = 0; k < (it.points || []).length; k += 3) add('pop', t + (it.dur || 0.25) + k * (it.every == null ? 0.06 : it.every), 0.22); break;
      }
      if (it.blowAt != null) { add('boom', sc.start + it.blowAt, 0.45); if (it.type === 'bridge' || it.type === 'tunnel') add('crumble', sc.start + it.blowAt + 0.3, 0.45); }
      if (it.type === 'crate' && it.openAt != null && it.openAt >= 0 && it.sfx !== false) add('tick', sc.start + it.openAt, 0.3);
      if (it.type === 'agentcard') { if (it.sickAt != null && it.sickAt >= 0) add('pop', sc.start + it.sickAt, 0.4); if (it.deadAt != null && it.deadAt >= 0) add('thud', sc.start + it.deadAt, 0.45); }
      if (it.explosives != null && it.explosives >= 0) add('tick', sc.start + it.explosives, 0.7);
    }
  });
  // avoid stacking identical sounds within 60ms
  ev.sort((a, b) => a.t - b.t);
  return ev.filter((e, i) => !ev.slice(Math.max(0, i - 4), i).some(p => p.type === e.type && e.t - p.t < 0.06));
}

export async function buildAudio({ scenes, clips, sfx, events, music, musicVolume = 0.12, total, outFile, workDir }) {
  ensureDir(workDir);
  // 1. narration, each clip padded to its scene length
  const narr = path.join(workDir, 'narration.wav');
  const inArgs = [], parts = [];
  scenes.forEach((sc, i) => {
    inArgs.push('-i', clips[i].file);
    parts.push(`[${i}]aresample=44100,aformat=channel_layouts=mono,apad,atrim=0:${sc.dur.toFixed(3)},asetpts=N/SR/TB[a${i}]`);
  });
  const fc = parts.join(';') + ';' + scenes.map((_, i) => `[a${i}]`).join('') + `concat=n=${scenes.length}:v=0:a=1[out]`;
  await ffmpeg([...inArgs, '-filter_complex', fc, '-map', '[out]', narr]);

  // 2. sfx + music on top
  const args = ['-i', narr]; const chains = []; const labels = ['[0]'];
  const types = [...new Set(events.map(e => e.type))];
  types.forEach(tp => args.push('-i', sfx[tp]));
  let n = 0;
  for (const tp of types) {
    const idx = 1 + types.indexOf(tp);
    const evs = events.filter(e => e.type === tp);
    if (!evs.length) continue;
    chains.push(`[${idx}]asplit=${evs.length}${evs.map((_, k) => `[s${tp}${k}]`).join('')}`);
    evs.forEach((e, k) => { const ms = Math.round(e.t * 1000); chains.push(`[s${tp}${k}]volume=${e.vol.toFixed(2)},adelay=${ms}|${ms}[e${n}]`); labels.push(`[e${n}]`); n++; });
  }
  if (music && fs.existsSync(music)) {
    const mi = 1 + types.length; args.push('-stream_loop', '-1', '-i', music);
    chains.push(`[${mi}]aformat=channel_layouts=mono,volume=${musicVolume},atrim=0:${total.toFixed(3)},afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5[mus]`);
    labels.push('[mus]');
  }
  chains.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first,alimiter=limit=0.95,aformat=channel_layouts=stereo[mix]`);
  await ffmpeg([...args, '-filter_complex', chains.join(';'), '-map', '[mix]', '-t', total.toFixed(3), '-c:a', 'aac', '-b:a', '192k', outFile]);
  return outFile;
}
