/* Kit: illustrated locations, vehicles, structures that can be blown up,
 * map storytelling items (routes, flows, war arrows, icons) and better VFX.
 * Loaded after engine.js; registers into ITEM and BGX. */
'use strict';

const G = 1900; // gravity, px/s^2

// ---------- path helpers ----------
function smoothPath(P, n = 10) {
  if (P.length < 3) return P.slice();
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const c = j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
function pathLen(P) { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return L; }
// position + heading at arc length s
function alongLen(P, L, s) {
  s = clamp(s, 0, L[L.length - 1]);
  let i = 1; while (i < L.length - 1 && L[i] < s) i++;
  const a = P[i - 1], b = P[i], seg = (L[i] - L[i - 1]) || 1, u = (s - L[i - 1]) / seg;
  return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
function partialD(P, L, p) {
  const s = L[L.length - 1] * p; const pts = [];
  for (let i = 0; i < P.length && L[i] <= s; i++) pts.push(P[i]);
  const e = alongLen(P, L, s); pts.push([e.x, e.y]);
  return 'M' + pts.map(v => f1(v[0]) + ',' + f1(v[1])).join(' L');
}
function curve(a, b, bend) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const c = [(a[0] + b[0]) / 2 - dy * bend, (a[1] + b[1]) / 2 + dx * bend];
  const P = []; for (let i = 0; i <= 30; i++) { const t = i / 30; P.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]); }
  return P;
}
function screenPath(it) {
  if (it.orbit) {
    const c = pt(it.orbit.center), r = it.orbit.r || 200, turns = it.orbit.turns || 2, a0 = (it.orbit.start || 0) * Math.PI / 180, ry = it.orbit.ry || r;
    const P = []; const N = Math.ceil(48 * turns);
    if (it.orbit.from) P.push(pt(it.orbit.from));
    for (let i = 0; i <= N; i++) { const a = a0 + i / N * turns * 2 * Math.PI * (it.orbit.ccw ? -1 : 1); P.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * ry]); }
    if (it.orbit.exit) P.push(pt(it.orbit.exit));
    return P;
  }
  if (it.path) return smoothPath(it.path.map(pt));
  return curve(pt(it.from), pt(it.to), it.bend || 0);
}

// ---------- gradients used by VFX ----------
const KIT_DEFS = `
<radialGradient id="gFire"><stop offset="0" stop-color="#fffbe6"/><stop offset=".25" stop-color="#ffe066"/><stop offset=".55" stop-color="#ff8a1e"/><stop offset=".85" stop-color="#d9381e" stop-opacity=".85"/><stop offset="1" stop-color="#7a1a0a" stop-opacity="0"/></radialGradient>
<radialGradient id="gFire2"><stop offset="0" stop-color="#ffd23f"/><stop offset=".5" stop-color="#ff7a1a"/><stop offset="1" stop-color="#b8260f" stop-opacity="0"/></radialGradient>
<radialGradient id="gSmoke"><stop offset="0" stop-color="#5b5550" stop-opacity=".95"/><stop offset=".6" stop-color="#3f3a36" stop-opacity=".75"/><stop offset="1" stop-color="#2e2a27" stop-opacity="0"/></radialGradient>
<radialGradient id="gSmokeL"><stop offset="0" stop-color="#cfc8c0" stop-opacity=".95"/><stop offset=".6" stop-color="#a8a099" stop-opacity=".7"/><stop offset="1" stop-color="#8d857e" stop-opacity="0"/></radialGradient>
<radialGradient id="gDust"><stop offset="0" stop-color="#c9b48f" stop-opacity=".9"/><stop offset="1" stop-color="#b39d78" stop-opacity="0"/></radialGradient>
<radialGradient id="gFlash"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".4" stop-color="#fff3b0" stop-opacity=".8"/><stop offset="1" stop-color="#ffcf6b" stop-opacity="0"/></radialGradient>
<linearGradient id="gSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3ab"/><stop offset="1" stop-color="#5d666e"/></linearGradient>
<linearGradient id="gWarArrow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb21e"/><stop offset="1" stop-color="#ff4b1f"/></linearGradient>
<linearGradient id="gTunnel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0d0d"/><stop offset="1" stop-color="#2a2622"/></linearGradient>`;

// ---------- better explosion ----------
// Fireball puffs + smoke column + debris chunks + sparks + flash. size 1 ≈ 600px wide.
function explosion(x, y, t, size, seed, opts = {}) {
  const dur = opts.dur || 2.4;
  if (t < 0 || t > dur) return '';
  const r = rng(seed), s = size;
  let o = `<g transform="translate(${f1(x)},${f1(y)}) scale(${s})">`;
  // flash
  if (t < 0.25) o += `<circle r="${f1(380 * easeOut(t / 0.25))}" fill="url(#gFlash)" opacity="${f1(1 - t / 0.25)}"/>`;
  // smoke (behind fire)
  for (let i = 0; i < 16; i++) {
    const t0 = 0.12 + r() * 0.35, life = dur - t0, u = (t - t0) / life;
    const ang = -Math.PI / 2 + (r() - 0.5) * 2.2, dist = 60 + r() * 160, rise = 180 + r() * 260;
    if (u < 0 || u > 1) { r(); r(); continue; }
    const rad = (60 + r() * 80) * (0.5 + easeOut(clamp(u * 2.2)) * 0.9);
    const px = Math.cos(ang) * dist * easeOut(u), py = Math.sin(ang) * dist * easeOut(u) * 0.6 - rise * easeOut(u);
    o += `<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(rad)}" fill="url(#${opts.light ? 'gSmokeL' : 'gSmoke'})" opacity="${f1(clamp(1.2 - u) * (r() * 0.3 + 0.7))}"/>`;
  }
  // fire puffs
  for (let i = 0; i < 18; i++) {
    const ang = r() * Math.PI * 2, dist = r() * 150, up = r() * 120;
    const u = clamp(t / (0.55 + r() * 0.5));
    const rad = (50 + r() * 90) * backOut(clamp(t / 0.3)) * (1 - u * 0.35);
    const px = Math.cos(ang) * dist * easeOut(clamp(t / 0.5)), py = Math.sin(ang) * dist * 0.7 * easeOut(clamp(t / 0.5)) - up * easeOut(clamp(t / 0.8)) - t * 60;
    const op = clamp(1.15 - u * 1.2);
    if (op > 0) o += `<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(rad)}" fill="url(#${i % 3 ? 'gFire' : 'gFire2'})" opacity="${f1(op)}"/>`;
  }
  // debris (ballistic)
  for (let i = 0; i < (opts.debris == null ? 16 : opts.debris); i++) {
    const ang = -Math.PI / 2 + (r() - 0.5) * 2.6, v = 500 + r() * 900, vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
    const px = vx * t, py = vy * t + 0.5 * G * t * t, sz = 6 + r() * 16, rot = t * (r() - 0.5) * 900;
    if (py > 500) continue;
    o += `<rect x="${f1(px - sz / 2)}" y="${f1(py - sz / 2)}" width="${f1(sz)}" height="${f1(sz * 0.7)}" fill="${opts.debrisColor || '#3b342e'}" transform="rotate(${f1(rot)} ${f1(px)} ${f1(py)})" opacity="${f1(clamp(1.6 - t))}"/>`;
  }
  // sparks
  if (t < 0.6) for (let i = 0; i < 14; i++) {
    const ang = r() * Math.PI * 2, v = 700 + r() * 700, d0 = v * t, d1 = v * Math.max(0, t - 0.05);
    o += `<line x1="${f1(Math.cos(ang) * d1)}" y1="${f1(Math.sin(ang) * d1)}" x2="${f1(Math.cos(ang) * d0)}" y2="${f1(Math.sin(ang) * d0)}" stroke="#ffe27a" stroke-width="5" stroke-linecap="round" opacity="${f1(1 - t / 0.6)}"/>`;
  }
  return o + '</g>';
}
ITEM.boom = (it, lt) => {
  const [x, y] = posOf(it);
  return explosion(x, y, lt - (it.at || 0), it.size || 1, hashStr(JSON.stringify(it.pos || [it.x, it.y]) + it.at), { dur: it.dur, light: it.light, debris: it.debris });
};

// persistent flickering fire (burning city / wreck)
ITEM.fire = (it, lt) => {
  const [x, y] = posOf(it); const s = (it.size || 1) * popT(it, lt) * (1 - exitP(it, lt));
  if (s <= 0) return '';
  const ph = hashStr(JSON.stringify(it.pos || [it.x, it.y])) % 100;
  let o = `<g transform="translate(${f1(x)},${f1(y)}) scale(${f1(s * 100) / 100})">`;
  if (it.smoke !== false) for (let i = 0; i < 4; i++) { const u = ((lt * 0.5 + i / 4 + ph) % 1); o += `<circle cx="${f1(Math.sin(u * 6 + i) * 10 + u * 25)}" cy="${f1(-60 - u * 160)}" r="${f1(18 + u * 40)}" fill="url(#gSmoke)" opacity="${f1((1 - u) * 0.8)}"/>`; }
  for (let i = 0; i < 3; i++) {
    const w = 26 - i * 6, h = 70 - i * 18 + Math.sin(lt * 13 + i * 2 + ph) * 8, dx = (i - 1) * 14;
    o += `<path d="M${dx - w},0 Q${dx - w},${-h * 0.5} ${dx + Math.sin(lt * 9 + i) * 6},${-h} Q${dx + w},${-h * 0.5} ${dx + w},0Z" fill="${['#e2401c', '#ff8a1e', '#ffd23f'][i]}"/>`;
  }
  return o + '</g>';
};

