// Turns project.json into an absolute timeline the browser runtime can draw.
// Any `at` / `until` / `moveAt` may be a number (seconds into the scene) or a cue string:
//   "bomb"        -> when the narrator starts saying a word beginning with "bomb"
//   "bomb#2"      -> the second such word
//   "atomic bomb" -> a phrase
//   "bomb+0.4"    -> offset in seconds; also "start+1", "end-0.5"
import { warn } from './util.mjs';

const norm = s => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');

export function resolveCue(v, words, dur, ctx) {
  if (v == null) return v;
  if (typeof v === 'number') return v; // seconds from shot start; negative = already on screen at the cut
  const m = /^(.*?)(?:([+-])(\d*\.?\d+))?$/.exec(String(v).trim());
  let base = m[1].trim(); const off = m[3] ? (m[2] === '-' ? -1 : 1) * parseFloat(m[3]) : 0;
  if (base === 'start' || base === '') return Math.max(0, off);
  if (base === 'end') return Math.max(0, dur + off);
  let nth = 1; const hm = /^(.*)#(\d+)$/.exec(base); if (hm) { base = hm[1]; nth = +hm[2]; }
  const target = base.split(/\s+/).map(norm).filter(Boolean);
  const ws = words.map(w => norm(w.w));
  const find = exact => {
    let seen = 0;
    for (let i = 0; i + target.length <= ws.length; i++) {
      let ok = true;
      for (let j = 0; j < target.length; j++) {
        const a = ws[i + j], b = target[j];
        if (!(exact ? a === b : a.startsWith(b))) { ok = false; break; }
      }
      if (ok && ++seen === nth) return i;
    }
    return -1;
  };
  // prefer matches at/after the start of the current shot (words with t0 >= 0 after shifting)
  const firstAfter = ws.findIndex((_, k) => words[k].t1 > 0.02);
  const findFrom = exact => { if (firstAfter < 0) return -1; const save = ws.splice(0, firstAfter); const r = find(exact); ws.unshift(...save); return r < 0 ? -1 : r + firstAfter; };
  let i = findFrom(true); if (i < 0) i = findFrom(false); if (i < 0) i = find(true); if (i < 0) i = find(false);
  if (i < 0) { warn(`${ctx}: cue "${v}" not found in narration; using 0`); return Math.max(0, off); }
  return words[i].t0 + off; // may be negative: already happened before this shot
}

const CUE_KEYS = new Set(['at', 'until', 'moveAt', 'blowAt', 'explosives', 'closeAt', 'paperAt', 'vehicleAt', 'addAt', 'openAt', 'typeAt', 'sickAt', 'deadAt', 'ghostAt', 'sendAt', 'sendUntil']);
const CUE_LISTS = new Set(['jumps', 'drops']);
export function resolveAll(obj, words, dur, ctx) {
  if (Array.isArray(obj)) return obj.map(o => resolveAll(o, words, dur, ctx));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = CUE_KEYS.has(k) ? resolveCue(v, words, dur, ctx) : CUE_LISTS.has(k) ? [].concat(v).map(c => resolveCue(c, words, dur, ctx)) : resolveAll(v, words, dur, ctx);
    return out;
  }
  return obj;
}

// Sort keyframe-like lists by time so the runtime can scan them in order.
export function sortKeyframes(scene) {
  const byAt = l => Array.isArray(l) ? l.slice().sort((a, b) => (a.at || 0) - (b.at || 0)) : l;
  if (scene.bg && Array.isArray(scene.bg.view)) scene.bg.view = byAt(scene.bg.view);
  if (Array.isArray(scene.camera)) scene.camera = byAt(scene.camera);
  for (const it of scene.items || []) for (const k of ['poses', 'moods', 'say', 'moves', 'holds', 'emotes', 'throws']) if (it[k]) it[k] = byAt(it[k]);
  return scene;
}
