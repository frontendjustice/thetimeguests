#!/usr/bin/env node
// YouTube channel banner (2560x1440; the centre 1546x423 is the area every device shows).
// Reuses the video engine's characters, props and map data. Usage: node projects/channel-banner/banner.mjs [--guides]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIR = path.join(ROOT, 'projects/channel-banner');
const guides = process.argv.includes('--guides');
const globalRoot = require('node:child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(globalRoot, 'playwright'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('[page error]', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
await page.goto('file://' + path.join(DIR, 'banner.html'));
for (const f of ['node_modules/d3-array/dist/d3-array.min.js', 'node_modules/d3-geo/dist/d3-geo.min.js', 'node_modules/topojson-client/dist/topojson-client.min.js', 'runtime/engine.js', 'runtime/kit.js'])
  await page.addScriptTag({ path: path.join(ROOT, f) });
await page.evaluate(d => window.__init(d), { topo: require('world-atlas/countries-50m.json'), scenes: [], assets: {} });

await page.evaluate((guides) => {
  const BW = 2560, BH = 1440, SAFE = { x: (BW - 1546) / 2, y: (BH - 423) / 2, w: 1546, h: 423 };
  const at = (px, py) => ({ x: px / W, y: py / H }); // engine positions are fractions of its 1080x1920 stage
  const lt = 1.3;
  const char = (o) => drawChar(Object.assign({ at: -5, enter: 'none' }, o), lt);
  // --- background: a paper map of Europe ---
  const proj = d3.geoMercator().fitExtent([[-80, -60], [BW + 80, BH + 220]], { type: 'MultiPoint', coordinates: [[-13, 34], [36, 34], [36, 62], [-13, 62]] });
  const path = d3.geoPath(proj);
  let s = `<defs>${S.defs.replace(/^<defs>|<\/defs>$/g, '')}
    <radialGradient id="bvig" cx=".5" cy=".5" r=".75"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14110d" stop-opacity="0"/><stop offset=".22" stop-color="#14110d" stop-opacity=".78"/><stop offset=".78" stop-color="#14110d" stop-opacity=".78"/><stop offset="1" stop-color="#14110d" stop-opacity="0"/></linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .28  0 0 0 0 .18  0 0 0 .22 0"/></filter><filter id="stain"><feTurbulence type="fractalNoise" baseFrequency=".004" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .32  0 0 0 0 .15  0 0 0 .35 -.05"/></filter></defs>`;
  s += `<rect width="${BW}" height="${BH}" fill="#7fa3a8"/>`;
  s += `<path d="${path(d3.geoGraticule().step([5, 5])())}" fill="none" stroke="#5f8388" stroke-width="2" opacity=".5"/>`;
  s += `<path d="${path(S.land)}" fill="#e6d3a3" stroke="#6b5a3a" stroke-width="2.5"/>`;
  s += `<path d="${path(S.borders)}" fill="none" stroke="#9c8a62" stroke-width="2" stroke-dasharray="8 6"/>`;
  s += `<rect width="${BW}" height="${BH}" filter="url(#stain)"/><rect width="${BW}" height="${BH}" filter="url(#grain)"/>`;
  const P = (lon, lat) => proj([lon, lat]);
  // --- nods to the episodes, drawn on the map ---
  const ldn = P(-0.13, 51.5);
  const towns = [[-2.98, 53.41], [-4.25, 55.86], [-3.19, 55.95], [-1.9, 52.48], [-2.24, 53.48], [-1.55, 53.8], [-1.61, 54.97], [-2.1, 57.15], [-4.14, 50.37], [-1.4, 50.9], [1.3, 52.63], [-3.18, 51.48]];
  for (const t of towns) { const q = P(...t); s += `<path d="M${ldn[0]},${ldn[1]} Q${(ldn[0] + q[0]) / 2},${(ldn[1] + q[1]) / 2 + 20} ${q[0]},${q[1]}" stroke="#c62828" stroke-width="3" fill="none" opacity=".8"/><circle cx="${q[0]}" cy="${q[1]}" r="9" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="5 4"/>`; }
  s += `<circle cx="${ldn[0]}" cy="${ldn[1]}" r="12" fill="#222" stroke="#fff" stroke-width="4"/>`;
  const lis = P(-9.14, 38.72), huel = P(-6.95, 37.26), sic = P(14.2, 37.5), cal = P(1.86, 50.95), nor = P(-0.6, 49.35);
  s += `<path d="M${ldn[0]},${ldn[1]} Q${ldn[0] - 260},${(ldn[1] + lis[1]) / 2} ${lis[0]},${lis[1]}" stroke="#2b2b2b" stroke-width="5" fill="none" stroke-dasharray="14 10" opacity=".7"/>`;
  s += `<path d="M${huel[0]},${huel[1]} Q${(huel[0] + sic[0]) / 2},${huel[1] - 160} ${sic[0]},${sic[1]}" stroke="#2b2b2b" stroke-width="5" fill="none" stroke-dasharray="14 10" opacity=".55"/>`;
  s += `<g transform="translate(${nor[0]},${nor[1]})"><path d="M-22,-22 L22,22 M22,-22 L-22,22" stroke="#d62828" stroke-width="10" stroke-linecap="round"/></g>`;
  s += `<path d="M${cal[0] - 40},${cal[1] - 120} Q${cal[0] - 60},${cal[1] - 50} ${cal[0] - 8},${cal[1] - 14}" stroke="#ff7a1a" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M${cal[0] - 30},${cal[1] - 26} l22,12 l2,-26" stroke="#ff7a1a" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const sw = P(8.2, 46.8); s += flagSVG('switzerland', sw[0] - 33, sw[1] - 22, 66, 44);
  const tk = P(32.8, 39.9); s += flagSVG('turkey', tk[0] - 33, tk[1] - 22, 66, 44);
  s += `<rect width="${BW}" height="${BH}" fill="url(#bvig)"/>`;
  // --- outer characters (desktop / TV only) ---
  s += char({ x: 300 / W, y: 1405 / H, scale: 0.78, outfit: 'suit', color: '#1f2833', tie: '#c62828', hair: 'bald', wide: true, hold: 'cigar', pose: 'hold', mood: 'smug', face: 'right' });
  s += `<g>${ITEM.crate({ x: 2290 / W, y: 1190 / H, scale: 0.62, label: 'TOP SECRET', openAt: -5, rats: 3, at: -5 }, lt)}</g>`;
  // --- title band (safe area) ---
  s += `<rect x="0" y="${SAFE.y - 30}" width="${BW}" height="${SAFE.h + 60}" fill="url(#band)"/>`;
  s += outlineText(BW / 2, SAFE.y + 205, 'THE TIME GUEST', { size: 190, font: 'Bangers', color: '#ffe11a', stroke: 34, strokeColor: '#111', spacing: 6 });
  s += outlineText(BW / 2, SAFE.y + 310, 'WW2 STORIES THAT SOUND MADE UP... BUT ARE TRUE', { size: 60, font: 'Bangers', color: '#ffffff', stroke: 12, strokeColor: '#111', spacing: 3 });
  s += `<text x="${BW / 2}" y="${SAFE.y + 385}" font-size="44" font-weight="800" text-anchor="middle" fill="#e6d3a3" letter-spacing="3">@thetimeguest</text>`;
  // --- inner characters (inside the safe area) ---
  s += `<g>${ITEM.chicken({ x: 712 / W, y: (SAFE.y + SAFE.h - 6) / H, scale: 0.42, face: 'right', at: -5 }, lt)}</g>`;
  s += char({ x: 625 / W, y: (SAFE.y + SAFE.h - 4) / H, scale: 0.55, outfit: 'suit', color: '#3a3a44', hair: 'slick', hairColor: '#222', mustache: 'thin', hat: 'fedora', hatColor: '#222', mood: 'smug', pose: 'hips', face: 'right' });
  s += `<g>${ITEM.rat({ x: 1845 / W, y: (SAFE.y + SAFE.h - 30) / H, scale: 0.36, dead: true, explosive: true, fuse: true, face: 'left', at: -5 }, lt)}</g>`;
  s += char({ x: 1955 / W, y: (SAFE.y + SAFE.h - 4) / H, scale: 0.55, outfit: 'military', color: '#7a7a63', hair: 'side', mustache: 'toothbrush', mood: 'shocked', pose: 'surrender', face: 'left', emotes: [{ at: -5, kind: '!!', until: 99 }] });
  if (guides) s += `<rect x="${SAFE.x}" y="${SAFE.y}" width="${SAFE.w}" height="${SAFE.h}" fill="none" stroke="#00e5ff" stroke-width="6" stroke-dasharray="20 12"/><rect x="${(BW - 2560) / 2}" y="${(BH - 423) / 2 - 0}" width="2560" height="423" fill="none" stroke="#ff4081" stroke-width="4" stroke-dasharray="10 10"/>`;
  document.getElementById('banner').innerHTML = s;
}, guides);
await page.evaluate(() => document.fonts.ready);
const out = path.join(DIR, 'out'); fs.mkdirSync(out, { recursive: true });
const file = path.join(out, guides ? 'banner-guides.png' : 'banner.png');
await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 2560, height: 1440 } });
await browser.close();
console.log('wrote', file);