// atomic mushroom cloud (icon-size on maps, or big)
ITEM.mushroom = (it, lt) => {
  const [x, y] = posOf(it); const t = lt - (it.at || 0); if (t < 0) return '';
  const g = easeOut(clamp(t / 1.4)), s = it.size || 1;
  const stemH = 160 * g, capR = 70 * backOut(clamp((t - 0.2) / 0.9));
  let o = `<g transform="translate(${f1(x)},${f1(y)}) scale(${s})">`;
  o += `<ellipse cx="0" cy="0" rx="${f1(90 * g)}" ry="${f1(18 * g)}" fill="url(#gFire2)" opacity=".9"/>`;
  o += `<path d="M-18,0 Q-10,${f1(-stemH * 0.5)} -22,${f1(-stemH)} L22,${f1(-stemH)} Q10,${f1(-stemH * 0.5)} 18,0Z" fill="#e9dccb" stroke="#8c7b6a" stroke-width="3"/>`;
  if (capR > 0) for (const [cx, cy, rr, c] of [[-40, -10, 0.7, '#d9c7b3'], [40, -10, 0.7, '#d9c7b3'], [0, -26, 1, '#f1e6d8'], [-22, -40, 0.6, '#fff6ea'], [24, -42, 0.55, '#fff6ea']]) o += `<circle cx="${cx * (capR / 70)}" cy="${f1(-stemH + cy * (capR / 70))}" r="${f1(capR * rr)}" fill="${c}" stroke="#8c7b6a" stroke-width="3"/>`;
  if (t < 1) o += `<circle cx="0" cy="${f1(-stemH)}" r="${f1(60 * (1 - t))}" fill="url(#gFlash)"/>`;
  return o + '</g>';
};

