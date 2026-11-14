/* Shorts engine runtime: draws one frame of the video for a given time t.
 * Node drives it: window.__init(data) once, then window.__frame(t) per frame.
 * Coordinates: stage is 1080x1920. On map scenes, points are [lon, lat];
 * elsewhere points are {x, y} fractions of the frame (0..1). */
'use strict';

const W = 1080, H = 1920;
const S = { data: null, feats: {}, cur: -1, proj: null, noise: null, bgStatic: '', defs: '' };

// ---------- math helpers ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const backOut = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = n => (Math.round(n * 10) / 10);
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hashStr(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// ---------- historical groupings on top of modern borders ----------
const GROUPS = {
  'USSR': ['Russia', 'Ukraine', 'Belarus', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Georgia', 'Armenia', 'Azerbaijan', 'Moldova', 'Lithuania', 'Latvia', 'Estonia'],
  'Soviet Union': '@USSR',
  'Korea': ['North Korea', 'South Korea'],
  'Yugoslavia': ['Serbia', 'Croatia', 'Slovenia', 'Bosnia and Herz.', 'Montenegro', 'Macedonia', 'Kosovo'],
  'Czechoslovakia': ['Czechia', 'Slovakia'],
  'French Indochina': ['Vietnam', 'Laos', 'Cambodia'],
  'Dutch East Indies': ['Indonesia'],
  'USA': ['United States of America'],
  'US': ['United States of America'],
  'UK': ['United Kingdom'],
  'Britain': ['United Kingdom'],
  'British India': ['India', 'Pakistan', 'Bangladesh', 'Myanmar'],
};
// Rough historical regions not in the modern dataset ([lon, lat] rings).
const REGIONS = {
  'Manchuria': [[119.5, 53.3], [123.5, 53.5], [127, 50.2], [130.6, 48.9], [133.5, 48.2], [135, 48.4], [134.7, 47.7], [133.1, 45], [131.2, 44.9], [130.6, 42.4], [129.5, 42.4], [128, 41.9], [126.6, 41.7], [124.3, 39.9], [121.6, 38.9], [121, 40.8], [119.5, 39.9], [117.6, 40.9], [116.6, 42.3], [115.6, 44.6], [117.5, 46.6], [119.8, 47.3], [117.8, 49.5], [119.5, 53.3]],
  'Sakhalin South': [[141.8, 50], [143.9, 50], [144.5, 49], [143.2, 46.6], [142, 45.9], [141.8, 47.5], [141.8, 50]],
  'Kuril Islands': [[145.4, 43.2], [146.6, 43.9], [148.9, 45.6], [150.7, 46.3], [152.3, 47.6], [154.6, 49.4], [156.6, 50.9], [156.0, 51.0], [154.3, 49.8], [152.0, 48.0], [150.2, 46.8], [148.5, 46.0], [146.4, 44.5], [145.2, 43.6], [145.4, 43.2]],
};

function featuresFor(names) {
  const out = [];
  const list = Array.isArray(names) ? names : [names];
  for (let n of list) {
    if (typeof n === 'object' && n.coords) { out.push(polyFeature(n.coords)); continue; }
    let g = GROUPS[n];
    if (typeof g === 'string') g = GROUPS[g.slice(1)];
    if (g) { out.push(...featuresFor(g)); continue; }
    if (REGIONS[n]) { out.push(polyFeature(REGIONS[n], n)); continue; }
    if (S.feats[n]) out.push(S.feats[n]);
    else console.warn('unknown country/region: ' + n);
  }
  return out;
}
const _polyCache = new Map();
function polyFeature(coords, key) {
  key = key || JSON.stringify(coords);
  if (_polyCache.has(key)) return _polyCache.get(key);
  let ring = coords.slice();
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
  let f = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } };
  if (d3.geoArea(f) > 2 * Math.PI) f = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring.slice().reverse()] } };
  _polyCache.set(key, f);
  return f;
}

// ---------- timing helpers ----------
function appear(it, lt, d = 0.3) { return clamp((lt - (it.at || 0)) / d); }
function visible(it, lt) { return lt >= (it.at || 0) && lt < (it.until == null ? Infinity : it.until); }
function exitP(it, lt, d = 0.25) { return it.until == null ? 0 : clamp((lt - (it.until - d)) / d); }
// keyframes: [{at, dur, ...values}] -> interpolated values at lt
function keyframes(list, lt, keys, base) {
  if (!Array.isArray(list)) list = [list];
  let cur = Object.assign({}, base || {}, list[0]);
  for (let i = 1; i < list.length; i++) {
    const k = list[i];
    if (lt < k.at) break;
    const p = easeIO(clamp((lt - k.at) / (k.dur == null ? 0.6 : Math.max(k.dur, 0.001))));
    const next = Object.assign({}, cur);
    for (const key of keys) if (k[key] != null) {
      next[key] = key === 'span' || key === 'zoom' ? Math.exp(lerp(Math.log(cur[key]), Math.log(k[key]), p)) : lerp(cur[key], k[key], p);
    }
    cur = next;
  }
  return cur;
}

// ---------- points ----------
function pt(p) {
  if (p == null) return [W / 2, H / 2];
  if (Array.isArray(p)) return S.proj ? S.proj(p) : [p[0] * W, p[1] * H];
  if (p.lon != null && S.proj) return S.proj([p.lon, p.lat]);
  return [(p.x == null ? 0.5 : p.x) * W, (p.y == null ? 0.5 : p.y) * H];
}
function posOf(it) {
  if (it.pos) return pt(it.pos);
  if (it.lon != null) return pt([it.lon, it.lat]);
  return pt({ x: it.x, y: it.y });
}

// ---------- flags ----------
function flagInner(name) {
  switch ((name || '').toLowerCase()) {
    case 'usa': case 'us': {
      let s = '<rect width="30" height="20" fill="#fff"/>';
      for (let i = 0; i < 7; i++) s += `<rect y="${f1(i * 20 / 6.5)}" width="30" height="${f1(20 / 13)}" fill="#b22234"/>`;
      s += '<rect width="12" height="10.8" fill="#3c3b6e"/>';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) s += `<circle cx="${1.4 + c * 2.3}" cy="${1.4 + r * 2.6}" r=".55" fill="#fff"/>`;
      return s;
    }
    case 'japan': return '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>';
    case 'risingsun': {
      let s = '<rect width="30" height="20" fill="#fff"/>';
      for (let i = 0; i < 16; i += 2) { const a1 = i * Math.PI / 8, a2 = (i + 1) * Math.PI / 8; s += `<path d="M13,10 L${f1(13 + 40 * Math.cos(a1))},${f1(10 + 40 * Math.sin(a1))} L${f1(13 + 40 * Math.cos(a2))},${f1(10 + 40 * Math.sin(a2))}Z" fill="#bc002d"/>`; }
      return s + '<circle cx="13" cy="10" r="5" fill="#bc002d"/>';
    }
    case 'ussr': case 'soviet': return '<rect width="30" height="20" fill="#cc0000"/><path d="M5,2.2 L5.7,4.1 L7.7,4.1 L6.1,5.3 L6.7,7.2 L5,6 L3.3,7.2 L3.9,5.3 L2.3,4.1 L4.3,4.1Z" fill="#ffd700"/><path d="M3.4,9.5 Q5,8 6.8,9.6 M4,11 L6.6,8.6" stroke="#ffd700" stroke-width=".8" fill="none"/>';
    case 'uk': case 'britain': return '<rect width="30" height="20" fill="#012169"/><path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" stroke-width="4"/><path d="M0,0 L30,20 M30,0 L0,20" stroke="#c8102e" stroke-width="1.4"/><path d="M15,0 V20 M0,10 H30" stroke="#fff" stroke-width="6"/><path d="M15,0 V20 M0,10 H30" stroke="#c8102e" stroke-width="3.4"/>';
    case 'france': return '<rect width="10" height="20" fill="#0055a4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ef4135"/>';
    case 'italy': return '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce2b37"/>';
    case 'germany': return '<rect width="30" height="7" fill="#000"/><rect y="6.6" width="30" height="7" fill="#dd0000"/><rect y="13.3" width="30" height="6.7" fill="#ffce00"/>';
    case 'wehrmacht': case 'germany1940': return '<rect width="30" height="20" fill="#5b5f55"/><path d="M12,3 H18 V7 H22 V3 H24 V17 H22 V13 H18 V17 H12 V13 H8 V17 H6 V3 H8 V7 H12Z" fill="#fff"/><path d="M13,4 H17 V8 H23 V12 H17 V16 H13 V12 H7 V8 H13Z" fill="#111"/>';
    case 'china': case 'roc': return '<rect width="30" height="20" fill="#fe0000"/><rect width="15" height="10" fill="#000095"/><circle cx="7.5" cy="5" r="2.6" fill="#fff"/>';
    case 'prc': return '<rect width="30" height="20" fill="#de2910"/><circle cx="5" cy="5" r="2.4" fill="#ffde00"/>';
    case 'poland': return '<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#dc143c"/>';
    case 'spain': return '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>';
    case 'finland': return '<rect width="30" height="20" fill="#fff"/><rect x="8" width="5" height="20" fill="#002f6c"/><rect y="7.5" width="30" height="5" fill="#002f6c"/>';
    case 'sweden': return '<rect width="30" height="20" fill="#006aa7"/><rect x="8" width="4" height="20" fill="#fecc00"/><rect y="8" width="30" height="4" fill="#fecc00"/>';
    case 'norway': return '<rect width="30" height="20" fill="#ba0c2f"/><rect x="7" width="6" height="20" fill="#fff"/><rect y="7" width="30" height="6" fill="#fff"/><rect x="8.5" width="3" height="20" fill="#00205b"/><rect y="8.5" width="30" height="3" fill="#00205b"/>';
    case 'greece': { let s = ''; for (let i = 0; i < 9; i++) s += `<rect y="${f1(i * 20 / 9)}" width="30" height="${f1(20 / 9 + .1)}" fill="${i % 2 ? '#fff' : '#0d5eaf'}"/>`; return s + '<rect width="11.1" height="11.1" fill="#0d5eaf"/><rect x="4.4" width="2.2" height="11.1" fill="#fff"/><rect y="4.4" width="11.1" height="2.2" fill="#fff"/>'; }
    case 'yugoslavia': return '<rect width="30" height="7" fill="#0c4076"/><rect y="6.6" width="30" height="7" fill="#fff"/><rect y="13.3" width="30" height="6.7" fill="#c6363c"/>';
    case 'belgium': return '<rect width="10" height="20" fill="#000"/><rect x="10" width="10" height="20" fill="#fdda24"/><rect x="20" width="10" height="20" fill="#ef3340"/>';
    case 'netherlands': return '<rect width="30" height="7" fill="#ae1c28"/><rect y="6.6" width="30" height="7" fill="#fff"/><rect y="13.3" width="30" height="6.7" fill="#21468b"/>';
    case 'australia': return '<rect width="30" height="20" fill="#012169"/><circle cx="7.5" cy="15" r="1.6" fill="#fff"/><circle cx="22" cy="5" r=".9" fill="#fff"/><circle cx="25" cy="10" r=".9" fill="#fff"/><circle cx="22" cy="16" r=".9" fill="#fff"/><path d="M0,0 L15,10 M15,0 L0,10" stroke="#fff" stroke-width="2"/><path d="M7.5,0 V10 M0,5 H15" stroke="#fff" stroke-width="3"/><path d="M7.5,0 V10 M0,5 H15" stroke="#c8102e" stroke-width="1.6"/>';
    case 'switzerland': case 'swiss': return '<rect width="30" height="20" fill="#da291c"/><path d="M13.4,4 h3.2 v4.4 h4.4 v3.2 h-4.4 v4.4 h-3.2 v-4.4 h-4.4 v-3.2 h4.4z" fill="#fff"/>';
    case 'white': return '<rect width="30" height="20" fill="#fff"/>';
    default: return `<rect width="30" height="20" fill="${esc(name || '#888')}"/>`;
  }
}
function flagSVG(name, x, y, w, h, extra = '') {
  return `<svg x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" viewBox="0 0 30 20" preserveAspectRatio="none" ${extra}>${flagInner(name)}</svg>`;
}

