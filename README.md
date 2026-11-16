# thetimeguests: Shorts engine

Turns a scene file (`project.json`) into a finished vertical history Short (1080×1920 MP4):

- **Voiceover:** Gemini text-to-speech, one clip per scene, cached.
- **Maps:** drawn from real country outlines, with animated zooms, country fills, arrows, markers, flag tokens, explosions and planes.
- **Characters:** cartoon figures drawn in SVG, with poses, moods, talking mouths, blinking, hats, mustaches, props and speech lines.
- **Backgrounds:** rooms, fields, cities, sky and sea, all drawn in code, or your own images.
- **Captions:** one word at a time, synced to the narration.
- **Sound effects:** pops, whooshes, booms and stamps, synthesized and placed automatically on each visual event.

## Requirements

- Node 18+, ffmpeg, and Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`)
- A Gemini API key in `GEMINI_API_KEY`. It's used for the voice and, optionally, for generated background images.

```bash
npm install
node src/cli.mjs projects/switzerland --stills 8   # contact sheet, about 15s: check the layout first
node src/cli.mjs projects/switzerland --still 12.5 # one frame at t=12.5s
node src/cli.mjs projects/switzerland --preview    # half resolution, 24fps
node src/cli.mjs projects/switzerland              # final render -> projects/switzerland/out/*.mp4
```

Options: `--fps 30`, `--workers 4`, `--no-sfx`, `--out file.mp4`.

## Workflow

1. Write the script. Open with a surprising claim and a question, answer it early, add a twist, end on an ironic payoff. About 120–170 words gives a 40–60s Short.
2. Split the script into scenes of 1–2 sentences each. Each scene's `say` becomes one narration clip.
3. Cut each scene into **shots of 2–3 seconds**, and show every noun and verb literally (see `docs/reference-breakdown.md`). If the narrator says "railway", put a train on screen. If they say "blown to pieces", blow it up.
4. Run `--shots` (one still per shot), fix the layout, then do the final render. For sound-only changes, use `--remux`.

## project.json

```jsonc
{
  "name": "file-name-for-output",
  "voice": { "name": "Charon", "speed": 1.0 },  // Gemini voice; also "style", "model", "maxPause"
  "captions": { "mode": "word", "color": "#ffe11a", "size": 92, "y": 0.85 }, // or mode "phrase"
  "handle": "@thetimeguests",
  "music": "assets/music.mp3", "musicVolume": 0.12,   // optional
  "sfx": { "volume": 1 },                              // or { "enabled": false }
  "scenes": [ { "say": "...", "bg": { ... }, "items": [ ... ], "camera": [ ... ] } ]
}
```

A scene can use `"audio": "assets/line3.wav"` instead of TTS (your own recording), or have no `say` and a fixed `"dur": 2`.

### Speech: lock the voice before building visuals

Run `node src/cli.mjs projects/<name> --audio` first. It voices every line and writes `out/narration-preview.m4a` (listen to it) and `out/speech-report.md`. For each line, the report shows:
- duration
- syllables per second, with pauses excluded
- loudness (LUFS)
- every real pause
- a round-trip transcript compared with `say`

Fix the flagged lines before you build any shots.

| field | where | does |
|---|---|---|
| `voice.model` | project | pins one TTS model (no silent fallback to another voice) |
| `voice.style` | project or line | short delivery cue. Keep it short: long instructions get read aloud |
| `direction` | line | a few words of delivery for that line ("deadpan", "sly and amused") |
| `voice.name` | line | a different voice, e.g. for character lines |
| `voice.sps` | project or line | target syllables/second. Clips are nudged toward it (0.9–1.25×, pitch kept). The proven narrator runs about 5.3 |
| `voice.maxPause` | project or line | longest pause kept inside a line. Raise it on lines with a deliberate beat |
| `voice.lufs` | project | loudness target. Every clip is gain-matched to it |
| `tts` | line | what the voice reads, when it differs from the captions (years spelled out, names respelled) |
| `rawAudio` | line | an approved raw take (e.g. `assets/voice/line03.wav`). It skips TTS and survives prompt edits |
| `captions: false` | line | for voiced character lines. The line shows at the speaker instead |
| `pause` | line | silence after the line |

The free Gemini tier allows about 10 voice requests per model per day, so lock a good take with `rawAudio`.

### Shots: several pictures per narration line

```jsonc
{ "say": "And Germany needed those railways. The Gotthard and Simplon tunnels were its fastest link to its ally, Italy.",
  "shots": [
    { "bg": { "type": "map", ... }, "items": [ ... ] },                  // from the start of the line
    { "at": "Gotthard", "bg": { "same": true, "view": [...] }, "keep": ["gotthard"], "items": [ ... ] },
    { "at": "ally", "bg": "same", "keep": true, "items": [ ... ] }
  ] }