// ---------- icons ----------
function iconSVG(kind, label) {
  switch (kind) {
    case 'question': return `<circle r="44" fill="#fff" stroke="#111" stroke-width="6"/><text y="24" font-size="70" font-weight="900" text-anchor="middle" fill="#111">?</text>`;
    case 'exclaim': return outlineText(0, 30, '!!', { size: 110, color: '#ff3b2f', font: 'Bangers', stroke: 14 });
    case 'angry': return `<circle r="46" fill="#ffb02e" stroke="#111" stroke-width="5"/><path d="M-30,-22 L-8,-10 M30,-22 L8,-10" stroke="#111" stroke-width="7" stroke-linecap="round"/><circle cx="-16" cy="-2" r="6"/><circle cx="16" cy="-2" r="6"/><rect x="-22" y="16" width="44" height="14" rx="4" fill="#fff" stroke="#111" stroke-width="4"/><path d="M-11,16 v14 M0,16 v14 M11,16 v14" stroke="#111" stroke-width="3"/><path d="M26,-50 l8,10 l10,-6 l-4,12 l12,4 l-12,6" fill="none" stroke="#e53935" stroke-width="5"/>`;
    case 'smug': return `<circle r="46" fill="#ffd54a" stroke="#111" stroke-width="5"/><path d="M-30,-8 h20 M10,-8 h20" stroke="#111" stroke-width="7" stroke-linecap="round"/><path d="M-16,18 Q4,30 24,10" stroke="#111" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    case 'money': return `<path d="M-40,40 Q-52,-8 -18,-30 L-26,-48 L26,-48 L18,-30 Q52,-8 40,40Z" fill="#7cb342" stroke="#2f5d1e" stroke-width="5"/><path d="M-22,-34 h44" stroke="#2f5d1e" stroke-width="6"/><text y="26" font-size="54" font-weight="900" text-anchor="middle" fill="#fff" stroke="#2f5d1e" stroke-width="4" paint-order="stroke">${esc(label || '$')}</text>`;
    case 'gold': return [[-34, 10], [12, 10], [-11, -18]].map(([gx, gy]) => `<path d="M${gx - 18},${gy + 14} l9,-24 h40 l9,24z" fill="#f2c230" stroke="#8a6a12" stroke-width="4"/><path d="M${gx - 6},${gy - 6} h28" stroke="#fff3b0" stroke-width="4"/>`).join('');
    case 'coal': return `<path d="M-50,30 Q-40,-20 -10,-24 Q10,-46 30,-20 Q56,-14 50,30Z" fill="#2a2a2a" stroke="#000" stroke-width="4"/><circle cx="-12" cy="0" r="6" fill="#555"/><circle cx="16" cy="-10" r="5" fill="#555"/>`;
    case 'ore': return `<path d="M-48,30 L-40,-6 L-14,-26 L16,-18 L42,-2 L48,30Z" fill="#8d5a3b" stroke="#3e2516" stroke-width="4"/><path d="M-20,-8 l10,10 M10,-6 l12,6 M-30,14 l14,-4" stroke="#c98a5a" stroke-width="5"/>`;
    case 'factory': return `<path d="M-50,40 V-6 L-25,-22 V-6 L0,-22 V-6 L25,-22 V40Z" fill="#8a8f96" stroke="#333" stroke-width="4"/><rect x="28" y="-46" width="16" height="86" fill="#6b6f75" stroke="#333" stroke-width="4"/><rect x="-38" y="10" width="14" height="14" fill="#ffd54a"/><rect x="-12" y="10" width="14" height="14" fill="#ffd54a"/>`;
    case 'tank': return `<g transform="translate(34,30) scale(.32)">${tankSVG(1, '#6b6f5a', 1, 0)}</g>`;
    case 'train': return `<g transform="scale(.3)">${locoSVG(1, 0, 0)}</g>`;
    case 'skull': return `<path d="M-38,0 A38,38 0 1 1 38,0 V18 H20 V34 H-20 V18 H-38Z" fill="#f4f1ea" stroke="#111" stroke-width="5"/><circle cx="-15" cy="0" r="10"/><circle cx="15" cy="0" r="10"/>`;
    case 'dynamite': return dynamiteSVG(0);
    case 'bulb': return `<circle cy="-10" r="34" fill="#ffe36b" stroke="#111" stroke-width="5"/><rect x="-16" y="22" width="32" height="20" fill="#999" stroke="#111" stroke-width="4"/>`;
    case 'shield': return `<path d="M0,-50 L42,-34 Q42,20 0,50 Q-42,20 -42,-34Z" fill="#e53935" stroke="#111" stroke-width="5"/><path d="M-9,-26 h18 v18 h18 v18 h-18 v18 h-18 v-18 h-18 v-18 h18z" fill="#fff"/>`;
    case 'flag': return flagSVG(label || 'white', -45, -30, 90, 60) + '<rect x="-45" y="-30" width="90" height="60" fill="none" stroke="#111" stroke-width="4"/>';
    case 'calendar': return `<rect x="-50" y="-46" width="100" height="96" rx="10" fill="#fff" stroke="#111" stroke-width="5"/><rect x="-50" y="-46" width="100" height="28" rx="10" fill="#e53935"/><text y="34" font-size="50" font-weight="900" text-anchor="middle" fill="#111">${esc(label || '')}</text>`;
    default: return outlineText(0, 20, label || kind, { size: 60 });
  }
}
ITEM.icon = (it, lt) => {
  const [x, y] = posOf(it); const s = popT(it, lt) * (1 - exitP(it, lt)) * (it.scale || 1);
  const bob = it.bob === false ? 0 : Math.sin(lt * 3 + (it.at || 0)) * 5;
  const shake = it.kind === 'angry' ? Math.sin(lt * 40) * 3 : 0;
  return `<g transform="translate(${f1(x + shake)},${f1(y + bob)}) scale(${f1(s * 100) / 100})" filter="url(#ds)">${iconSVG(it.kind, it.label)}</g>`;
};

// icons travelling along a curve, repeatedly (money flows, ore shipments)
ITEM.flow = (it, lt) => {
  const P = curve(pt(it.from), pt(it.to), it.bend == null ? 0.15 : it.bend), L = pathLen(P);
  const at = it.at || 0, every = it.every || 0.6, dur = it.dur || 1.6, n = it.count || 99;
  let o = '';
  if (it.line !== false) { const p = clamp((lt - at) / 0.5); o += `<path d="${partialD(P, L, p)}" stroke="${it.color || '#fff'}" stroke-width="6" stroke-dasharray="14 12" fill="none" opacity=".8"/>`; }
  for (let k = 0; k < n; k++) {
    const t0 = at + k * every; if (t0 > lt) break;
    const u = (lt - t0) / dur; if (u > 1) continue;
    const e = alongLen(P, L, easeIO(u) * L[L.length - 1]);
    const sc = (it.scale || 0.55) * clamp(u * 6) * clamp((1 - u) * 6);
    o += `<g transform="translate(${f1(e.x)},${f1(e.y)}) scale(${f1(sc * 100) / 100})">${iconSVG(it.icon || 'money', it.label)}</g>`;
  }
  return o;
};

// big 3D "WAR" arrow
ITEM.wararrow = (it, lt) => {
  const a = pt(it.from), b = pt(it.to), p = easeOut(clamp((lt - (it.at || 0)) / (it.dur || 0.5)));
  if (p <= 0) return '';
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, len = Math.hypot(b[0] - a[0], b[1] - a[1]) * p, w = it.width || 110;
  const body = `M0,${-w / 2} H${len - w} V${-w} L${len},0 L${len - w},${w} V${w / 2} H0Z`;
  let o = `<g transform="translate(${f1(a[0])},${f1(a[1])}) rotate(${f1(ang)})" opacity="${f1(1 - exitP(it, lt))}">`;
  o += `<path d="${body}" transform="translate(10,14)" fill="#8a2a0f"/><path d="${body}" fill="url(#gWarArrow)" stroke="#5a1a08" stroke-width="5" stroke-linejoin="round"/>`;
  if (it.text) o += `<g transform="translate(${f1(Math.max(len / 2 - w / 3, 40))},${it.flipText ? -2 : 0}) ${Math.abs(ang) > 90 ? 'rotate(180)' : ''}">${outlineText(0, w * 0.22, it.text, { size: w * 0.62, font: 'Bangers', color: '#fff', stroke: 10, strokeColor: '#5a1a08' })}</g>`;
  return o + '</g>';
};

// map route: railway/road line drawn progressively, optional vehicle running along it
ITEM.route = (it, lt) => {
  const P = smoothPath((it.points || []).map(pt), 8), L = pathLen(P), at = it.at || 0;
  const p = easeIO(clamp((lt - at) / (it.dur || 1)));
  if (p <= 0) return '';
  const d = partialD(P, L, p), style = it.style || 'rail';
  let o = '';
  if (style === 'rail') o += `<path d="${d}" stroke="#111" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${it.color || '#f5f0e1'}" stroke-width="7" stroke-dasharray="16 12" fill="none"/>`;
  else o += `<path d="${d}" stroke="rgba(0,0,0,.4)" stroke-width="${(it.width || 12) + 6}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${it.color || '#ffd23f'}" stroke-width="${it.width || 12}" fill="none" stroke-linecap="round" ${style === 'dashed' ? 'stroke-dasharray="20 14"' : ''}/>`;
  if (it.vehicle && lt >= (it.vehicleAt == null ? at + (it.dur || 1) * 0.6 : it.vehicleAt)) {
    const vt = lt - (it.vehicleAt == null ? at + (it.dur || 1) * 0.6 : it.vehicleAt), per = it.vehicleDur || 2.5;
    const u = it.loop === false ? clamp(vt / per) : (vt / per) % 1;
    const total = L[L.length - 1];
    const cars = it.cars == null ? 3 : it.cars, gap = 30 * (it.vehicleScale || 1);
    for (let k = cars; k >= 0; k--) {
      const e = alongLen(P, L, u * total - k * gap); if (u * total - k * gap < 0) continue;
      const c = k === 0 ? '#222' : (k % 2 ? '#8b4b2a' : '#5d4037');
      o += `<g transform="translate(${f1(e.x)},${f1(e.y)}) rotate(${f1(e.ang * 180 / Math.PI)}) scale(${it.vehicleScale || 1})"><rect x="-14" y="-10" width="${k === 0 ? 30 : 26}" height="20" rx="${k === 0 ? 8 : 3}" fill="${c}" stroke="#fff" stroke-width="3"/>${k === 0 ? '<circle cx="10" cy="0" r="4" fill="#ffd23f"/>' : ''}</g>`;
    }
  }
  return o;
};

// planes along any path / orbit, optionally a formation
ITEM.plane = (it, lt) => {
  const t = lt - (it.at || 0); if (t < 0) return '';
  const P = screenPath(it), L = pathLen(P), dur = it.dur || 2, total = L[L.length - 1];
  const u = clamp(t / dur); if (u >= 1 && it.stay !== true) return '';
  const n = it.count || 1, sc = it.scale || 1;
  let o = it.trail ? `<path d="${partialD(P, L, u)}" stroke="#fff" stroke-width="7" stroke-dasharray="18 14" fill="none" opacity=".9"/>` : '';
  for (let k = 0; k < n; k++) {
    const row = Math.ceil(k / 2), side = k % 2 ? -1 : 1;
    const e = alongLen(P, L, u * total - row * 90 * sc);
    const ox = -Math.sin(e.ang) * side * row * 80 * sc, oy = Math.cos(e.ang) * side * row * 80 * sc;
    const c = it.color || '#4b5157';
    o += `<g transform="translate(${f1(e.x + ox)},${f1(e.y + oy)}) rotate(${f1(e.ang * 180 / Math.PI)}) scale(${sc})"><g transform="translate(14,22)" opacity=".22"><ellipse rx="70" ry="11"/><path d="M-12,-80 L10,-80 L26,0 L10,80 L-12,80 L-2,0Z"/></g>
      <path d="M-12,-80 L10,-80 L26,0 L10,80 L-12,80 L-2,0Z" fill="${shade(c, 0.12)}" stroke="#222" stroke-width="3"/><ellipse rx="72" ry="12" fill="${c}" stroke="#222" stroke-width="3"/><path d="M-66,-26 L-54,-26 L-46,0 L-54,26 L-66,26 L-60,0Z" fill="${shade(c, 0.12)}" stroke="#222" stroke-width="3"/>
      ${[-48, -22, 22, 48].map(q => `<ellipse cx="14" cy="${q}" rx="12" ry="6" fill="#333"/>`).join('')}<circle cx="64" cy="0" r="7" fill="#9fd3ff" stroke="#222" stroke-width="2"/></g>`;
    if (it.drops) for (const dAt of [].concat(it.drops)) { const dt = lt - dAt; if (dt > 0 && dt < 0.6 && k === 0) o += `<g transform="translate(${f1(e.x)},${f1(e.y + dt * 260)}) scale(${f1(sc * (1 - dt))})"><ellipse rx="10" ry="22" fill="#333"/></g>`; }
  }
  return o;
};

// ---------- side-view vehicles ----------
function wheel(cx, cy, r, rot, rim) {
  return `<g transform="translate(${f1(cx)},${f1(cy)}) rotate(${f1(rot)})"><circle r="${r}" fill="${rim || '#b71c1c'}" stroke="#111" stroke-width="4"/><path d="M${-r + 4},0 H${r - 4} M0,${-r + 4} V${r - 4}" stroke="#111" stroke-width="4"/><circle r="${r * 0.25}" fill="#111"/></g>`;
}
function locoSVG(dir, rot, t) {
  // drawn facing right, mirrored by dir; origin = rail level, front edge
  let o = `<g transform="scale(${dir},1)">`;
  o += `<rect x="-250" y="-150" width="80" height="110" rx="6" fill="#263238" stroke="#111" stroke-width="5"/><rect x="-238" y="-136" width="50" height="40" fill="#ffe9a8" stroke="#111" stroke-width="4"/>`;
  o += `<rect x="-180" y="-118" width="170" height="78" rx="34" fill="#37474f" stroke="#111" stroke-width="5"/><rect x="-60" y="-168" width="30" height="56" fill="#263238" stroke="#111" stroke-width="5"/><rect x="-68" y="-176" width="46" height="14" fill="#111"/>`;
  o += `<rect x="-120" y="-136" width="34" height="22" rx="10" fill="#c9a44a" stroke="#111" stroke-width="4"/><path d="M-10,-50 L22,-10 H-10Z" fill="#b71c1c" stroke="#111" stroke-width="4"/><rect x="-255" y="-44" width="255" height="16" fill="#111"/>`;
  o += wheel(-210, -18, 22, rot) + wheel(-140, -26, 30, rot) + wheel(-70, -26, 30, rot) + wheel(-20, -16, 18, rot);
  o += `<path d="M-140,-26 L-70,-26" stroke="#888" stroke-width="7"/>`;
  return o + '</g>';
}
function wagonSVG(kind, dir, rot, x) {
  const c = kind === 'coal' ? '#3e3e3e' : kind === 'flat' ? '#6d4c41' : '#8d4a2b';
  let o = `<g transform="translate(${f1(x)},0) scale(${dir},1)"><rect x="-200" y="-120" width="190" height="88" rx="4" fill="${c}" stroke="#111" stroke-width="5"/>`;
  if (kind === 'coal') o += `<path d="M-196,-120 Q-150,-160 -105,-128 Q-60,-160 -14,-120Z" fill="#111"/>`;
  else o += `<path d="M-160,-112 V-40 M-60,-112 V-40" stroke="${shade(c, -0.3)}" stroke-width="5"/><rect x="-128" y="-100" width="46" height="46" fill="${shade(c, -0.2)}" stroke="#111" stroke-width="3"/>`;
  o += wheel(-165, -18, 20, rot, '#333') + wheel(-45, -18, 20, rot, '#333') + '</g>';
  return o;
}
function tankSVG(dir, color, scale, rot) {
  let o = `<g transform="scale(${dir * scale},${scale})">`;
  o += `<rect x="-230" y="-70" width="250" height="66" rx="32" fill="#2b2b2b" stroke="#111" stroke-width="5"/>`;
  for (let i = 0; i < 6; i++) o += wheel(-200 + i * 40, -36, 18, rot, '#555');
  o += `<path d="M-236,-74 L-210,-120 H-10 L24,-74Z" fill="${color}" stroke="#111" stroke-width="5" stroke-linejoin="round"/>`;
  o += `<path d="M-170,-120 L-150,-170 H-60 L-44,-120Z" fill="${shade(color, 0.08)}" stroke="#111" stroke-width="5" stroke-linejoin="round"/><rect x="-46" y="-156" width="170" height="16" rx="6" fill="${shade(color, -0.15)}" stroke="#111" stroke-width="4"/>`;
  o += `<g transform="translate(-130,-98) scale(.9)"><path d="M-14,-20 h28 v14 h14 v12 h-14 v14 h-28 v-14 h-14 v-12 h14z" fill="#fff"/><path d="M-8,-16 h16 v14 h14 v4 h-14 v14 h-16 v-14 h-14 v-4 h14z" fill="#111"/></g>`;
  return o + '</g>';
}
// vehicle: kind train|tank|cart|truck; moves from→to over [at, at+dur]; stopAt eases to a halt; blowAt wrecks it
ITEM.vehicle = (it, lt) => {
  const a = pt(it.from || { x: it.x, y: it.y }), b = pt(it.to || it.from || { x: it.x, y: it.y });
  const at = it.at || 0, dur = it.dur || 3;
  let u = clamp((lt - at) / dur);
  u = it.ease === 'out' ? easeOut(u) : it.ease === 'inout' ? easeIO(u) : u;
  const x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u);
  const dir = b[0] >= a[0] ? 1 : -1, dist = Math.hypot(b[0] - a[0], b[1] - a[1]) * u;
  const rot = dist / 26 * 57.3 * dir, sc = it.scale || 1;
  const wrecked = it.blowAt != null && lt >= it.blowAt;
  const jolt = it.blowAt != null && lt >= it.blowAt && lt < it.blowAt + 0.4 ? -Math.sin((lt - it.blowAt) / 0.4 * Math.PI) * 60 : 0;
  let o = `<g transform="translate(${f1(x)},${f1(y + jolt)}) scale(${sc})" ${wrecked ? 'filter="url(#burnt)"' : ''}>`;
  const k = it.kind || 'train';
  if (k === 'train') {
    o += locoSVG(dir, rot, lt);
    const cars = it.cars || ['box', 'coal', 'box'];
    cars.forEach((c, i) => { o += wagonSVG(c, dir, rot, -dir * (262 + i * 202)); });
    if (it.smoke !== false && !wrecked) for (let i = 0; i < 6; i++) { const q = (lt * 1.4 + i / 6) % 1; o += `<circle cx="${f1(dir * (-45 - q * 260))}" cy="${f1(-185 - q * 120)}" r="${f1(16 + q * 46)}" fill="url(#gSmokeL)" opacity="${f1((1 - q) * 0.9)}"/>`; }
  } else if (k === 'tank') o += tankSVG(dir, it.color || '#6b6f5a', 1, rot);
  else if (k === 'cart') o += `<g transform="scale(${dir},1)"><path d="M-110,-90 H110 L90,-22 H-90Z" fill="#6d4c41" stroke="#111" stroke-width="5"/>${iconSVG(it.load || 'gold').replace(/^/, '<g transform="translate(0,-120) scale(1.4)">') + '</g>'}${wheel(-60, -18, 20, rot, '#555')}${wheel(60, -18, 20, rot, '#555')}</g>`;
  else if (k === 'landingcraft') o += `<g transform="scale(${dir},1)"><path d="M-260,-40 H150 L230,-130 V-40 L200,30 H-230Z" fill="#5f6b4f" stroke="#111" stroke-width="6" stroke-linejoin="round"/><rect x="-250" y="-120" width="90" height="80" fill="#4d5740" stroke="#111" stroke-width="5"/><rect x="-235" y="-108" width="30" height="22" fill="#bfe0f2"/>${[-130, -70, -10, 50, 110].map(hx => `<circle cx="${hx}" cy="-62" r="20" fill="#e8c9a8" stroke="#111" stroke-width="4"/><path d="M${hx - 24},-70 a24,22 0 0 1 48,0Z" fill="#6b7a4a" stroke="#111" stroke-width="4"/>`).join('')}<path d="M-260,20 q60,-14 120,0 t120,0 t120,0 t120,0" stroke="#cfe3ff" stroke-width="6" fill="none" opacity=".7"/></g>`;
  else if (k === 'truck') o += `<g transform="scale(${dir},1)"><rect x="-230" y="-150" width="170" height="110" fill="${it.color || '#5d6b3a'}" stroke="#111" stroke-width="5"/><path d="M-56,-40 V-120 H10 L40,-80 V-40Z" fill="${shade(it.color || '#5d6b3a', 0.1)}" stroke="#111" stroke-width="5"/><rect x="-20" y="-112" width="34" height="30" fill="#bfe0f2" stroke="#111" stroke-width="3"/>${wheel(-190, -26, 26, rot, '#333')}${wheel(-100, -26, 26, rot, '#333')}${wheel(10, -26, 26, rot, '#333')}</g>`;
  o += '</g>';
  if (wrecked) o += ITEM.fire({ x: x / W, y: (y - 80 * sc) / H, size: 1.2 * sc, at: it.blowAt, smoke: true }, lt);
  return o;
};