// ---------- map drawing ----------
function makeNoise() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); const r = rng(7);
  for (let i = 0; i < 3200; i++) {
    const x = r() * 512, y = r() * 512, rad = 1.5 + Math.pow(r(), 3) * 26;
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.015 + r() * 0.035})` : `rgba(255,255,255,${0.015 + r() * 0.035})`;
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) { g.beginPath(); g.arc(x + dx, y + dy, rad, 0, 7); g.fill(); }
  }
  return c;
}

function viewAt(view, lt) {
  return keyframes(view || { lon: 0, lat: 20, span: 360 }, lt, ['lon', 'lat', 'span'], { at: 0, span: 40 });
}

function drawMap(sc, lt) {
  const bg = sc.bg, cv = document.getElementById('map'), ctx = cv.getContext('2d');
  const v = viewAt(bg.view, lt);
  const k = W / (v.span * Math.PI / 180);
  const proj = d3.geoMercator().center([v.lon, v.lat]).scale(k).translate([W / 2, H / 2]).clipExtent([[-40, -40], [W + 40, H + 40]]);
  S.proj = proj;
  const path = d3.geoPath(proj, ctx);
  const paper = bg.style === 'paper';
  const ocean = bg.ocean || (paper ? '#cbbf9f' : '#1f5a6e');
  const grd = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H / 2, H * 0.75);
  grd.addColorStop(0, shade(ocean, paper ? 0.1 : 0.18)); grd.addColorStop(1, shade(ocean, paper ? -0.15 : -0.35));
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  // ocean texture
  const pat = ctx.createPattern(S.noise, 'repeat');
  const o = proj([0, 0]); const ts = clamp(k / (W / (60 * Math.PI / 180)), 0.6, 3);
  pat.setTransform(new DOMMatrix().translate(o[0] % 1024, o[1] % 1024).scale(ts));
  ctx.globalAlpha = paper ? 0.25 : 0.6; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  // land
  ctx.beginPath(); path(S.land);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.fillStyle = bg.land || (paper ? '#efe5c8' : '#a9b487'); ctx.fill(); ctx.restore();
  ctx.save(); ctx.clip(); ctx.fillStyle = pat; ctx.globalAlpha = paper ? 0.35 : 1; ctx.fillRect(0, 0, W, H); ctx.restore();
  // country fills
  for (const f of bg.fills || []) {
    const a = appear(f, lt, f.fade == null ? 0.4 : f.fade) * (1 - exitP(f, lt, 0.4));
    if (a <= 0) continue;
    const feats = f._feats || (f._feats = featuresFor(f.countries || f.region || f.coords && [{ coords: f.coords }] || []));
    ctx.beginPath(); for (const ft of feats) path(ft);
    ctx.globalAlpha = a * (f.opacity == null ? 1 : f.opacity);
    ctx.fillStyle = f.color || '#f4e409'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = shade(f.color || '#f4e409', -0.45); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // borders + coast
  ctx.beginPath(); path(S.borders); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.stroke();
  ctx.beginPath(); path(S.land); ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(10,25,30,.55)'; ctx.stroke();
}

function shade(hex, amt) {
  let h = String(hex).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16); if (isNaN(n)) return hex;
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

// ---------- backgrounds ----------
function bgSVG(sc, lt) {
  const bg = sc.bg || {};
  const wrap = s => `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  switch (bg.type) {
    case 'plain': return wrap(`<rect width="${W}" height="${H}" fill="${bg.color || '#fbfaf7'}"/>`);
    case 'room': return wrap(roomSVG(bg));
    case 'field': return wrap(fieldSVG(bg));
    case 'city': return wrap(citySVG(bg));
    case 'sky': return wrap(skySVG(bg, lt));
    case 'sea': return wrap(seaSVG(bg, lt));
    case 'image': {
      const src = S.data.assets[bg.src];
      const kb = bg.kenburns || [1, 1.08];
      const z = lerp(kb[0], kb[1], clamp(lt / Math.max(sc.dur, 0.1)));
      const gray = bg.grayscale ? 'filter:grayscale(1) contrast(1.1);' : '';
      return src ? `<div style="width:${W}px;height:${H}px;overflow:hidden;background:#111"><img src="${src}" style="width:100%;height:100%;object-fit:cover;transform:scale(${z});${gray}"/></div>`
        : wrap(`<rect width="${W}" height="${H}" fill="#333"/><text x="540" y="960" fill="#fff" font-size="40" text-anchor="middle">missing image ${esc(bg.src)}</text>`);
    }
    default: return BGX_get(bg.type) ? wrap(BGX_get(bg.type)(bg, lt, sc)) : '';
  }
}
const BGX_get = t => (window.BGX || {})[t];
const animatedBg = bg => bg && (bg.type === 'sky' || bg.type === 'sea' || bg.type === 'image');

