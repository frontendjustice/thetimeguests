// Drives the browser runtime frame-by-frame and encodes with ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { ffmpeg, log } from './util.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall through */ }
  const globalRoot = require('node:child_process').execSync('npm root -g').toString().trim();
  return require(path.join(globalRoot, 'playwright'));
}

async function openPage(browser, data, scale) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.warn('  [page]', m.text()); });
  page.on('pageerror', e => console.error('  [page error]', e.message));
  await page.goto('file://' + path.join(ROOT, 'runtime/index.html'));
  for (const f of ['node_modules/d3-array/dist/d3-array.min.js', 'node_modules/d3-geo/dist/d3-geo.min.js', 'node_modules/topojson-client/dist/topojson-client.min.js', 'runtime/engine.js', 'runtime/kit.js'])
    await page.addScriptTag({ path: path.join(ROOT, f) });
  await page.evaluate(d => window.__init(d), data);
  return page;
}

const shot = page => page.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1080, height: 1920 } });

export async function renderStill(data, t, outFile, scale = 0.5) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, data, scale);
    await page.evaluate(tt => window.__frame(tt), t);
    await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  } finally { await browser.close(); }
}

export async function renderVideo(data, { fps = 30, scale = 1, outFile, audioFile, workDir, workers }) {
  const total = data.duration;
  const nFrames = Math.ceil(total * fps);
  const nw = Math.max(1, Math.min(workers || os.cpus().length, 6));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const per = Math.ceil(nFrames / nw);
  let done = 0; const t0 = Date.now();
  const tick = () => { done++; if (done % fps === 0 || done === nFrames) process.stdout.write(`\r› rendering ${done}/${nFrames} frames (${((Date.now() - t0) / 1000).toFixed(0)}s)   `); };
  const segs = [];
  try {
    await Promise.all(Array.from({ length: nw }, async (_, w) => {
      const a = w * per, b = Math.min(nFrames, a + per); if (a >= b) return;
      const seg = path.join(workDir, `seg${w}.mp4`); segs[w] = seg;
      const page = await openPage(browser, data, scale);
      const enc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), seg], { stdio: ['pipe', 'ignore', 'inherit'] });
      const closed = new Promise((res, rej) => enc.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg segment failed')))));
      for (let i = a; i < b; i++) {
        await page.evaluate(tt => window.__frame(tt), i / fps);
        const buf = await shot(page);
        if (!enc.stdin.write(buf)) await new Promise(r => enc.stdin.once('drain', r));
        tick();
      }
      enc.stdin.end(); await closed; await page.close();
    }));
  } finally { await browser.close(); }
  process.stdout.write('\n');
  const list = path.join(workDir, 'segments.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map(s => `file '${s}'`).join('\n'));
  const args = ['-f', 'concat', '-safe', '0', '-i', list];
  if (audioFile) args.push('-i', audioFile, '-map', '0:v', '-map', '1:a', '-c:a', 'copy');
  args.push('-c:v', 'copy', '-movflags', '+faststart', '-t', total.toFixed(3), outFile);
  await ffmpeg(args);
  log(`wrote ${outFile} (${total.toFixed(1)}s, ${nFrames} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s render)`);
}