// ---------- structures ----------
function dynamiteSVG(t) {
  const blink = Math.sin(t * 14) > 0;
  return `<g><rect x="-30" y="-24" width="16" height="48" rx="5" fill="#d32f2f" stroke="#111" stroke-width="3"/><rect x="-10" y="-24" width="16" height="48" rx="5" fill="#d32f2f" stroke="#111" stroke-width="3"/><rect x="10" y="-24" width="16" height="48" rx="5" fill="#d32f2f" stroke="#111" stroke-width="3"/><rect x="-34" y="-6" width="64" height="10" fill="#333"/><path d="M0,-24 q10,-18 24,-20" stroke="#333" stroke-width="3" fill="none"/><circle cx="24" cy="-44" r="7" fill="${blink ? '#ffeb3b' : '#ff5722'}"/></g>`;
}
// Stone arch viaduct. Spans in blowSpans fall after blowAt.
ITEM.bridge = (it, lt) => {
  const x0 = (it.x0 == null ? 0 : it.x0) * W, x1 = (it.x1 == null ? 1 : it.x1) * W, dy = (it.deck || 0.55) * H, by = (it.base || 0.85) * H;
  const n = it.arches || 4, span = (x1 - x0) / n, pier = span * 0.22, col = it.color || '#b9a07c';
  const blow = it.blowAt, blown = new Set(it.blowSpans || [Math.floor(n / 2)]);
  const s0 = appear(it, lt, 0.5);
  if (s0 <= 0) return '';
  let o = `<g opacity="${f1(s0)}">`;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * span, b = a + span, spring = dy + (by - dy) * 0.35, rx = (span - pier) / 2;
    const d = `M${f1(a)},${f1(dy)} H${f1(b)} V${f1(by)} H${f1(b - pier / 2)} V${f1(spring + rx * 0.2)} A${f1(rx)},${f1(rx * 0.9)} 0 0 0 ${f1(a + pier / 2)},${f1(spring + rx * 0.2)} V${f1(by)} H${f1(a)}Z`;
    let tr = '';
    if (blow != null && lt >= blow && blown.has(i)) {
      const t = lt - blow, side = i % 2 ? 1 : -1;
      tr = `transform="translate(${f1(side * 60 * t)},${f1(0.5 * G * t * t)}) rotate(${f1(side * 35 * t)} ${f1((a + b) / 2)} ${f1(dy)})"`;
    }
    o += `<g ${tr}><path d="${d}" fill="${col}" stroke="${shade(col, -0.45)}" stroke-width="5"/>`;
    for (let r = 1; r < 6; r++) { const yy = dy + r * (by - dy) / 6; o += `<path d="M${f1(a + 4)},${f1(yy)} H${f1(b - 4)}" stroke="${shade(col, -0.18)}" stroke-width="3" opacity=".6"/>`; }
    o += `<rect x="${f1(a)}" y="${f1(dy - 26)}" width="${f1(span)}" height="26" fill="${shade(col, -0.2)}" stroke="${shade(col, -0.45)}" stroke-width="4"/>`;
    if (it.rails !== false) o += `<path d="M${f1(a)},${f1(dy - 30)} H${f1(b)}" stroke="#3a3a3a" stroke-width="8"/>` + Array.from({ length: Math.floor(span / 28) }, (_, k) => `<rect x="${f1(a + k * 28 + 4)}" y="${f1(dy - 36)}" width="14" height="10" fill="#5d4037"/>`).join('');
    o += '</g>';
    if (it.explosives != null && lt >= it.explosives && (blow == null || lt < blow) && blown.has(i)) o += `<g transform="translate(${f1(a + pier * 0.2)},${f1(dy + (by - dy) * 0.55)}) scale(1.1)">${dynamiteSVG(lt)}</g><g transform="translate(${f1(b - pier * 0.2)},${f1(dy + (by - dy) * 0.55)}) scale(1.1)">${dynamiteSVG(lt + 0.3)}</g>`;
  }
  o += '</g>';
  if (blow != null) for (const i of blown) o += explosion(x0 + (i + 0.5) * span, dy + (by - dy) * 0.4, lt - blow, 1.1, 77 + i, { debrisColor: shade(col, -0.3) });
  return o;
};
// Tunnel portal in a rock face; rocks block it after blowAt.
ITEM.tunnel = (it, lt) => {
  const [x, y] = posOf(it); const s = (it.scale || 1) * popT(it, lt); if (s <= 0) return '';
  let o = `<g transform="translate(${f1(x)},${f1(y)}) scale(${f1(s * 100) / 100})">`;
  o += `<path d="M-260,0 L-230,-260 L-120,-360 L40,-390 L190,-310 L270,-180 L280,0Z" fill="${it.rock || '#7d7468'}" stroke="#3d362f" stroke-width="5"/><path d="M-180,-200 L-90,-280 M90,-300 L160,-220 M-200,-80 L-150,-120" stroke="#5f574d" stroke-width="6"/>`;
  o += `<path d="M-120,0 V-130 A120,120 0 0 1 120,-130 V0Z" fill="#cbbfa8" stroke="#3d362f" stroke-width="5"/><path d="M-92,0 V-128 A92,92 0 0 1 92,-128 V0Z" fill="url(#gTunnel)"/>`;
  o += `<path d="M-60,0 L-20,-60 M60,0 L20,-60" stroke="#555" stroke-width="6"/>`;
  if (it.label) o += outlineText(0, -250, it.label, { size: 44, font: 'Gochi Hand', weight: 400, stroke: 9 });
  if (it.blowAt != null && lt >= it.blowAt) {
    const t = lt - it.blowAt, r = rng(9);
    for (let i = 0; i < 14; i++) { const tx = (r() - 0.5) * 180, ty = -80 - r() * 280, fy = -20 - r() * 110, sz = 40 + r() * 50; const yy = Math.min(fy, ty + 0.5 * G * t * t); o += `<path d="M${f1(tx - sz / 2)},${f1(yy)} l${f1(sz * 0.3)},${f1(-sz * 0.5)} l${f1(sz * 0.6)},${f1(sz * 0.1)} l${f1(sz * 0.2)},${f1(sz * 0.5)}Z" fill="${shade(it.rock || '#7d7468', (r() - 0.5) * 0.3)}" stroke="#3d362f" stroke-width="4"/>`; }
    o += explosion(0, -110, t, 0.9, 31, { light: true, debrisColor: '#6b6258' });
  }
  return o + '</g>';
};
ITEM.bunker = (it, lt) => {
  const [x, y] = posOf(it); const p = easeOut(appear(it, lt, 0.5)); if (p <= 0) return '';
  const s = it.scale || 1, dir = it.face === 'left' ? -1 : 1, c = it.color || '#a8a59c';
  let o = `<g transform="translate(${f1(x)},${f1(y + (1 - p) * 120)}) scale(${s})"><clipPath id="bk${f1(x)}"><rect x="-300" y="-400" width="600" height="400"/></clipPath><g clip-path="url(#bk${f1(x)})">`;
  o += `<path d="M-180,0 V-120 Q-170,-180 -90,-190 H90 Q170,-180 180,-120 V0Z" fill="${c}" stroke="#3d3a33" stroke-width="6"/>`;
  o += `<path d="M-120,-150 q30,-20 60,0 M30,-170 q40,-10 70,10 M-150,-60 q40,20 80,0 M60,-50 q40,-20 90,0" stroke="#6e7a55" stroke-width="16" fill="none" opacity=".7" stroke-linecap="round"/>`;
  o += `<rect x="-80" y="-120" width="160" height="34" rx="6" fill="#1b1b1b"/><g transform="scale(${dir},1)"><rect x="20" y="-110" width="200" height="16" rx="6" fill="#333" stroke="#111" stroke-width="4"/></g>`;
  if (it.flag) o += `<line x1="-140" y1="-190" x2="-140" y2="-300" stroke="#333" stroke-width="6"/>${flagSVG(it.flag, -138, -300, 60, 60)}`;
  o += '</g></g>';
  return o;
};
ITEM.dynamite = (it, lt) => { const [x, y] = posOf(it); const s = popT(it, lt) * (it.scale || 1); if (it.blowAt != null && lt >= it.blowAt) return explosion(x, y, lt - it.blowAt, it.size || 0.8, 5); return `<g transform="translate(${f1(x)},${f1(y)}) scale(${f1(s * 100) / 100})">${dynamiteSVG(lt)}</g>`; };

