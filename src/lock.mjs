#!/usr/bin/env node
// Lock approved voice takes: copy each line's raw TTS clip into assets/voice/ and set
// scene.rawAudio, so later prompt or style edits can never re-voice (or lose) an approved line.
// Usage: node src/lock.mjs projects/<name> [lineNumbers...]   (default: every line with a raw clip)
import fs from 'node:fs';
import path from 'node:path';
import { sha1 } from './util.mjs';

const dir = path.resolve(process.argv[2] || '.');
const only = process.argv.slice(3).map(Number);
const file = path.join(dir, 'project.json');
const proj = JSON.parse(fs.readFileSync(file, 'utf8'));
const DEFAULT = { name: 'Charon', style: undefined, model: '' };
fs.mkdirSync(path.join(dir, 'assets/voice'), { recursive: true });

proj.scenes.forEach((sc, i) => {
  const n = i + 1;
  if (!sc.say || sc.rawAudio || (only.length && !only.includes(n))) return;
  const v = { ...DEFAULT, ...(proj.voice || {}), ...(sc.voice || {}) };
  const style = sc.direction ? `${v.style}, ${sc.direction}` : v.style;
  const raw = path.join(dir, '.cache/tts', `${sha1(JSON.stringify([sc.tts || sc.say, v.name, style, v.model || '']))}.tts.wav`);
  if (!fs.existsSync(raw)) return console.log(`line ${n}: no raw take found (not voiced yet?)`);
  const dest = `assets/voice/line${String(n).padStart(2, '0')}.wav`;
  fs.copyFileSync(raw, path.join(dir, dest));
  sc.rawAudio = dest;
  console.log(`line ${n}: locked -> ${dest}`);
});
fs.writeFileSync(file, JSON.stringify(proj, null, 1));