function roomSVG(bg) {
  const wall = bg.wall || '#efe4cc', floor = bg.floor || '#8a5a3b', fy = (bg.horizon || 0.62) * H;
  let s = `<rect width="${W}" height="${fy}" fill="${wall}"/>`;
  s += `<rect y="0" width="${W}" height="36" fill="${shade(wall, -0.12)}"/><rect y="36" width="${W}" height="10" fill="${shade(wall, 0.3)}"/>`;
  for (let x = 40; x < W; x += 260) s += `<rect x="${x}" y="110" width="200" height="${fy - 330}" rx="6" fill="none" stroke="${shade(wall, -0.1)}" stroke-width="5"/>`;
  s += `<rect x="0" y="${fy - 170}" width="${W}" height="150" fill="${shade(wall, -0.05)}"/><rect x="0" y="${fy - 30}" width="${W}" height="30" fill="${shade(floor, -0.3)}"/>`;
  s += `<rect y="${fy}" width="${W}" height="${H - fy}" fill="${floor}"/>`;
  for (let i = 1; i < 9; i++) { const y = fy + Math.pow(i / 9, 1.6) * (H - fy); s += `<line x1="0" x2="${W}" y1="${f1(y)}" y2="${f1(y)}" stroke="${shade(floor, -0.15)}" stroke-width="3"/>`; }
  for (const p of bg.props || []) s += propSVG(typeof p === 'string' ? { type: p } : p, fy);
  return s;
}
function propSVG(p, fy) {
  switch (p.type) {
    case 'window': {
      const x = (p.x == null ? 0.12 : p.x) * W - 110, y = 180, w = 220, h = fy - 520;
      return `<rect x="${x - 14}" y="${y - 14}" width="${w + 28}" height="${h + 28}" fill="#f4efe4" stroke="#b9ad93" stroke-width="4"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#bfe0f2"/><path d="M${x + w / 2},${y} V${y + h} M${x},${y + h / 2} H${x + w}" stroke="#f4efe4" stroke-width="12"/>
        <path d="M${x - 50},${y - 40} Q${x + 10},${y + h / 2} ${x - 30},${y + h + 60} L${x - 80},${y + h + 60} L${x - 80},${y - 40}Z" fill="${p.curtain || '#1f3a68'}"/><path d="M${x + w + 50},${y - 40} Q${x + w - 10},${y + h / 2} ${x + w + 30},${y + h + 60} L${x + w + 80},${y + h + 60} L${x + w + 80},${y - 40}Z" fill="${p.curtain || '#1f3a68'}"/><rect x="${x - 90}" y="${y - 52}" width="${w + 180}" height="16" rx="8" fill="#b8902f"/>`;
    }
    case 'flag': {
      const x = (p.x == null ? 0.12 : p.x) * W, top = fy - 900;
      // flag hangs draped from the pole: rotate the flag 90° so stripes run vertically
      const fw = 170, fh = 380;
      return `<line x1="${x}" y1="${top}" x2="${x}" y2="${fy + 20}" stroke="#6b4b2a" stroke-width="12"/><circle cx="${x}" cy="${top - 10}" r="16" fill="#d4a93a"/>
        <g transform="translate(${x + 6 + fw},${top + 10}) rotate(90)">${flagSVG(p.flag || 'usa', 0, 0, fh, fw)}</g>
        <path d="M${x + 6},${top + 10} h${fw} v${fh} h-${fw}z M${x + 50},${top + 10} v${fh} M${x + 110},${top + 10} v${fh}" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="14"/>`;
    }
    case 'wallmap': case 'easelmap': {
      const w = (p.w || 0.62) * W, h = (p.h || 0.36) * H, x = (p.x == null ? 0.5 : p.x) * W - w / 2, y = (p.y == null ? 0.17 : p.y) * H;
      let s = '';
      if (p.type === 'easelmap') s += `<path d="M${x + w * 0.25},${y + h} L${x + w * 0.15},${fy + 60} M${x + w * 0.75},${y + h} L${x + w * 0.85},${fy + 60}" stroke="#5c3b22" stroke-width="16"/>`;
      s += `<rect x="${x - 16}" y="${y - 16}" width="${w + 32}" height="${h + 32}" fill="#5c3b22"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${p.sea || '#a9d3ea'}"/>`;
      s += miniMapSVG(p, x, y, w, h);
      return s;
    }
    case 'desk': {
      const x = (p.x == null ? 0.5 : p.x) * W, w = p.w || 520, y = fy - 40;
      return `<rect x="${x - w / 2}" y="${y - 150}" width="${w}" height="190" fill="#6d4426"/><rect x="${x - w / 2 - 15}" y="${y - 170}" width="${w + 30}" height="26" fill="#83542f"/><rect x="${x - w / 2 + 20}" y="${y - 120}" width="${w / 2 - 40}" height="60" fill="#5d391f"/><rect x="${x + 20}" y="${y - 120}" width="${w / 2 - 40}" height="60" fill="#5d391f"/>`;
    }
    case 'lamp': {
      const x = (p.x == null ? 0.5 : p.x) * W;
      return `<line x1="${x}" y1="0" x2="${x}" y2="190" stroke="#222" stroke-width="5"/><path d="M${x - 70},250 L${x - 30},185 L${x + 30},185 L${x + 70},250Z" fill="#2f4a3a"/><ellipse cx="${x}" cy="252" rx="28" ry="10" fill="#fff3b0"/>`;
    }
    case 'frame': {
      const x = (p.x == null ? 0.5 : p.x) * W, y = (p.y || 0.12) * H;
      return `<rect x="${x - 110}" y="${y}" width="220" height="270" fill="#b58a3a"/><rect x="${x - 92}" y="${y + 18}" width="184" height="234" fill="${p.color || '#4a3b2f'}"/>`;
    }
    case 'globe': {
      const x = (p.x == null ? 0.85 : p.x) * W, y = fy - 210;
      return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 190}" stroke="#5c3b22" stroke-width="10"/><circle cx="${x}" cy="${y}" r="60" fill="#d7b46a" stroke="#6b4b2a" stroke-width="6"/><path d="M${x - 30},${y - 30} q20,10 10,30 q-15,10 5,30 M${x + 20},${y - 40} q15,20 -5,40" stroke="#8a6a3a" stroke-width="6" fill="none"/>`;
    }
    case 'tv': {
      const x = (p.x == null ? 0.3 : p.x) * W, y = (p.y || 0.18) * H;
      return `<rect x="${x - 190}" y="${y}" width="380" height="290" fill="#3b3b3b" rx="10"/><rect x="${x - 170}" y="${y + 18}" width="340" height="250" fill="${p.screen || '#e98a3c'}"/><circle cx="${x - 140}" cy="${y + 45}" r="8" fill="#e33"/><text x="${x - 124}" y="${y + 53}" font-size="24" fill="#fff" font-weight="700">Live</text>`;
    }
    default: return '';
  }
}
const _miniCache = new Map();
function miniMapSVG(p, x, y, w, h) {
  const key = JSON.stringify([p.focus, p.highlight, p.cities, x, y, w, h, p.land, p.color]);
  if (_miniCache.has(key)) return _miniCache.get(key);
  const focus = featuresFor(p.focus || p.highlight || ['Japan']);
  const proj = d3.geoMercator().fitExtent([[x + w * 0.08, y + h * 0.08], [x + w * 0.92, y + h * 0.92]], { type: 'FeatureCollection', features: focus });
  const path = d3.geoPath(proj);
  const clip = 'mm' + (hashStr(key) % 1e6);
  let s = `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#${clip})">`;
  s += `<path d="${path(S.land)}" fill="${p.land || '#e8e2cf'}" stroke="#6b6b6b" stroke-width="1.5"/>`;
  for (const f of featuresFor(p.highlight || p.focus || [])) s += `<path d="${path(f)}" fill="${p.color || '#f2c24c'}" stroke="#9a7a2a" stroke-width="2"/>`;
  for (const c of p.cities || []) {
    const q = proj([c.lon, c.lat]);
    s += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="7" fill="#d62828"/><text x="${f1(q[0] + 10)}" y="${f1(q[1] - 8)}" font-size="20" font-weight="700" fill="#333">${esc(c.name)}</text>`;
  }
  s += '</g>';
  _miniCache.set(key, s);
  return s;
}
function fieldSVG(bg) {
  const pal = { grass: ['#b9d6e8', '#8fb36b', '#7a9a55', '#9c8a5a'], desert: ['#f2d7a6', '#d9b77a', '#c9a265', '#b48e55'], snow: ['#c9d6e2', '#e8eef3', '#dfe6ec', '#b9c4cc'], mud: ['#b8b8a8', '#7d7358', '#6b6148', '#5a503a'] }[bg.palette || 'grass'];
  const r = rng(hashStr(bg.seed || 'field'));
  let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(pal[0], -0.15)}"/><stop offset="1" stop-color="${shade(pal[0], 0.35)}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  s += `<path d="M0,760 Q200,640 420,720 T860,690 T${W},700 V${H} H0Z" fill="${pal[1]}"/>`;
  s += `<path d="M0,860 Q300,800 600,850 T${W},830 V${H} H0Z" fill="${pal[2]}"/>`;
  for (let i = 0; i < 40; i++) { const x = r() * W, y = 900 + r() * 1000, rad = 10 + r() * 30; s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rad * 1.6)}" ry="${f1(rad * 0.5)}" fill="${shade(pal[2], -0.12)}" opacity=".7"/>`; }
  if (bg.craters) for (let i = 0; i < bg.craters; i++) { const x = 100 + r() * 880, y = 1100 + r() * 700; s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="110" ry="34" fill="${pal[3]}"/><ellipse cx="${f1(x)}" cy="${f1(y + 6)}" rx="80" ry="22" fill="${shade(pal[3], -0.3)}"/>`; }
  return s;
}
function citySVG(bg) {
  const r = rng(hashStr(bg.seed || 'city'));
  const sky = bg.sky || '#c9dbe6';
  let s = `<rect width="${W}" height="${H}" fill="${sky}"/>`;
  for (let layer = 0; layer < 2; layer++) {
    let x = -20;
    while (x < W) {
      const w = 90 + r() * 150, h = (layer ? 380 : 520) + r() * 420, base = layer ? 1250 : 1150;
      const col = layer ? (bg.near || '#b9a88e') : (bg.far || '#9fa9b3');
      s += `<rect x="${f1(x)}" y="${f1(base - h)}" width="${f1(w)}" height="${f1(h)}" fill="${col}" stroke="${shade(col, -0.25)}" stroke-width="3"/>`;
      for (let wy = base - h + 30; wy < base - 40; wy += 60) for (let wx = x + 18; wx < x + w - 30; wx += 40) s += `<rect x="${f1(wx)}" y="${f1(wy)}" width="18" height="28" fill="${shade(col, -0.3)}"/>`;
      x += w + (layer ? 10 : 30);
    }
  }
  s += `<rect y="1250" width="${W}" height="${H - 1250}" fill="${bg.ground || '#c8bba0'}"/><rect y="1250" width="${W}" height="14" fill="${shade(bg.ground || '#c8bba0', -0.25)}"/>`;
  if (bg.ruins) { s = s.replace(/fill="(#b9a88e|#9fa9b3)"/g, 'fill="#7c7268"'); s += `<rect width="${W}" height="${H}" fill="rgba(60,50,40,.25)"/>`; }
  return s;
}
function cloud(x, y, sc, op = 0.95) {
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})" opacity="${op}"><ellipse cx="0" cy="0" rx="120" ry="55" fill="#fff"/><ellipse cx="-80" cy="15" rx="80" ry="45" fill="#fff"/><ellipse cx="85" cy="12" rx="90" ry="48" fill="#fff"/><ellipse cx="10" cy="-40" rx="80" ry="55" fill="#fff"/></g>`;
}
function skySVG(bg, lt) {
  const r = rng(hashStr(bg.seed || 'sky'));
  let s = `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.top || '#5f9fd6'}"/><stop offset="1" stop-color="${bg.bottom || '#cfe6f5'}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sk)"/>`;
  for (let i = 0; i < (bg.clouds == null ? 9 : bg.clouds); i++) {
    const sp = 20 + r() * 50, x = ((r() * (W + 600) + lt * sp) % (W + 600)) - 300;
    s += cloud(x, r() * H, 0.6 + r() * 1.2, 0.7 + r() * 0.3);
  }
  return s;
}
function seaSVG(bg, lt) {
  const hz = (bg.horizon || 0.4) * H;
  let s = `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb2d9"/><stop offset="1" stop-color="#d9ebf5"/></linearGradient><linearGradient id="se" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.sea || '#2b6f99'}"/><stop offset="1" stop-color="${shade(bg.sea || '#2b6f99', -0.4)}"/></linearGradient></defs>`;
  s += `<rect width="${W}" height="${hz}" fill="url(#sk)"/><rect y="${hz}" width="${W}" height="${H - hz}" fill="url(#se)"/>`;
  for (let i = 0; i < 24; i++) { const y = hz + 20 + Math.pow(i / 24, 1.5) * (H - hz); const off = (lt * 30 * (1 + i / 10) + i * 97) % 200; s += `<path d="M${-200 + off},${f1(y)} q50,-12 100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0" stroke="rgba(255,255,255,${0.12 + i / 120})" stroke-width="${2 + i / 6}" fill="none"/>`; }
  return s;
}

// ---------- items ----------
function popT(it, lt, d = 0.32) { const p = appear(it, lt, d); return p >= 1 ? 1 : backOut(p); }
function outlineText(x, y, text, o = {}) {
  const size = o.size || 48, fill = o.color || '#fff', sw = o.stroke == null ? size * 0.2 : o.stroke;
  const anchor = o.anchor || 'middle', weight = o.font ? (o.weight || 400) : (o.weight || 900), style = o.italic ? 'italic' : 'normal';
  const lines = String(text).split('\n'); const fam = o.font ? ` font-family="${o.font}"` : '';
  return lines.map((ln, i) => `<text x="${f1(x)}" y="${f1(y + i * size * 1.08)}"${fam} font-size="${size}" font-weight="${weight}" font-style="${style}" text-anchor="${anchor}" fill="${fill}" stroke="${o.strokeColor || '#111'}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke" letter-spacing="${o.spacing || 0}">${esc(ln)}</text>`).join('');
}
function wrapText(text, max) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur); return lines.join('\n');
}