// Desk drawer close-up: a document slides in, the drawer slams shut.
ITEM.drawer = (it, lt) => {
  const cx = (it.x || 0.5) * W, cy = (it.y || 0.62) * H, w = (it.w || 0.8) * W, h = 260;
  const openP = it.closeAt != null && lt >= it.closeAt ? 1 - easeOut(clamp((lt - it.closeAt) / 0.18)) : 1;
  const depth = 330 * openP;
  const paperAt = it.paperAt == null ? (it.at || 0) : it.paperAt;
  let o = '';
  // drawer interior (seen from above while open)
  o += `<path d="M${cx - w / 2 + 20},${cy - depth} H${cx + w / 2 - 20} L${cx + w / 2},${cy} H${cx - w / 2}Z" fill="#4e342e" stroke="#2b1b14" stroke-width="5"/>`;
  // the paper drops in
  const pp = clamp((lt - paperAt) / 0.7);
  if (lt >= paperAt && openP > 0.05) {
    const py = lerp(cy - 900, cy - depth * 0.55, easeOut(pp)), rot = lerp(-18, 4, easeOut(pp));
    o += `<clipPath id="dwc"><path d="M0,0 H${W} V${cy} H0Z"/></clipPath><g clip-path="url(#dwc)"><g transform="translate(${cx},${f1(py)}) rotate(${f1(rot)})"><rect x="-210" y="-140" width="420" height="280" fill="#f5efdc" stroke="#555" stroke-width="4"/><text y="-80" font-size="${f1(Math.min(40, 380 / (0.64 * String(it.title || 'TOP SECRET').length)))}" font-weight="900" text-anchor="middle" fill="#8b0000" font-family="Inter">${esc(it.title || 'TOP SECRET')}</text><path d="M-160,-30 h320 M-160,10 h320 M-160,50 h240" stroke="#999" stroke-width="8"/><path d="M-120,90 l60,-20 l40,30 l70,-40" stroke="#c62828" stroke-width="7" fill="none"/></g></g>`;
  }
  // drawer front
  o += `<rect x="${cx - w / 2}" y="${cy}" width="${w}" height="${h}" rx="10" fill="#8d5a34" stroke="#3e2516" stroke-width="6"/><rect x="${cx - w / 2 + 30}" y="${cy + 30}" width="${w - 60}" height="${h - 60}" rx="8" fill="none" stroke="#6d4325" stroke-width="5"/><rect x="${cx - 70}" y="${cy + h / 2 - 16}" width="140" height="32" rx="16" fill="#d4a93a" stroke="#6b4b12" stroke-width="5"/>`;
  if (it.closeAt != null) { const t = lt - it.closeAt; if (t > 0.15 && t < 0.9) for (let i = 0; i < 6; i++) { const q = (t - 0.15) / 0.75; o += `<circle cx="${f1(cx + (i - 2.5) * w / 6)}" cy="${f1(cy - 10 - q * 60)}" r="${f1(20 + q * 40)}" fill="url(#gDust)" opacity="${f1(1 - q)}"/>`; } }
  return o;
};