```

- `at` sets when the shot cuts in, as a word cue.
- `bg: "same"` continues the previous map exactly where it ended, with its zoom and coloured countries. Add `view` to move the camera from there, or `fills` to colour more countries.
- `keep: true` carries over map markers, fires, arrows and tokens. `keep: ["id"]` carries over specific items by `id`.

### Cast

Define each character once and reuse it in every shot: `"cast": { "hitler": { "type": "char", "outfit": "military", ... } }`. Then use `{ "cast": "hitler", "x": 0.3, "y": 0.74, "pose": "point" }`.

### Cues: timing things to words

Any `at`, `until`, `moveAt`, `blowAt`, `closeAt`, `explosives`, `paperAt` takes seconds into the shot (negative = already on screen at the cut, no entrance animation), or a word cue:

| cue | meaning |
|---|---|
| `"bomb"` | when the narrator starts saying a word beginning with "bomb" |
| `"bomb#2"` | the second such word |
| `"atomic bomb"` | a phrase |
| `"bomb+0.4"`, `"end-0.5"`, `"start+1"` | offsets |

Word timing starts as an estimate from word lengths, then snaps to real pauses in the voice clip: each sentence or comma break is matched to a detected silence of at least 0.1s, but only when one is close. Breaks with no matching pause keep the estimate. Expect within about 0.2s; keep scenes short.

### Points

On **map** scenes, points are `[lon, lat]`, and a character can stand on the map with `"pos": [lon, lat]` and `"scale": 0.5`. Everywhere else, use `"x"`/`"y"` as fractions of the frame (0–1). Characters stand with their feet at `y`. Around 0.74 keeps them clear of the captions.

### Backgrounds (`bg`)

| type | fields |
|---|---|
| `map` | `view`: `{lon, lat, span}` or keyframes `[{at, lon, lat, span, dur}]` (`span` = degrees of longitude across the frame); `fills`: `[{countries:[...], color, at, until, opacity, fade}]` or `{coords:[[lon,lat],...]}`; `ocean`, `land`; `style: "paper"` for a hand-drawn planning map |
| `mountains` | Alpine valley: `valley` (0–1), `road` (y, 0–1), `river`, `trees`, `seed` |
| `vault` | bank vault with gold shelves and a round door |
| `desk` | desk close-up (use with the `drawer` item) |
| `room` | `wall`, `floor`, `props`: `window`, `flag` `{flag, x}`, `easelmap`/`wallmap` `{focus, highlight, cities:[{name,lon,lat}], x,y,w,h}`, `desk`, `lamp`, `frame`, `globe`, `tv` |
| `field` | `palette`: grass, desert, snow or mud; `craters`, `seed` |
| `city` | `ruins: true`, `seed` |
| `sky` / `sea` | animated clouds / waves |
| `plain` | `color` |
| `image` | `src` (file in the project), or `prompt` (generated with Gemini when your key has image quota), `kenburns: [1, 1.08]`, `grayscale` |

Country names follow Natural Earth (`"United States of America"`, `"South Korea"`, ...). Wartime groupings also work: `USSR`, `Korea`, `Yugoslavia`, `Czechoslovakia`, `French Indochina`, `British India`, `USA`, `UK`. Regions: `Manchuria`, `Sakhalin South`, `Kuril Islands`.

### Items

| type | fields |
|---|---|
| `char` | `x, y, scale, face: "left"/"right"`, `outfit`: suit, military, navy, soldier, civil or robe; `color, tie, skin, hair`: short, side, slick, white, sides or bald; `hairColor, mustache`: toothbrush, walrus or thin; `beard, glasses, medals, hat`: cap, navy, helmet, fedora, ushanka, kepi or crown; `hatColor`, `hold`: paper, plan, telegram, card, newspaper, bomb, gold, money, pistol, pointer or `flag:<name>`; `holds: [{at, item, drop}]` (change props, or `drop: true` to let one fall); `throws: [{at, item, to:{x,y}, dur}]`; `fly: {at, to, spin}` (blown away); `jumps: [cue,...]`; `emotes: [{at, kind, until}]` (`!!`, `?`, `anger`, `idea`, `...`, `money`, `sweat`); `pose`/`poses: [{at, pose}]` (down, point, up, cheer, surrender, shrug, hips, wave, hold, fist, think, facepalm); `mood`/`moods` (neutral, happy, smug, angry, furious, worried, sad, scared, shocked, dead); `say: [{text, at, until}]`; `enter`/`exit`: pop, left, right, up, drop, fade or none; `moves: [{at, x, y, dur}]`; `faceImage` (cut-out portrait PNG instead of the drawn face) |
| `marker` | `pos, label, color` |
| `label` | `pos, text, size, color` |
| `arrow` | `from, to, color, width, bend, dur` |
| `pulse` | `pos, r, color` |
| `token` | `pos, flag`, optional `to, moveAt, moveDur` (moves like a game piece) |
| `plane` | `from, to` or `path: [...]` or `orbit: {center, r, turns, from, exit}`, `dur, scale, count` (formation), `drops: [cue]` |
| `boom` | `pos` or `x,y`, `size`: fireball, smoke, debris and sparks; shakes the camera |
| `fire` | `pos, size`: burning city or wreck that stays on screen |
| `mushroom` | `pos, size`: atomic cloud |
| `icon` | `pos, kind`: question, exclaim, angry, smug, money (`label`), gold, coal, ore, factory, tank, train, skull, dynamite, bulb, shield, flag |
| `flow` | `from, to, icon, label, every, dur, bend, line`: a stream of icons (money out, ore in) |
| `route` | `points: [[lon,lat],...]`, `style`: rail, road or dashed; `vehicle: true` runs a train along it |
| `wararrow` | `from, to, text, width`: big 3D arrow |
| `vehicle` | `kind`: train (`cars`), tank, truck or cart (`load`); `from, to, at, dur, ease, scale, blowAt` |
| `bridge` | `x0, x1, deck, base, arches, explosives` (cue: dynamite appears), `blowAt` (cue), `blowSpans` |
| `tunnel` | `x, y, scale, label, blowAt` |
| `bunker` | `x, y, scale, flag, face` |
| `dynamite` | `pos, blowAt` |
| `drawer` | `title, paperAt, closeAt`: a document drops into a drawer that slams shut |
| `check` / `cross` | `pos, scale` |
| `flagpole` | `pos, flag` |
| `text` | `text`, `style`: big, date, title or stamp; `x, y, size, color` |
| `image` | `src, x, y, w, rotate, grayscale` (for archive photos) |

Flags: usa, japan, risingsun, ussr, uk, switzerland, france, italy, germany, wehrmacht, china, prc, poland, spain, finland, sweden, norway, greece, yugoslavia, belgium, netherlands, australia, white.

Every item takes `at` / `until`, and `sfx: false` or `sfx: "boom"` to change its sound.

### Camera

`"camera": [{ "at": 0, "zoom": 1 }, { "at": "Kyoto", "zoom": 1.4, "x": 0.3, "y": 0.6, "dur": 0.5 }]` zooms toward the point (x, y). `tx`/`ty` pan the camera, for example to reveal a character placed at `x: 1.4`. Without a camera, every non-map shot slowly pushes in; set `"autoPush": false` in the project to turn that off. Add `"flash": "bomb"` on a shot for a white flash.

## Layout

```
src/        cli, voice (TTS + word timing), timeline (cues), audio (sfx + mix), render (Playwright -> ffmpeg)
runtime/    browser engine that draws one frame for a time t (engine.js: maps, characters; kit.js: locations, vehicles, VFX)
docs/       reference-breakdown.md: shot-by-shot study of a top channel's Short and the rules it follows
projects/   one folder per video: project.json, assets/, out/ (renders), .cache/ (TTS, ignored by git)
```