const ITEM = {
  marker(it, lt) {
    const [x, y] = posOf(it); const s = popT(it, lt);
    const c = it.color || '#e0262b';
    let out = `<g transform="translate(${f1(x)},${f1(y)}) scale(${f1(s * 100) / 100})"><circle r="${it.r || 14}" fill="${c}" stroke="#fff" stroke-width="5"/>`;
    if (it.label) out += outlineText(it.dx || 0, it.dy == null ? -30 : it.dy, it.label, { size: it.size || 40, color: it.labelColor || '#fff' });
    return out + '</g>';
  },
  label(it, lt) {
    const [x, y] = posOf(it); const s = popT(it, lt);
    return `<g transform="translate(${f1(x)},${f1(y)}) scale(${f1(s * 100) / 100})">${outlineText(0, 0, it.text, { size: it.size || 48, color: it.color || '#fff', italic: it.italic })}</g>`;
  },
  arrow(it, lt) {
    const a = pt(it.from), b = pt(it.to);
    const p = easeIO(clamp((lt - (it.at || 0)) / (it.dur || 0.9)));
    if (p <= 0) return '';
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const bend = it.bend == null ? 0.18 : it.bend;
    const cx = (a[0] + b[0]) / 2 - dy / len * len * bend, cy = (a[1] + b[1]) / 2 + dx / len * len * bend;
    const q = t => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1]];
    const wdt = it.width || 24, head = wdt * 1.9;
    const pts = []; const N = 40;
    for (let i = 0; i <= N; i++) pts.push(q(i / N * p));
    const tip = pts[pts.length - 1], prev = q(Math.max(0, p - 0.02));
    const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    // shorten shaft so it ends under the head
    const shaft = pts.slice(); const back = [tip[0] - Math.cos(ang) * head * 0.6, tip[1] - Math.sin(ang) * head * 0.6]; shaft[shaft.length - 1] = back;
    const d = 'M' + shaft.map(v => f1(v[0]) + ',' + f1(v[1])).join(' L');
    const c = it.color || '#e8433b';
    const hp = [[tip[0] + Math.cos(ang) * head * 0.4, tip[1] + Math.sin(ang) * head * 0.4], [tip[0] + Math.cos(ang + 2.5) * head, tip[1] + Math.sin(ang + 2.5) * head], [tip[0] + Math.cos(ang - 2.5) * head, tip[1] + Math.sin(ang - 2.5) * head]];
    const hd = 'M' + hp.map(v => f1(v[0]) + ',' + f1(v[1])).join(' L') + 'Z';
    const op = 1 - exitP(it, lt);
    return `<g opacity="${op}"><path d="${d}" stroke="rgba(0,0,0,.35)" stroke-width="${wdt + 8}" fill="none" stroke-linecap="round"/><path d="${hd}" fill="rgba(0,0,0,.35)" stroke="rgba(0,0,0,.35)" stroke-width="8" stroke-linejoin="round"/><path d="${d}" stroke="${c}" stroke-width="${wdt}" fill="none" stroke-linecap="round"/><path d="${hd}" fill="${c}"/></g>`;
  },
  pulse(it, lt) {
    const [x, y] = posOf(it); const r = it.r || 170, c = it.color || '#7ef0ff';
    const a = appear(it, lt, 0.4) * (1 - exitP(it, lt));
    let s = `<g opacity="${f1(a * 100) / 100}"><circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${c}" fill-opacity=".18" stroke="${c}" stroke-width="4" stroke-opacity=".7"/>`;
    for (let i = 0; i < 2; i++) { const f = ((lt - (it.at || 0)) * 0.7 + i / 2) % 1; s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * f)}" fill="none" stroke="${c}" stroke-width="6" opacity="${f1((1 - f) * 100) / 100}"/>`; }
    return s + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r * 0.18}" fill="#fff8b0" opacity=".9"/></g>`;
  },
  token(it, lt) {
    let [x, y] = posOf(it);
    if (it.to) { const b = pt(it.to); const p = easeIO(clamp((lt - (it.moveAt == null ? (it.at || 0) + 0.5 : it.moveAt)) / (it.moveDur || 1))); x = lerp(x, b[0], p); y = lerp(y, b[1], p); }
    const s = popT(it, lt) * (1 - exitP(it, lt)), r = it.r || 38;
    const id = 'tk' + (hashStr(JSON.stringify(it)) % 1e7);
    return `<g transform="translate(${f1(x)},${f1(y)}) scale(${f1(s * 100) / 100})" filter="url(#ds)"><clipPath id="${id}"><circle r="${r}"/></clipPath><g clip-path="url(#${id})">${flagSVG(it.flag, -r * 1.5, -r, r * 3, r * 2)}</g><circle r="${r}" fill="none" stroke="#fff" stroke-width="6"/></g>`;
  },
  plane(it, lt) {
    const a = pt(it.from), b = pt(it.to);
    const p = clamp((lt - (it.at || 0)) / (it.dur || 2));
    if (lt < (it.at || 0)) return '';
    const x = lerp(a[0], b[0], p), y = lerp(a[1], b[1], p);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, sc = it.scale || 1;
    const c = it.color || '#4b5157';
    return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f1(ang)}) scale(${sc})"><g transform="translate(14,22)" opacity=".25"><ellipse rx="70" ry="11" fill="#000"/><path d="M-12,-80 L10,-80 L26,0 L10,80 L-12,80 L-2,0Z" fill="#000"/></g>
      <path d="M-12,-80 L10,-80 L26,0 L10,80 L-12,80 L-2,0Z" fill="${shade(c, 0.12)}" stroke="#222" stroke-width="3"/><ellipse rx="72" ry="12" fill="${c}" stroke="#222" stroke-width="3"/><path d="M-66,-26 L-54,-26 L-46,0 L-54,26 L-66,26 L-60,0Z" fill="${shade(c, 0.12)}" stroke="#222" stroke-width="3"/>
      ${[-48, -22, 22, 48].map(o => `<ellipse cx="14" cy="${o}" rx="12" ry="6" fill="#333"/>`).join('')}<circle cx="64" cy="0" r="7" fill="#9fd3ff" stroke="#222" stroke-width="2"/></g>`;
  },
  boom(it, lt) {
    const t = lt - (it.at || 0); if (t < 0 || t > (it.dur || 1.6)) return '';
    const [x, y] = posOf(it); const sz = it.size || 1; const r = rng(hashStr(JSON.stringify(it)));
    const p = t / (it.dur || 1.6);
    let s = `<g transform="translate(${f1(x)},${f1(y)}) scale(${sz})">`;
    s += `<circle r="${f1(60 + 420 * easeOut(clamp(t / 0.5)))}" fill="none" stroke="#fff" stroke-width="${f1(30 * (1 - clamp(t / 0.5)))}" opacity="${f1(1 - clamp(t / 0.5))}"/>`;
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, d = r() * 90 * easeOut(clamp(t / 0.6)), rad = (50 + r() * 70) * backOut(clamp(t / 0.35)) * (1 - p * 0.3);
      const smoke = i > 7; const yy = Math.sin(a) * d - (smoke ? t * 120 : 0);
      s += `<circle cx="${f1(Math.cos(a) * d)}" cy="${f1(yy)}" r="${f1(rad)}" fill="${smoke ? '#4d4a48' : (i % 3 ? '#ff8a1e' : '#ffd23f')}" opacity="${f1(smoke ? (0.85 - p * 0.8) : clamp(1.2 - p * 1.4))}"/>`;
    }
    return s + `<circle r="${f1(70 * (1 - clamp(t / 0.4)))}" fill="#fffbe0"/></g>`;
  },
  check(it, lt) {
    const [x, y] = posOf(it); const p = easeOut(appear(it, lt, 0.35)); const s = it.scale || 1;
    return `<g transform="translate(${f1(x)},${f1(y)}) scale(${s})"><path d="M-45,0 L-12,34 L50,-40" pathLength="1" stroke-dasharray="${f1(p * 100) / 100} 1" stroke="#111" stroke-width="34" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M-45,0 L-12,34 L50,-40" pathLength="1" stroke-dasharray="${f1(p * 100) / 100} 1" stroke="${it.color || '#3ccf4e'}" stroke-width="22" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  },
  cross(it, lt) {
    const [x, y] = posOf(it); const p1 = easeOut(clamp((lt - (it.at || 0)) / 0.2)), p2 = easeOut(clamp((lt - (it.at || 0) - 0.15) / 0.2)); const s = it.scale || 1;
    const ln = (d, p) => `<path d="${d}" pathLength="1" stroke-dasharray="${f1(p * 100) / 100} 1" stroke="#111" stroke-width="32" stroke-linecap="round"/><path d="${d}" pathLength="1" stroke-dasharray="${f1(p * 100) / 100} 1" stroke="${it.color || '#e53935'}" stroke-width="20" stroke-linecap="round"/>`;
    return `<g transform="translate(${f1(x)},${f1(y)}) scale(${s})">${ln('M-42,-42 L42,42', p1)}${ln('M42,-42 L-42,42', p2)}</g>`;
  },
  text(it, lt) {
    const style = it.style || 'big';
    const s = popT(it, lt) * (1 - exitP(it, lt));
    if (style === 'date') {
      const x = (it.x == null ? 0.95 : it.x) * W, y = (it.y == null ? 0.07 : it.y) * H;
      return `<g opacity="${f1(appear(it, lt) * 100) / 100}">${outlineText(x, y, it.text, { size: it.size || 58, anchor: 'end', weight: 800, color: it.color || '#fff', stroke: 10, strokeColor: 'rgba(0,0,0,.6)' })}</g>`;
    }
    if (style === 'stamp') {
      const x = (it.x == null ? 0.5 : it.x) * W, y = (it.y == null ? 0.4 : it.y) * H; const c = it.color || '#d62828';
      const sc = 1 + (1 - easeOut(appear(it, lt, 0.25))) * 1.5;
      return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${it.rotate == null ? -12 : it.rotate}) scale(${f1(sc * 100) / 100})" opacity="${f1(appear(it, lt, 0.15) * 100) / 100}"><rect x="-300" y="-80" width="600" height="140" fill="none" stroke="${c}" stroke-width="14" rx="12"/><text y="20" font-size="${it.size || 92}" font-weight="900" fill="${c}" text-anchor="middle" letter-spacing="6">${esc(it.text)}</text></g>`;
    }
    if (style === 'title') {
      const y = (it.y == null ? 0.12 : it.y) * H;
      return `<g transform="translate(${W / 2},${f1(y)}) scale(${f1(s * 100) / 100})"><rect x="-470" y="-80" width="940" height="${80 + 90 * (String(it.text).split('\n').length)}" rx="24" fill="${it.bg || 'rgba(0,0,0,.72)'}"/>${outlineText(0, 20, it.text, { size: it.size || 72, color: it.color || '#fff', stroke: 0 })}</g>`;
    }
    const x = (it.x == null ? 0.5 : it.x) * W, y = (it.y == null ? 0.42 : it.y) * H;
    return `<g transform="translate(${f1(x)},${f1(y)}) scale(${f1(s * 100) / 100})">${outlineText(0, 0, it.text, { size: it.size || 150, color: it.color || '#fff', italic: it.italic, stroke: (it.size || 150) * 0.16 })}</g>`;
  },
  image(it, lt) {
    const src = S.data.assets[it.src]; if (!src) return '';
    const [x, y] = posOf(it); const w = (it.w || 0.7) * W, h = it.h ? it.h * H : w * (it.aspect || 0.75);
    const s = popT(it, lt) * (1 - exitP(it, lt)); const border = it.border == null ? 14 : it.border;
    const gray = it.grayscale ? ' filter="url(#gray)"' : '';
    return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${it.rotate || 0}) scale(${f1(s * 100) / 100})" filter="url(#ds)">${border ? `<rect x="${-w / 2 - border}" y="${-h / 2 - border}" width="${w + border * 2}" height="${h + border * 2}" fill="#fff"/>` : ''}<image href="${src}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${gray}/></g>`;
  },
  flagpole(it, lt) {
    const [x, y] = posOf(it); const s = popT(it, lt) * (it.scale || 1);
    const wave = Math.sin(lt * 6) * 4;
    return `<g transform="translate(${f1(x)},${f1(y)}) scale(${f1(s * 100) / 100})"><line x1="0" y1="0" x2="0" y2="-170" stroke="#222" stroke-width="7"/><g transform="skewY(${f1(wave)})">${flagSVG(it.flag || 'white', 2, -168, 105, 70)}</g></g>`;
  },
  char(it, lt) { return drawChar(it, lt); },
};