// ---------- backgrounds ----------
function ridge(seed, y0, amp, peaks, w = W) {
  const r = rng(hashStr(seed)); const pts = [[-20, H]]; let x = -20;
  const step = w / peaks;
  while (x < w + 40) { pts.push([x, y0 - r() * amp * 0.35]); pts.push([x + step * (0.3 + r() * 0.3), y0 - amp * (0.55 + r() * 0.45)]); x += step; }
  pts.push([w + 20, H]);
  return pts;
}
function polyD(pts) { return 'M' + pts.map(p => f1(p[0]) + ',' + f1(p[1])).join(' L') + 'Z'; }
function snowCaps(pts, depth) {
  let o = '';
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    if (p[1] < a[1] && p[1] < b[1]) {
      const l = [lerp(p[0], a[0], 0.35), lerp(p[1], a[1], 0.35)], r2 = [lerp(p[0], b[0], 0.35), lerp(p[1], b[1], 0.35)];
      if (Math.min(a[1], b[1]) - p[1] > depth * 0.5) o += `<path d="M${f1(l[0])},${f1(l[1])} L${f1(p[0])},${f1(p[1])} L${f1(r2[0])},${f1(r2[1])} L${f1(lerp(l[0], r2[0], 0.66))},${f1(lerp(l[1], r2[1], 0.66) + 18)} L${f1(lerp(l[0], r2[0], 0.33))},${f1(lerp(l[1], r2[1], 0.33) + 4)}Z" fill="#fbfdff"/>`;
    }
  }
  return o;
}
const BGX = window.BGX || (window.BGX = {});
BGX.mountains = (bg) => {
  const vy = (bg.valley || 0.72) * H, seed = bg.seed || 'alps';
  let o = `<defs><linearGradient id="msky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.skyTop || '#7fb6e2'}"/><stop offset="1" stop-color="${bg.skyBottom || '#e4f1f8'}"/></linearGradient><linearGradient id="mfar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9bccd"/><stop offset="1" stop-color="#c9d6df"/></linearGradient><linearGradient id="mmid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f8d8f"/><stop offset="1" stop-color="#6b7d63"/></linearGradient><linearGradient id="mnear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c8f4a"/><stop offset="1" stop-color="#4f6e36"/></linearGradient></defs>`;
  o += `<rect width="${W}" height="${H}" fill="url(#msky)"/>`;
  for (let i = 0; i < 4; i++) o += cloud(150 + i * 260, 180 + (i % 2) * 120, 0.6, 0.8);
  const far = ridge(seed + 'f', vy - 420, 520, 4), mid = ridge(seed + 'm', vy - 160, 480, 3);
  o += `<path d="${polyD(far)}" fill="url(#mfar)"/>${snowCaps(far, 120)}`;
  o += `<path d="${polyD(mid)}" fill="url(#mmid)" stroke="#55615a" stroke-width="3"/>${snowCaps(mid, 150)}`;
  o += `<path d="M-20,${vy - 120} Q${W * 0.25},${vy - 40} ${W * 0.5},${vy - 10} T${W + 20},${vy - 140} V${H} H-20Z" fill="url(#mnear)"/>`;
  o += `<rect y="${vy}" width="${W}" height="${H - vy}" fill="${bg.ground || '#5f7f3e'}"/>`;
  if (bg.river) o += `<path d="M-20,${H - 120} Q${W * 0.4},${H - 200} ${W * 0.6},${H - 140} T${W + 20},${H - 180} V${H - 100} Q${W * 0.6},${H - 60} ${W * 0.4},${H - 120} T-20,${H - 60}Z" fill="#5aa6d6" opacity=".9"/>`;
  if (bg.road) { const ry = (bg.road === true ? 0.8 : bg.road) * H; o += `<rect y="${ry - 40}" width="${W}" height="80" fill="#8a8580"/><path d="M0,${ry} H${W}" stroke="#f4f1e8" stroke-width="7" stroke-dasharray="40 30"/>`; }
  const r = rng(hashStr(seed + 'trees'));
  for (let i = 0; i < (bg.trees == null ? 14 : bg.trees); i++) { const tx = r() * W, ty = vy - 60 + r() * 50, ts = 0.6 + r() * 0.6; o += `<path d="M${f1(tx)},${f1(ty - 90 * ts)} L${f1(tx + 30 * ts)},${f1(ty)} H${f1(tx - 30 * ts)}Z" fill="#2f5233"/>`; }
  return o;
};
BGX.vault = (bg) => {
  let o = `<rect width="${W}" height="${H}" fill="#6e767d"/>`;
  for (let x = 0; x < W; x += 180) for (let y = 0; y < 1300; y += 180) o += `<rect x="${x + 6}" y="${y + 6}" width="168" height="168" fill="url(#gSteel)" stroke="#444" stroke-width="3"/>` + [[16, 16], [158, 16], [16, 158], [158, 158]].map(([a, b]) => `<circle cx="${x + a}" cy="${y + b}" r="5" fill="#3d4349"/>`).join('');
  // shelves of gold
  for (const sy of [380, 620, 860]) {
    o += `<rect x="40" y="${sy}" width="330" height="20" fill="#3d3d3d"/><rect x="${W - 370}" y="${sy}" width="330" height="20" fill="#3d3d3d"/>`;
    for (let k = 0; k < 5; k++) for (const bx of [60, W - 350]) o += `<path d="M${bx + k * 60},${sy} l8,-34 h40 l8,34z" fill="#f2c230" stroke="#8a6a12" stroke-width="3"/>`;
  }
  // round vault door (open, on the right wall)
  o += `<circle cx="${W / 2}" cy="560" r="300" fill="#2d3135" stroke="#1d2023" stroke-width="12"/><circle cx="${W / 2}" cy="560" r="250" fill="#14171a"/>`;
  o += `<g transform="translate(${W / 2 + 330},560) scale(.32,1)"><circle r="300" fill="url(#gSteel)" stroke="#333" stroke-width="16"/><circle r="200" fill="none" stroke="#555" stroke-width="20"/></g>`;
  o += `<rect y="1300" width="${W}" height="${H - 1300}" fill="#4a4f54"/><path d="M0,1300 H${W}" stroke="#2b2f33" stroke-width="10"/>`;
  return o;
};
BGX.desk = (bg) => `<rect width="${W}" height="${H}" fill="${bg.wall || '#d9c9a8'}"/><rect y="${0.36 * H}" width="${W}" height="${0.64 * H}" fill="#7a4a2a"/><rect y="${0.36 * H - 30}" width="${W}" height="40" fill="#5d3a20"/><path d="M0,${0.36 * H + 10} H${W}" stroke="#4a2c17" stroke-width="6"/>` + Array.from({ length: 10 }, (_, i) => `<path d="M0,${f1(0.42 * H + i * 110)} Q${W / 2},${f1(0.42 * H + i * 110 + 20)} ${W},${f1(0.42 * H + i * 110)}" stroke="#6d4024" stroke-width="4" fill="none" opacity=".6"/>`).join('');

// ================= Mincemeat kit: night sea, submarine, boats, documents, grave, typed text =================
REGIONS['Sicily'] = [[12.4, 38.1], [13.3, 38.2], [14.3, 38.0], [15.6, 38.3], [15.1, 37.3], [15.3, 37.0], [14.5, 36.7], [12.4, 37.6], [12.4, 38.1]];
REGIONS['Sardinia'] = [[8.4, 40.9], [9.2, 41.3], [9.8, 40.9], [9.7, 39.8], [9.6, 39.1], [8.9, 38.9], [8.4, 39.0], [8.3, 39.6], [8.5, 40.3], [8.2, 40.9], [8.4, 40.9]];

BGX.nightsea = (bg, lt) => {
  const hz = (bg.horizon || 0.42) * H, r = rng(77);
  let o = `<defs><linearGradient id="nsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050b1f"/><stop offset="1" stop-color="#1b2d55"/></linearGradient><linearGradient id="nse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14284a"/><stop offset="1" stop-color="#050c1c"/></linearGradient><radialGradient id="moonGlow"><stop offset="0" stop-color="#fff8d8" stop-opacity=".55"/><stop offset="1" stop-color="#fff8d8" stop-opacity="0"/></radialGradient></defs>`;
  o += `<rect width="${W}" height="${hz}" fill="url(#nsk)"/>`;
  for (let i = 0; i < 70; i++) { const tw = 0.5 + 0.5 * Math.sin(lt * (1 + r() * 3) + i); o += `<circle cx="${f1(r() * W)}" cy="${f1(r() * hz * 0.9)}" r="${f1(1 + r() * 2.2)}" fill="#fff" opacity="${f1(0.3 + 0.6 * tw)}"/>`; }
  const mx = (bg.moonX || 0.74) * W, my = hz * 0.32;
  o += `<circle cx="${mx}" cy="${my}" r="230" fill="url(#moonGlow)"/><circle cx="${mx}" cy="${my}" r="62" fill="#fdf6d8"/><circle cx="${mx - 18}" cy="${my - 12}" r="12" fill="#eee5bf"/><circle cx="${mx + 20}" cy="${my + 16}" r="8" fill="#eee5bf"/>`;
  if (bg.coast) o += `<path d="M0,${hz} L0,${hz - 60} Q120,${hz - 110} 260,${hz - 70} T520,${hz - 40} L560,${hz}Z" fill="#0a1426"/>`;
  o += `<rect y="${hz}" width="${W}" height="${H - hz}" fill="url(#nse)"/>`;
  for (let i = 0; i < 18; i++) { const y = hz + 12 + Math.pow(i / 18, 1.7) * (H - hz), w = 40 + i * 9, off = Math.sin(lt * 1.2 + i) * 14; o += `<rect x="${f1(mx - w / 2 + off)}" y="${f1(y)}" width="${f1(w)}" height="${f1(3 + i / 4)}" rx="3" fill="#fff6c9" opacity="${f1(0.55 - i / 40)}"/>`; }
  for (let i = 0; i < 22; i++) { const y = hz + 20 + Math.pow(i / 22, 1.5) * (H - hz); const off = (lt * 25 * (1 + i / 12) + i * 71) % 220; o += `<path d="M${-220 + off},${f1(y)} q55,-10 110,0 t110,0 t110,0 t110,0 t110,0 t110,0 t110,0 t110,0 t110,0 t110,0 t110,0 t110,0" stroke="rgba(160,190,255,${f1(0.05 + i / 160)})" stroke-width="${f1(2 + i / 5)}" fill="none"/>`; }
  return o;
};
BGX.spotlight = (bg) => `<defs><radialGradient id="spotF" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2c4" stop-opacity=".9"/><stop offset="1" stop-color="#fff2c4" stop-opacity="0"/></radialGradient><linearGradient id="spotB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d5" stop-opacity=".55"/><stop offset="1" stop-color="#fff6d5" stop-opacity=".05"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="${bg.color || '#0d0f14'}"/><path d="M${W / 2 - 70},0 H${W / 2 + 70} L${W / 2 + 330},${H * 0.8} H${W / 2 - 330}Z" fill="url(#spotB)"/><ellipse cx="${W / 2}" cy="${H * 0.8}" rx="360" ry="80" fill="url(#spotF)"/>`;
BGX.londonnight = (bg) => {
  const r = rng(hashStr('london'));
  let o = `<defs><linearGradient id="lsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1330"/><stop offset="1" stop-color="#3a3f63"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#lsk)"/>`;
  o += `<rect x="${W * 0.66}" y="420" width="120" height="900" fill="#141a33"/><path d="M${W * 0.66 - 10},420 L${W * 0.66 + 60},300 L${W * 0.66 + 130},420Z" fill="#141a33"/><circle cx="${W * 0.66 + 60}" cy="520" r="44" fill="#ffe9a0" stroke="#141a33" stroke-width="8"/><path d="M${W * 0.66 + 60},520 l0,-30 M${W * 0.66 + 60},520 l20,8" stroke="#141a33" stroke-width="6"/>`;
  for (let layer = 0; layer < 2; layer++) { let x = -20; while (x < W) { const w = 90 + r() * 140, h = (layer ? 380 : 560) + r() * 360, base = 1350; const col = layer ? '#1b2142' : '#252c52'; o += `<rect x="${f1(x)}" y="${f1(base - h)}" width="${f1(w)}" height="${f1(h)}" fill="${col}"/>`; for (let wy = base - h + 30; wy < base - 40; wy += 58) for (let wx = x + 16; wx < x + w - 26; wx += 38) if (r() < 0.35) o += `<rect x="${f1(wx)}" y="${f1(wy)}" width="16" height="24" fill="#ffd36b" opacity="${f1(0.6 + r() * 0.4)}"/>`; x += w + (layer ? 6 : 24); } }
  o += `<rect y="1350" width="${W}" height="${H - 1350}" fill="#2a2a33"/><rect y="1350" width="${W}" height="14" fill="#15151c"/>`;
  for (let i = 0; i < 4; i++) o += `<ellipse cx="${f1(r() * W)}" cy="${f1(1200 + r() * 300)}" rx="${f1(300 + r() * 200)}" ry="60" fill="#c9cde0" opacity=".08"/>`;
  return o;
};
BGX.cemetery = (bg) => `<defs><linearGradient id="csk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c48a"/><stop offset="1" stop-color="#fbe7c7"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#csk)"/>
  <circle cx="${W * 0.2}" cy="${H * 0.3}" r="110" fill="#ffd27a" opacity=".8"/>
  <path d="M0,${H * 0.55} Q${W * 0.3},${H * 0.5} ${W * 0.6},${H * 0.54} T${W},${H * 0.52} V${H} H0Z" fill="#9fae6a"/><rect y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="#87985a"/>
  ${[0.08, 0.86].map(x => `<path d="M${W * x},${H * 0.62} q-40,-260 0,-520 q40,260 0,520Z" fill="#3f5a32"/>`).join('')}
  ${[0.25, 0.75].map(x => `<rect x="${W * x - 40}" y="${H * 0.56}" width="80" height="110" rx="30" fill="#c7c0b0" opacity=".7"/>`).join('')}`;