// ---------- characters ----------
const POSES = {
  down: [10, 10], point: [96, 12], up: [158, 12], cheer: [150, 150], surrender: [165, 165],
  shrug: [62, 62], hips: [34, 34], wave: [140, 12], hold: [62, 10], fist: [120, 14], think: [-150, 10], facepalm: [-165, 10],
};
const BEND = { shrug: 0.5, hips: -0.9, think: 0.4, facepalm: 0.4 };
function poseAt(it, lt) {
  const list = Array.isArray(it.poses) ? it.poses : [{ at: 0, pose: it.pose || 'down' }];
  let prev = POSES[list[0].pose] || POSES.down, prevName = list[0].pose, cur = prev, curName = prevName, p = 1;
  for (let i = 1; i < list.length; i++) {
    if (lt < list[i].at) break;
    prev = cur; prevName = curName; cur = POSES[list[i].pose] || POSES.down; curName = list[i].pose;
    p = easeOut(clamp((lt - list[i].at) / 0.22));
  }
  return { front: lerp(prev[0], cur[0], p), back: lerp(prev[1], cur[1], p), name: curName, bend: lerp(BEND[prevName] || 0.15, BEND[curName] || 0.15, p) };
}
function moodAt(it, lt) {
  if (!Array.isArray(it.moods)) return it.mood || 'neutral';
  let m = it.moods[0].mood; for (const k of it.moods) if (lt >= k.at) m = k.mood; return m;
}
function talkingAt(it, lt) {
  if (it.talk) for (const w of [].concat(it.talk)) if (lt >= w.at && lt < w.until) return true;
  for (const s of it.say || []) { const end = s.at + Math.min(0.25 + String(s.text).length * 0.055, (s.until || 1e9) - s.at); if (lt >= s.at && lt < end) return true; }
  return false;
}
const SKIN = { light: '#f6dcc4', fair: '#fbe7d3', tan: '#e7b98c', brown: '#b9794c', dark: '#7a4a2a', pale: '#fff1e4' };

function drawChar(it, lt) {
  const f = it.face === 'left' || it.face === -1 ? -1 : 1;
  const sc = (it.scale || 1) * 1.75;
  let [x, y] = posOf(it);
  if (it.moves) for (const m of it.moves) {
    if (lt < m.at) break;
    const q = easeIO(clamp((lt - m.at) / (m.dur || 0.8))); const tgt = pt(m.to || { x: m.x, y: m.y });
    x = lerp(x, tgt[0], q); y = lerp(y, tgt[1], q);
  }
  // enter / exit
  const at = it.at || 0, enter = it.enter || 'pop', ep = clamp((lt - at) / 0.38), xp = exitP(it, lt, 0.3);
  let s = 1, alpha = 1;
  const slide = (dir, prog) => { if (dir === 'left') x -= (1 - easeOut(prog)) * (x + 300); else if (dir === 'right') x += (1 - easeOut(prog)) * (W - x + 300); else if (dir === 'up') y += (1 - easeOut(prog)) * (H - y + 600); else if (dir === 'drop') y -= (1 - easeOut(prog)) * (y + 600); };
  if (enter === 'pop') s = ep >= 1 ? 1 : backOut(ep); else if (enter === 'fade') alpha = ep; else if (enter !== 'none') slide(enter, ep);
  if (xp > 0) { const ex = it.exit || 'fade'; if (ex === 'pop') s *= 1 - easeIO(xp); else if (ex === 'fade') alpha *= 1 - xp; else slide(ex, 1 - xp); }
  const mood = moodAt(it, lt), talking = talkingAt(it, lt);
  const phase = (hashStr(it.id || it.name || 'c') % 100) / 16;
  y += Math.sin(lt * 2.4 + phase) * 3 + (talking ? -Math.abs(Math.sin(lt * 9)) * 6 : 0);
  for (const j of [].concat(it.jumps || [])) { const q = (lt - j) / 0.42; if (q > 0 && q < 1) y -= Math.sin(q * Math.PI) * 90; }
  let spin = 0;
  if (it.fly && lt >= it.fly.at) {
    const q = clamp((lt - it.fly.at) / (it.fly.dur || 0.9)), tgt = pt(it.fly.to || { x: 1.3, y: -0.2 });
    const sx0 = x, sy0 = y; x = lerp(sx0, tgt[0], q); y = lerp(sy0, tgt[1], q) - Math.sin(q * Math.PI) * (it.fly.arc == null ? 500 : it.fly.arc);
    spin = (it.fly.spin == null ? 540 : it.fly.spin) * q;
  }
  if (mood === 'angry' || mood === 'furious') x += Math.sin(lt * 70) * (mood === 'furious' ? 7 : 3);
  if (mood === 'shocked' && lt - at < 1.5) y -= Math.abs(Math.sin(lt * 18)) * 10 * (1 - clamp((lt - at) / 1.5));

  const skin = SKIN[it.skin] || it.skin || SKIN.light;
  const outfit = it.outfit || 'suit', col = it.color || ({ suit: '#2b2f36', military: '#5d6b3a', navy: '#1c2c4c', civil: '#6b7c8f', robe: '#7a2e2e', soldier: '#6b6b3c' }[outfit] || '#444');
  const hair = it.hairColor || '#2a221c';
  const id = 'c' + (hashStr((it.id || it.name || '') + JSON.stringify(it.pos || [it.x, it.y])) % 1e7);
  const ln = 'stroke="#111" stroke-width="5" stroke-linejoin="round"';
  let g = '';
  // body
  const bw = it.wide ? 70 : 58;
  g += `<rect x="${-bw}" y="-238" width="${bw * 2}" height="238" rx="24" fill="${col}" ${ln}/>`;
  if (outfit === 'suit') g += `<path d="M-28,-236 L0,-170 L28,-236Z" fill="#fff" stroke="#111" stroke-width="3"/><path d="M-6,-226 L6,-226 L9,-150 L0,-136 L-9,-150Z" fill="${it.tie || '#8b1d1d'}"/><path d="M-40,-236 L-6,-160 M40,-236 L6,-160" stroke="${shade(col, -0.35)}" stroke-width="5"/><circle cx="${f * 18}" cy="-110" r="5" fill="#111"/><circle cx="${f * 18}" cy="-75" r="5" fill="#111"/>`;
  if (outfit === 'navy') { for (const yy of [-190, -150, -110, -70]) g += `<circle cx="-20" cy="${yy}" r="6" fill="#e8c34a"/><circle cx="20" cy="${yy}" r="6" fill="#e8c34a"/>`; g += `<path d="M-30,-236 L0,-196 L30,-236" fill="#fff" stroke="#111" stroke-width="3"/>`; }
  if (outfit === 'military' || outfit === 'soldier') { g += `<rect x="${-bw + 3}" y="-92" width="${bw * 2 - 6}" height="18" fill="${shade(col, -0.45)}"/><rect x="-11" y="-94" width="22" height="22" fill="#c9a44a" stroke="#111" stroke-width="2"/><rect x="-44" y="-200" width="32" height="34" rx="3" fill="${shade(col, -0.12)}" stroke="${shade(col, -0.4)}" stroke-width="3"/><rect x="12" y="-200" width="32" height="34" rx="3" fill="${shade(col, -0.12)}" stroke="${shade(col, -0.4)}" stroke-width="3"/><circle cx="0" cy="-150" r="4" fill="#c9a44a"/><circle cx="0" cy="-125" r="4" fill="#c9a44a"/>`; if (outfit === 'military') g += `<rect x="${-bw - 4}" y="-238" width="30" height="12" rx="4" fill="#c9a44a"/><rect x="${bw - 26}" y="-238" width="30" height="12" rx="4" fill="#c9a44a"/>`; }
  if (outfit === 'robe') g += `<path d="M-30,-236 L0,-180 L30,-236" fill="none" stroke="#e8c34a" stroke-width="8"/><rect x="${-bw + 3}" y="-110" width="${bw * 2 - 6}" height="16" fill="#e8c34a"/>`;
  if (outfit === 'civil') g += `<path d="M-26,-236 L0,-205 L26,-236" fill="#fff" stroke="#111" stroke-width="3"/>`;
  if (it.medals) g += `<rect x="${-f * 46 - 14}" y="-196" width="30" height="8" fill="#c0392b"/><rect x="${-f * 46 - 14}" y="-186" width="30" height="8" fill="#2d6cdf"/><rect x="${-f * 46 - 14}" y="-176" width="30" height="8" fill="#e8c34a"/>`;
  if (it.armband) g += `<rect x="${-f * bw - 6}" y="-170" width="14" height="30" fill="${it.armband}"/>`;
  // arms
  const pose = poseAt(it, lt);
  let front = pose.front, back = pose.back;
  if (pose.name === 'wave') front += Math.sin(lt * 10) * 22;
  if (talking && pose.name === 'down') front += Math.sin(lt * 5) * 10 + 8;
  const L = 118;
  const arm = (side, angDeg, bend) => {
    const a = angDeg * Math.PI / 180, sx = side * (bw - 6), sy = -200;
    const ex = sx + side * Math.sin(a) * L, ey = sy + Math.cos(a) * L;
    const mx = (sx + ex) / 2 + side * Math.cos(a) * L * bend * 0.5, my = (sy + ey) / 2 - Math.sin(a) * L * bend * 0.5;
    return { d: `M${f1(sx)},${sy} Q${f1(mx)},${f1(my)} ${f1(ex)},${f1(ey)}`, ex, ey };
  };
  const A1 = arm(f, front, pose.bend), A2 = arm(-f, back, pose.bend);
  g += `<path d="${A2.d}" stroke="#111" stroke-width="8" fill="none" stroke-linecap="round"/><path d="${A1.d}" stroke="#111" stroke-width="8" fill="none" stroke-linecap="round"/>`;
  const held = holdAt(it, lt);
  if (held) g += holdSVG(held, A1.ex, A1.ey, f);
  // head
  const hy = -304, hr = 68;
  g += `<clipPath id="${id}h"><circle cx="0" cy="${hy}" r="${hr}"/></clipPath>`;
  if (it.faceImage && S.data.assets[it.faceImage]) {
    const fs = (it.faceSize || 1) * hr * 2.3;
    g += `<image href="${S.data.assets[it.faceImage]}" x="${-fs / 2}" y="${hy - fs * 0.56}" width="${fs}" height="${fs}" preserveAspectRatio="xMidYMid meet"/>`;
  } else {
    if (it.hair === 'white' || it.hair === 'sides') g += `<ellipse cx="-64" cy="${hy + 2}" rx="16" ry="30" fill="${it.hair === 'white' ? '#f2f2f2' : hair}" stroke="#111" stroke-width="3"/><ellipse cx="64" cy="${hy + 2}" rx="16" ry="30" fill="${it.hair === 'white' ? '#f2f2f2' : hair}" stroke="#111" stroke-width="3"/>`;
    g += `<circle cx="0" cy="${hy}" r="${hr}" fill="${skin}"/>`;
    g += `<g clip-path="url(#${id}h)">`;
    if (it.hair === 'short' || it.hair === 'side' || it.hair === 'slick') g += `<ellipse cx="${-f * 6}" cy="${hy - 66}" rx="86" ry="${it.hair === 'slick' ? 40 : 34}" fill="${hair}"/>`;
    if (it.hair === 'side') g += `<path d="M${-f * 70},${hy - 50} Q${f * 0},${hy - 46} ${f * 40},${hy - 18} Q${-f * 10},${hy - 26} ${-f * 70},${hy - 20}Z" fill="${hair}"/>`;
    if (it.hair === 'white') g += `<ellipse cx="0" cy="${hy - 72}" rx="70" ry="22" fill="#f2f2f2"/>`;
    if (it.hair === 'bald') g += `<ellipse cx="${-f * 20}" cy="${hy - 40}" rx="16" ry="8" fill="#fff" opacity=".35"/>`;
    if (mood === 'angry' || mood === 'furious') g += `<rect x="-80" y="${hy - 80}" width="160" height="160" fill="#e53935" opacity="${mood === 'furious' ? 0.35 : 0.15}"/>`;
    if (mood === 'scared' || mood === 'sick') g += `<rect x="-80" y="${hy - 80}" width="160" height="80" fill="#6a8fd6" opacity=".25"/>`;
    g += `</g><circle cx="0" cy="${hy}" r="${hr}" fill="none" ${ln}/>`;
    // eyes
    const ex = f * 12, ey = hy - 6, blink = ((lt + phase) % 3.7) < 0.12;
    for (const o of [-22, 22]) {
      if (mood === 'dead') g += `<path d="M${ex + o - 9},${ey - 9} l18,18 m0,-18 l-18,18" stroke="#111" stroke-width="4"/>`;
      else if (blink || mood === 'smug') g += `<path d="M${ex + o - 9},${ey} h18" stroke="#111" stroke-width="5" stroke-linecap="round"/>`;
      else if (mood === 'shocked' || mood === 'scared') g += `<circle cx="${ex + o}" cy="${ey}" r="11" fill="#fff" stroke="#111" stroke-width="3"/><circle cx="${ex + o}" cy="${ey}" r="5" fill="#111"/>`;
      else g += `<ellipse cx="${ex + o}" cy="${ey}" rx="7" ry="9" fill="#111"/>`;
    }
    // brows
    const by = ey - 24;
    if (mood === 'angry' || mood === 'furious') g += `<path d="M${ex - 38},${by - 6} L${ex - 10},${by + 6} M${ex + 38},${by - 6} L${ex + 10},${by + 6}" stroke="#111" stroke-width="6" stroke-linecap="round"/>`;
    else if (mood === 'worried' || mood === 'sad' || mood === 'scared') g += `<path d="M${ex - 38},${by + 4} L${ex - 10},${by - 6} M${ex + 38},${by + 4} L${ex + 10},${by - 6}" stroke="#111" stroke-width="5" stroke-linecap="round"/>`;
    else if (mood === 'shocked') g += `<path d="M${ex - 36},${by - 8} Q${ex - 22},${by - 18} ${ex - 8},${by - 8} M${ex + 36},${by - 8} Q${ex + 22},${by - 18} ${ex + 8},${by - 8}" stroke="#111" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    else if (mood === 'smug') g += `<path d="M${ex - 36},${by} L${ex - 10},${by - 4} M${ex + 36},${by - 10} L${ex + 10},${by - 2}" stroke="#111" stroke-width="5" stroke-linecap="round"/>`;
    if (it.glasses) g += `<circle cx="${ex - 22}" cy="${ey}" r="17" fill="rgba(255,255,255,.18)" stroke="#222" stroke-width="3.5"/><circle cx="${ex + 22}" cy="${ey}" r="17" fill="rgba(255,255,255,.18)" stroke="#222" stroke-width="3.5"/><path d="M${ex - 5},${ey - 2} h10" stroke="#222" stroke-width="3.5"/>`;
    // mustache / beard
    const mx = f * 14, my = hy + 22;
    if (it.beard) g += `<path d="M-52,${hy + 20} Q0,${hy + 100} 52,${hy + 20} Q0,${hy + 60} -52,${hy + 20}Z" fill="${it.beardColor || hair}"/>`;
    if (it.mustache === 'toothbrush') g += `<rect x="${mx - 11}" y="${my - 6}" width="22" height="13" rx="2" fill="${hair}"/>`;
    else if (it.mustache === 'walrus') g += `<path d="M${mx - 44},${my + 12} Q${mx - 30},${my - 16} ${mx},${my - 8} Q${mx + 30},${my - 16} ${mx + 44},${my + 12} Q${mx + 20},${my + 2} ${mx},${my + 6} Q${mx - 20},${my + 2} ${mx - 44},${my + 12}Z" fill="${hair}"/>`;
    else if (it.mustache === 'thin') g += `<path d="M${mx - 22},${my + 2} Q${mx},${my - 6} ${mx + 22},${my + 2}" stroke="${hair}" stroke-width="5" fill="none"/>`;
    // mouth
    const mouthY = my + 18;
    if (talking) { const o = 3 + 10 * Math.abs(Math.sin(lt * 15)); g += `<ellipse cx="${mx}" cy="${mouthY}" rx="12" ry="${f1(o)}" fill="#5a1414" stroke="#111" stroke-width="3"/>`; }
    else if (mood === 'happy' || mood === 'smug') g += `<path d="M${mx - 16},${mouthY - 4} Q${mx},${mouthY + 12} ${mx + 16},${mouthY - 4}" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    else if (mood === 'sad' || mood === 'worried' || mood === 'angry' || mood === 'furious') g += `<path d="M${mx - 15},${mouthY + 6} Q${mx},${mouthY - 6} ${mx + 15},${mouthY + 6}" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    else if (mood === 'shocked' || mood === 'scared') g += `<ellipse cx="${mx}" cy="${mouthY + 2}" rx="10" ry="14" fill="#5a1414" stroke="#111" stroke-width="3"/>`;
    if (mood === 'worried' || mood === 'scared') { const sy = hy - 30 + ((lt * 40) % 40); g += `<path d="M${-f * 70},${f1(sy)} q-10,18 0,24 q10,-6 0,-24Z" fill="#7cc8ff" stroke="#2b7bbf" stroke-width="2"/>`; }
    if (mood === 'sad') g += `<path d="M${ex - 26},${ey + 12} q-4,${f1(20 + (lt * 30) % 20)} 0,${f1(26 + (lt * 30) % 20)}" stroke="#7cc8ff" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  }
  g += hatSVG(it, hy, hr, f);
  for (const e of it.emotes || []) {
    const until = e.until == null ? e.at + 1.6 : e.until; if (lt < e.at || lt >= until) continue;
    const q = backOut(clamp((lt - e.at) / 0.2)), ex2 = f * 70, ey2 = hy - hr - 70;
    g += `<g transform="translate(${ex2},${ey2 + Math.sin(lt * 8) * 4}) scale(${f1(q * 100) / 100})">${emoteSVG(e.kind, lt)}</g>`;
  }
  if (it.tag) g += outlineText(0, 52, it.tag, { size: 34, color: '#fff', stroke: 8 });

  let out = `<g opacity="${f1(alpha * 100) / 100}" transform="translate(${f1(x)},${f1(y)}) rotate(${f1(spin)} 0 ${f1(-180 * sc * s)}) scale(${f1(sc * s * 1000) / 1000})">${g}</g>`;
  // props that leave the hand: thrown along an arc, or dropped to the floor
  const handX = x + A1.ex * sc * s, handY = y + A1.ey * sc * s;
  for (const th of it.throws || []) {
    if (lt < th.at) continue;
    const q = clamp((lt - th.at) / (th.dur || 0.7)), tgt = pt(th.to || { x: 0.5, y: 0.5 });
    if (q >= 1 && th.keep !== true) continue;
    const px = lerp(handX, tgt[0], q), py = lerp(handY, tgt[1], q) - Math.sin(q * Math.PI) * (th.arc == null ? 260 : th.arc);
    out += `<g transform="translate(${f1(px - handX)},${f1(py - handY)}) rotate(${f1(q * (th.spin == null ? 540 : th.spin))} ${f1(handX)} ${f1(handY)})"><g transform="translate(${f1(x)},${f1(y)}) scale(${f1(sc * s * 1000) / 1000})">${holdSVG(th.item, A1.ex, A1.ey, f)}</g></g>`;
  }
  for (const d of droppedAt(it, lt)) {
    const q = clamp((lt - d.at) / 0.45), fy = y - 10, py = lerp(handY, fy, q * q);
    out += `<g transform="translate(${f1(handX + f * 40 * q)},${f1(py)}) rotate(${f1(f * 90 * q)}) scale(${f1(sc * s * 100) / 100})"><g transform="translate(${f1(-A1.ex)},${f1(-A1.ey)})">${holdSVG(d.item, A1.ex, A1.ey, f)}</g></g>`;
  }
  // speech text (outside the scaled group so text stays readable)
  for (let i = 0; i < (it.say || []).length; i++) {
    const sy = it.say[i]; const until = sy.until != null ? sy.until : (it.say[i + 1] ? it.say[i + 1].at : sy.at + 1.2 + sy.text.length * 0.06);
    if (lt < sy.at || lt >= until) continue;
    const pp = backOut(clamp((lt - sy.at) / 0.2));
    const headTop = y - (hy + hr) * sc * s * -1;
    const side = sy.side === 'left' ? -1 : sy.side === 'right' ? 1 : f;
    let tx = x + side * (sy.dx == null ? 150 : sy.dx), ty = (y + (hy - hr - 40) * sc) + (sy.dy || 0);
    const txt = wrapText(sy.text, 16); const lines = txt.split('\n').length;
    tx = clamp(tx, 220, W - 220);
    out += `<g transform="translate(${f1(tx)},${f1(ty - (lines - 1) * 44)}) scale(${f1(pp * 100) / 100})">${outlineText(0, 0, txt, { size: sy.size || 54, font: 'Gochi Hand', stroke: 11 })}</g>`;
    out += `<path d="M${f1(x + side * 30 * sc)},${f1(y + (hy - hr + 10) * sc)} l${side * 26},-34" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="${f1(pp)}"/>`;
    void headTop;
  }
  return out;
}
function hatSVG(it, hy, hr, f) {
  const c = it.hatColor || ({ cap: '#5d6b3a', navy: '#1c2c4c', helmet: '#5f6b3c', fedora: '#3a3a3a', ushanka: '#6b5440', kepi: '#3b4d7a', crown: '#e8c34a' }[it.hat]);
  const top = hy - hr;
  switch (it.hat) {
    case 'cap': case 'navy': {
      const crown = it.hat === 'navy' && it.whiteCap ? '#f4f4f4' : c;
      return `<path d="M-78,${top + 6} Q0,${top - 54} 78,${top + 6} L66,${top + 26} L-66,${top + 26}Z" fill="${crown}" stroke="#111" stroke-width="5" stroke-linejoin="round"/><rect x="-68" y="${top + 16}" width="136" height="22" fill="${it.hat === 'navy' ? '#111' : shade(c, -0.35)}" stroke="#111" stroke-width="4"/><path d="M${f * 6},${top + 38} Q${f * 50},${top + 34} ${f * 82},${top + 52} L${f * 6},${top + 46}Z" fill="#111"/><circle cx="${f * 4}" cy="${top + 4}" r="11" fill="#e8c34a" stroke="#111" stroke-width="2"/>`;
    }
    case 'helmet': return `<path d="M-80,${top + 44} Q-78,${top - 34} 0,${top - 36} Q78,${top - 34} 80,${top + 44}Z" fill="${c}" stroke="#111" stroke-width="5"/><path d="M-92,${top + 44} H92" stroke="#111" stroke-width="10" stroke-linecap="round"/>`;
    case 'fedora': return `<ellipse cx="0" cy="${top + 22}" rx="104" ry="18" fill="${c}" stroke="#111" stroke-width="4"/><path d="M-62,${top + 22} L-56,${top - 30} Q0,${top - 46} 56,${top - 30} L62,${top + 22}Z" fill="${c}" stroke="#111" stroke-width="4"/><rect x="-60" y="${top + 2}" width="120" height="14" fill="#111"/>`;
    case 'ushanka': return `<path d="M-78,${top + 30} Q-70,${top - 40} 0,${top - 42} Q70,${top - 40} 78,${top + 30}Z" fill="${c}" stroke="#111" stroke-width="5"/><rect x="-80" y="${top + 12}" width="160" height="30" rx="12" fill="${shade(c, 0.25)}" stroke="#111" stroke-width="4"/>`;
    case 'kepi': return `<path d="M-58,${top + 26} L-50,${top - 34} L50,${top - 34} L58,${top + 26}Z" fill="${c}" stroke="#111" stroke-width="5"/><path d="M${f * 4},${top + 26} L${f * 76},${top + 40} L${f * 4},${top + 40}Z" fill="#111"/>`;
    case 'crown': return `<path d="M-56,${top + 14} L-60,${top - 40} L-30,${top - 14} L0,${top - 50} L30,${top - 14} L60,${top - 40} L56,${top + 14}Z" fill="${c}" stroke="#111" stroke-width="4"/>`;
    default: return '';
  }
}
function holdAt(it, lt) {
  let h = it.hold || null;
  for (const k of it.holds || []) if (lt >= k.at) h = k.item || null;
  for (const th of it.throws || []) if (lt >= th.at && th.item === h) h = null;
  return h;
}
function droppedAt(it, lt) {
  const out = []; let h = it.hold || null;
  for (const k of it.holds || []) { if (lt < k.at) break; if (k.drop && h) out.push({ item: h, at: k.at }); h = k.item || null; }
  return out;
}
function emoteSVG(kind, lt) {
  switch (kind) {
    case '!!': case '!': return outlineText(0, 0, kind, { size: 120, font: 'Bangers', color: '#ff3b2f', stroke: 14 });
    case '?': case '??': return outlineText(0, 0, kind, { size: 120, font: 'Bangers', color: '#fff', stroke: 14 });
    case 'anger': return `<path d="M-30,-10 q14,-4 18,-22 M30,-10 q-14,-4 -18,-22 M-30,10 q14,4 18,22 M30,10 q-14,4 -18,22" stroke="#e53935" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    case 'idea': return `<circle cy="-20" r="34" fill="#ffe36b" stroke="#111" stroke-width="5"/><rect x="-15" y="12" width="30" height="18" fill="#999" stroke="#111" stroke-width="4"/>${[0, 1, 2, 3, 4].map(i => { const a = -Math.PI + i * Math.PI / 4; return `<path d="M${f1(Math.cos(a) * 48)},${f1(-20 + Math.sin(a) * 48)} L${f1(Math.cos(a) * 64)},${f1(-20 + Math.sin(a) * 64)}" stroke="#ffb300" stroke-width="7" stroke-linecap="round"/>`; }).join('')}`;
    case '...': return outlineText(0, 0, '...', { size: 100, font: 'Bangers', stroke: 12 });
    case 'money': return `<g transform="scale(.8)"><text y="20" font-size="90" font-family="Bangers" text-anchor="middle" fill="#43a047" stroke="#111" stroke-width="10" paint-order="stroke">$$$</text></g>`;
    case 'sweat': return `<path d="M0,-30 q-22,34 0,44 q22,-10 0,-44Z" fill="#7cc8ff" stroke="#2b7bbf" stroke-width="4"/>`;
    default: return outlineText(0, 0, kind, { size: 70, font: 'Bangers', stroke: 10 });
  }
}
function holdSVG(what, x, y, f) {
  const [kind, arg] = String(what).split(':');
  switch (kind) {
    case 'paper': return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f * 12})"><rect x="-28" y="-40" width="56" height="74" fill="#fff" stroke="#111" stroke-width="4"/><path d="M-16,-22 h32 M-16,-8 h32 M-16,6 h22" stroke="#999" stroke-width="4"/></g>`;
    case 'plan': return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f * 10})"><rect x="-60" y="-46" width="120" height="92" fill="#f1e6c8" stroke="#111" stroke-width="4"/><path d="M-40,-20 q20,-14 40,0 t40,10 M-30,20 l40,-24" stroke="#c62828" stroke-width="6" fill="none"/><path d="M6,-8 l12,-12 l2,14z" fill="#c62828"/></g>`;
    case 'telegram': case 'card': return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f * 14})"><rect x="-40" y="-30" width="80" height="58" fill="${kind === 'card' ? '#bfe3ff' : '#f5efdc'}" stroke="#111" stroke-width="4"/><path d="M-26,-12 h52 M-26,2 h52 M-26,16 h34" stroke="#888" stroke-width="5"/></g>`;
    case 'newspaper': return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f * 8})"><rect x="-44" y="-56" width="88" height="110" fill="#f1efe6" stroke="#111" stroke-width="4"/><rect x="-34" y="-46" width="68" height="16" fill="#333"/><path d="M-34,-18 h68 M-34,-4 h68 M-34,10 h68 M-34,24 h40" stroke="#999" stroke-width="5"/></g>`;
    case 'bomb': return `<g transform="translate(${f1(x)},${f1(y + 20)})"><ellipse rx="70" ry="30" fill="#6b6f72" stroke="#111" stroke-width="4"/><path d="M${-f * 66},-28 l${-f * 26},-14 v84 l${f * 26},-14" fill="#555" stroke="#111" stroke-width="4"/><circle cx="${f * 20}" r="13" fill="#f4d03f" stroke="#111" stroke-width="3"/></g>`;
    case 'flag': return `<g transform="translate(${f1(x)},${f1(y)})"><line x1="0" y1="20" x2="0" y2="-140" stroke="#5c3b22" stroke-width="7"/>${flagSVG(arg || 'white', f > 0 ? 2 : -92, -140, 90, 60)}</g>`;
    case 'gold': return `<g transform="translate(${f1(x)},${f1(y + 10)})">${[[-40, 0], [10, 0], [-15, -26]].map(([gx, gy]) => `<path d="M${gx},${gy} l8,-20 h40 l8,20z" fill="#f2c230" stroke="#8a6a12" stroke-width="3"/><path d="M${gx + 10},${gy - 16} h30" stroke="#fff3b0" stroke-width="3"/>`).join('')}</g>`;
    case 'money': return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f * -8})">${[0, 1, 2].map(k => `<rect x="${-40 + k * 4}" y="${-24 - k * 8}" width="80" height="40" rx="4" fill="#7fb77e" stroke="#2f5d2e" stroke-width="3"/><circle cx="${k * 4}" cy="${-4 - k * 8}" r="9" fill="none" stroke="#2f5d2e" stroke-width="3"/>`).join('')}</g>`;
    case 'phone': return `<g transform="translate(${f1(x)},${f1(y)})"><path d="M-30,-20 q30,-30 60,0 l-10,10 q-20,-14 -40,0z" fill="#222"/></g>`;
    case 'pistol': return `<g transform="translate(${f1(x)},${f1(y)}) scale(${f},1)"><path d="M-6,-10 h56 v14 h-38 l-6,26 h-14z" fill="#2b2b2b" stroke="#111" stroke-width="3"/></g>`;
    case 'pointer': return `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + f * 120)}" y2="${f1(y - 90)}" stroke="#7a4a22" stroke-width="7" stroke-linecap="round"/>`;
    default: return '';
  }
}