// submarine (side view) that surfaces at `at`; water band drawn over the lower hull
ITEM.submarine = (it, lt) => {
  const [x, y] = posOf(it); const s = it.scale || 1, t = lt - (it.at || 0); if (t < -0.01 && it.at > 0) return '';
  const rise = 1 - easeOut(clamp(t / (it.riseDur || 1.4))), dy = rise * 160, bob = Math.sin(lt * 1.4) * 5;
  const sea = it.sea || '#14284a';
  let o = `<g transform="translate(${f1(x)},${f1(y + bob)}) scale(${s})">`;
  o += `<g transform="translate(0,${f1(dy)})"><path d="M-420,10 Q-430,-40 -330,-50 H330 Q420,-40 440,0 Q420,40 330,46 H-330 Q-430,40 -420,10Z" fill="#2c3440" stroke="#0e1218" stroke-width="6"/>`;
  o += `<path d="M-90,-50 L-70,-170 H70 L100,-50Z" fill="#2c3440" stroke="#0e1218" stroke-width="6"/><rect x="-10" y="-260" width="10" height="95" fill="#0e1218"/><rect x="-10" y="-260" width="40" height="10" fill="#0e1218"/>`;
  o += `<rect x="-55" y="-140" width="26" height="14" rx="4" fill="#ffe28a" opacity="${f1(0.6 + 0.4 * Math.sin(lt * 3))}"/><text x="210" y="15" font-size="40" font-weight="900" fill="#97a3b3" font-family="Inter">${esc(it.label || 'P 219')}</text>`;
  o += `<path d="M-330,-20 H330" stroke="#46505e" stroke-width="5"/></g>`;
  o += `<rect x="-600" y="10" width="1200" height="260" fill="${sea}" opacity=".88"/><path d="M-600,10 q60,-12 120,0 t120,0 t120,0 t120,0 t120,0 t120,0 t120,0 t120,0 t120,0 t120,0" stroke="#9fb8e8" stroke-width="5" fill="none" opacity=".5"/>`;
  return o + '</g>';
};
// small fishing boat with a fisherman, bobbing; optional move from->to
ITEM.boat = (it, lt) => {
  let [x, y] = posOf(it);
  if (it.to) { const b = pt(it.to), q = easeIO(clamp((lt - (it.moveAt == null ? (it.at || 0) : it.moveAt)) / (it.moveDur || 2))); x = lerp(x, b[0], q); y = lerp(y, b[1], q); }
  const s = (it.scale || 1) * popT(it, lt), bob = Math.sin(lt * 2) * 8, tilt = Math.sin(lt * 1.6) * 3, f = it.face === 'left' ? -1 : 1;
  let o = `<g transform="translate(${f1(x)},${f1(y + bob)}) rotate(${f1(tilt)}) scale(${f1(f * s * 100) / 100},${f1(s * 100) / 100})">`;
  o += `<line x1="-40" y1="-60" x2="-40" y2="-330" stroke="#5d4037" stroke-width="10"/><path d="M-36,-320 L120,-110 H-36Z" fill="#f1e3c3" stroke="#8d7a5a" stroke-width="4"/>`;
  o += `<g transform="translate(70,-60) scale(.38)">${drawChar({ x: 0, y: 0, outfit: 'civil', color: '#c0573a', hair: 'short', hairColor: '#222', mustache: 'thin', face: 'right', mood: it.mood || 'shocked', pose: it.pose || 'point', enter: 'none', at: -9 }, lt).replace(/translate\([^)]*\) rotate/, 'translate(0,0) rotate')}</g>`;
  o += `<path d="M-230,-70 H240 L190,30 H-190Z" fill="#c62828" stroke="#5a1010" stroke-width="7" stroke-linejoin="round"/><path d="M-220,-50 H230" stroke="#fff" stroke-width="10"/><text x="-60" y="2" font-size="34" font-weight="900" fill="#fff" font-family="Inter">HUELVA</text>`;
  return o + '</g>';
};
// documents: id | photo | letter | ticket | bank | plans
function docSVG(kind, text) {
  switch (kind) {
    case 'id': return `<rect x="-150" y="-100" width="300" height="200" rx="12" fill="#e9dfc4" stroke="#6b5a3a" stroke-width="5"/><rect x="-130" y="-70" width="100" height="120" fill="#cfc6b0" stroke="#6b5a3a" stroke-width="3"/><circle cx="-80" cy="-30" r="26" fill="#a8977a"/><path d="M-120,40 q40,-40 80,0" fill="#a8977a"/><text x="-10" y="-50" font-size="20" font-weight="800" fill="#4a3a20" font-family="Inter">NAVAL ID</text><path d="M-10,-20 h120 M-10,10 h120 M-10,40 h90" stroke="#9c8a66" stroke-width="7"/><text x="-10" y="80" font-size="22" font-weight="900" fill="#4a3a20" font-family="Inter">W. MARTIN</text>`;
    case 'photo': return `<rect x="-120" y="-150" width="240" height="300" fill="#fbfaf5" stroke="#999" stroke-width="3"/><rect x="-100" y="-130" width="200" height="220" fill="#8a8f96"/><circle cx="0" cy="-50" r="44" fill="#d9c5b0"/><path d="M-50,-60 q50,-80 100,0 q-10,-30 -50,-40 q-40,10 -50,40Z" fill="#3e2b1f"/><path d="M-70,90 q70,-90 140,0Z" fill="#5b6f8f"/><text y="132" font-size="34" text-anchor="middle" fill="#333" font-family="Gochi Hand">Pam x</text>`;
    case 'letter': return `<rect x="-140" y="-170" width="280" height="340" fill="#fff7f2" stroke="#d9a6b0" stroke-width="4"/><text x="-110" y="-120" font-size="36" fill="#a83250" font-family="Gochi Hand">My darling Bill,</text>${[0, 1, 2, 3, 4].map(k => `<path d="M-110,${-80 + k * 42} q50,-10 100,0 t110,0" stroke="#a1556b" stroke-width="4" fill="none"/>`).join('')}<path d="M60,120 c0,-25 40,-25 40,0 c0,25 -40,40 -40,50 c0,-10 -40,-25 -40,-50 c0,-25 40,-25 40,0Z" fill="#e53950"/>`;
    case 'ticket': return `<rect x="-170" y="-70" width="340" height="140" rx="10" fill="#f7d36a" stroke="#8a6a12" stroke-width="5"/><path d="M80,-70 V70" stroke="#8a6a12" stroke-width="4" stroke-dasharray="10 8"/><text x="-150" y="-20" font-size="26" font-weight="900" fill="#5a3f08" font-family="Inter">PRINCE OF WALES</text><text x="-150" y="20" font-size="24" font-weight="800" fill="#5a3f08" font-family="Inter">THEATRE · STALLS</text><text x="96" y="12" font-size="30" font-weight="900" fill="#5a3f08" font-family="Inter">22</text>`;
    case 'bank': return `<rect x="-150" y="-180" width="300" height="360" fill="#fdfdfb" stroke="#888" stroke-width="4"/><text x="-120" y="-130" font-size="28" font-weight="900" fill="#1f3b6b" font-family="Inter">LLOYDS BANK</text>${[0, 1, 2].map(k => `<path d="M-120,${-80 + k * 36} h240" stroke="#bbb" stroke-width="7"/>`).join('')}<text x="-120" y="60" font-size="40" font-weight="900" fill="#c62828" font-family="Inter">£79 19s 2d</text><g transform="translate(10,130) rotate(-12)"><rect x="-135" y="-34" width="270" height="62" fill="none" stroke="#c62828" stroke-width="7"/><text y="14" font-size="38" font-weight="900" text-anchor="middle" fill="#c62828" font-family="Inter">OVERDRAWN</text></g>`;
    case 'plans': return `<rect x="-170" y="-210" width="340" height="420" fill="#f5efdc" stroke="#555" stroke-width="4"/><text y="-150" font-size="34" font-weight="900" text-anchor="middle" fill="#8b0000" font-family="Inter">MOST SECRET</text><path d="M-130,-100 h260 M-130,-60 h260 M-130,-20 h200" stroke="#999" stroke-width="8"/><path d="M-110,60 q60,-50 120,-10 l40,-30" stroke="#c62828" stroke-width="9" fill="none"/><path d="M50,0 l26,8 l-18,20z" fill="#c62828"/><text y="150" font-size="30" font-weight="900" text-anchor="middle" fill="#333" font-family="Inter">GREECE · SARDINIA</text>`;
    default: return outlineText(0, 0, text || kind, { size: 50 });
  }
}
ITEM.doc = (it, lt) => {
  const [x, y] = posOf(it); const p = appear(it, lt, 0.35), s = (it.scale || 1) * (p >= 1 ? 1 : backOut(p)) * (1 - exitP(it, lt));
  if (s <= 0) return '';
  const rot = (it.rotate || 0) + (1 - easeOut(p)) * -25, fly = (1 - easeOut(p)) * 220;
  return `<g transform="translate(${f1(x)},${f1(y + fly)}) rotate(${f1(rot)}) scale(${f1(s * 100) / 100})" filter="url(#ds)">${docSVG(it.kind, it.text)}</g>`;
};
// typewriter text on a card
ITEM.typed = (it, lt) => {
  const [x, y] = posOf(it); const txt = String(it.text), n = Math.floor(clamp((lt - (it.at || 0)) / (it.dur || 1.2)) * txt.length);
  if (lt < (it.at || 0) - 0.3) return '';
  const size = it.size || 74, w = txt.length * size * 0.62 + 80, cursor = Math.floor(lt * 3) % 2 ? '|' : ' ';
  return `<g transform="translate(${f1(x)},${f1(y)})" filter="url(#ds)"><rect x="${f1(-w / 2)}" y="${f1(-size * 1.1)}" width="${f1(w)}" height="${f1(size * 1.7)}" fill="#f5efdc" stroke="#6b5a3a" stroke-width="5"/><text x="${f1(-w / 2 + 40)}" y="${f1(size * 0.2)}" font-size="${size}" font-family="Courier New, monospace" font-weight="700" fill="#222">${esc(txt.slice(0, n))}${n < txt.length ? cursor : ''}</text></g>`;
};
// camera flash burst with a small camera
ITEM.flash = (it, lt) => {
  const t = lt - (it.at || 0); if (t < 0 || t > 1.2) return '';
  const [x, y] = posOf(it), s = it.scale || 1, k = 1 - clamp(t / 0.5);
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${s})"><circle r="${f1(60 + 500 * easeOut(clamp(t / 0.25)))}" fill="url(#gFlash)" opacity="${f1(k)}"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i * Math.PI / 4; return `<path d="M${f1(Math.cos(a) * 90)},${f1(Math.sin(a) * 90)} L${f1(Math.cos(a) * (90 + 160 * k))},${f1(Math.sin(a) * (90 + 160 * k))}" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="${f1(k)}"/>`; }).join('')}<g transform="translate(0,0)"><rect x="-70" y="-40" width="140" height="90" rx="12" fill="#333" stroke="#111" stroke-width="5"/><circle cx="0" cy="5" r="28" fill="#555" stroke="#111" stroke-width="5"/><rect x="30" y="-58" width="34" height="20" fill="#333"/></g></g>`;
};
// headstone with lines of text; `addAt` carves in the final line(s)
ITEM.grave = (it, lt) => {
  const [x, y] = posOf(it); const s = it.scale || 1, lines = it.lines || [], add = it.added || [];
  let o = `<g transform="translate(${f1(x)},${f1(y)}) scale(${s})" filter="url(#ds)"><path d="M-260,0 V-520 Q-260,-640 0,-650 Q260,-640 260,-520 V0Z" fill="#e2dccf" stroke="#8d8676" stroke-width="8"/><path d="M-230,-30 V-510 Q-230,-610 0,-620 Q230,-610 230,-510 V-30Z" fill="none" stroke="#b9b2a2" stroke-width="4"/><path d="M-20,-600 h40 v40 h40 v40 h-40 v70 h-40 v-70 h-40 v-40 h40z" fill="#b9b2a2"/>`;
  const top = it.addAbove ? -330 + add.length * 66 : -380;
  lines.forEach((l, i) => { o += `<text y="${top + i * 62}" font-size="${l.size || 44}" font-weight="800" text-anchor="middle" fill="#5d574a" font-family="Inter">${esc(l.text || l)}</text>`; });
  if (it.addAt != null && lt >= it.addAt) {
    const q = clamp((lt - it.addAt) / (it.addDur || 1.4)), y0 = it.addAbove ? -430 : -380 + lines.length * 62 + 30;
    o += `<clipPath id="carve"><rect x="-240" y="${y0 - 70}" width="${f1(480 * q)}" height="${add.length * 70 + 40}"/></clipPath><g clip-path="url(#carve)">` + add.map((l, i) => `<text y="${y0 + i * 66}" font-size="${l.size || 46}" font-weight="900" text-anchor="middle" fill="#3b352a" font-family="Inter">${esc(l.text || l)}</text>`).join('') + `</g>`;
    if (q < 1) o += `<circle cx="${f1(-240 + 480 * q)}" cy="${y0 - 10}" r="${f1(8 + Math.random() * 0)}" fill="#fff8c0"/>`;
  }
  o += `<rect x="-300" y="-10" width="600" height="40" rx="10" fill="#cfc8b8" stroke="#8d8676" stroke-width="6"/>`;
  return o + '</g>';
};