// ---------- captions ----------
function captionSVG(sc, lt) {
  const cap = S.data.captions || {};
  if (cap.enabled === false || !sc.words || !sc.words.length) return '';
  let idx = -1;
  for (let i = 0; i < sc.words.length; i++) if (sc.words[i].t0 <= lt) idx = i;
  if (idx < 0) return '';
  const w = sc.words[idx]; if (lt > w.t1 + 0.35 && idx === sc.words.length - 1) return '';
  const y = (cap.y || 0.84) * H, size = cap.size || 104, color = cap.color || '#ffe11a';
  const clean = s => s.replace(/[^\p{L}\p{N}'’,.%$-]/gu, '').replace(/[.,]$/, '').toUpperCase();
  if (cap.mode === 'phrase') {
    const per = cap.words || 3; const start = idx - (idx % per); const group = sc.words.slice(start, start + per);
    const txt = group.map((g, i) => `<tspan fill="${start + i === idx ? color : '#fff'}">${esc(clean(g.w))}</tspan>`).join(' ');
    return `<text x="${W / 2}" y="${y}" font-size="${size * 0.8}" font-weight="900" font-style="italic" text-anchor="middle" stroke="#111" stroke-width="${size * 0.16}" stroke-linejoin="round" paint-order="stroke">${txt}</text>`;
  }
  const p = clamp((lt - w.t0) / 0.12); const s = 0.75 + 0.25 * backOut(p);
  return `<g transform="translate(${W / 2},${f1(y)}) scale(${f1(s * 100) / 100})">${outlineText(0, 0, clean(w.w), { size, color, font: cap.font || 'Bangers', stroke: size * 0.2, spacing: 2 })}</g>`;
}

// ---------- frame ----------
const UI_TYPES = new Set(['text']);
const SELF_TIMED = new Set(['boom', 'plane', 'vehicle', 'bridge', 'mushroom', 'wararrow', 'route', 'flow', 'drawer']);
window.__init = async (data) => {
  S.data = data;
  const topo = data.topo;
  for (const g of topojson.feature(topo, topo.objects.countries).features) S.feats[g.properties.name] = g;
  S.land = topojson.merge(topo, topo.objects.countries.geometries.filter(g => g.properties.name !== 'Antarctica'));
  S.borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
  S.noise = makeNoise();
  S.defs = `<defs><filter id="ds" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-opacity=".35"/></filter><filter id="gray"><feColorMatrix type="saturate" values="0"/></filter><filter id="burnt"><feColorMatrix type="matrix" values=".35 0 0 0 0  0 .3 0 0 0  0 0 .28 0 0  0 0 0 1 0"/></filter>${typeof KIT_DEFS === 'string' ? KIT_DEFS : ''}</defs>`;
  // preload images so frames are deterministic
  await Promise.all(Object.values(data.assets || {}).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; })));
  try { await document.fonts.load('40px Bangers'); await document.fonts.load('40px "Gochi Hand"'); } catch (e) { /* fall back to Inter */ }
  await document.fonts.ready;
  return true;
};
window.__frame = (t) => {
  const scenes = S.data.scenes;
  let i = scenes.findIndex(s => t >= s.start && t < s.start + s.dur); if (i < 0) i = t < 0 ? 0 : scenes.length - 1;
  const sc = scenes[i], lt = t - sc.start;
  const bgEl = document.getElementById('bg'), mapEl = document.getElementById('map');
  const isMap = sc.bg && sc.bg.type === 'map';
  if (S.cur !== i || animatedBg(sc.bg)) bgEl.innerHTML = isMap ? '' : bgSVG(sc, lt);
  S.cur = i;
  mapEl.style.display = isMap ? 'block' : 'none';
  if (isMap) drawMap(sc, lt); else S.proj = null;
  // camera
  let cam = { zoom: 1, x: 0.5, y: 0.5 };
  if (sc.camera) cam = keyframes(sc.camera, lt, ['zoom', 'x', 'y', 'tx', 'ty'], { at: 0, zoom: 1, x: 0.5, y: 0.5, tx: 0, ty: 0 });
  else if (!isMap && S.data.autoPush !== false) cam = { zoom: 1 + 0.06 * easeIO(clamp(lt / Math.max(sc.dur, 0.5))), x: 0.5, y: 0.55, tx: 0, ty: 0 };
  let shx = 0, shy = 0;
  for (const it of sc.items || []) {
    if (it.shake === false) continue;
    const t0 = it.type === 'boom' ? (it.at || 0) : it.blowAt != null ? it.blowAt : it.closeAt != null ? it.closeAt + 0.12 : null;
    if (t0 == null) continue;
    const d = lt - t0, amp = it.closeAt != null && it.blowAt == null ? 10 : 22 * (it.size || 1);
    if (d >= 0 && d < 0.6) { const a = (1 - d / 0.6) * amp; shx += Math.sin(d * 90) * a; shy += Math.cos(d * 77) * a; }
  }
  document.getElementById('cam').style.transform = `translate(${f1(cam.x * W * (1 - cam.zoom) + shx - (cam.tx || 0) * W * cam.zoom)}px,${f1(cam.y * H * (1 - cam.zoom) + shy - (cam.ty || 0) * H * cam.zoom)}px) scale(${cam.zoom})`;
  // items
  let fx = S.defs, ui = '';
  for (const it of sc.items || []) {
    if (!visible(it, lt) && !SELF_TIMED.has(it.type)) continue;
    const fn = ITEM[it.type]; if (!fn) continue;
    const svg = fn(it, lt);
    if (UI_TYPES.has(it.type)) ui += svg; else fx += svg;
  }
  if (sc.flash) { const d = lt - sc.flash; if (d >= 0 && d < 0.35) ui += `<rect width="${W}" height="${H}" fill="#fff" opacity="${f1((1 - d / 0.35) * 100) / 100}"/>`; }
  ui += captionSVG(sc, lt);
  if (S.data.handle) ui += outlineText(W / 2, H - 70, S.data.handle, { size: 30, weight: 700, color: 'rgba(255,255,255,.85)', stroke: 6, strokeColor: 'rgba(0,0,0,.5)' });
  document.getElementById('fx').innerHTML = fx;
  document.getElementById('ui').innerHTML = S.data.defsUI ? S.data.defsUI + ui : ui;
};
