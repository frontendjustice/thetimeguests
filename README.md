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
3. For each scene, pick a background and add `items`, timing them to spoken words (see **Cues**).
4. Run `--stills 8`, fix the layout, then do the final render.

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

### Cues: timing things to words

Any `at`, `until` or `moveAt` takes seconds into the scene, or a word cue:

| cue | meaning |
|---|---|
| `"bomb"` | when the narrator starts saying a word beginning with "bomb" |
| `"bomb#2"` | the second such word |
| `"atomic bomb"` | a phrase |
| `"bomb+0.4"`, `"end-0.5"`, `"start+1"` | offsets |

Word timing is estimated from word length inside each clip. It's usually within about 0.2s, so keep scenes short.

### Points

On **map** scenes, points are `[lon, lat]`. Everywhere else, and for characters even on maps, use `"x"`/`"y"` as fractions of the frame (0–1). Characters stand with their feet at `y`. Around 0.74 keeps them clear of the captions.

### Backgrounds (`bg`)

| type | fields |
|---|---|
| `map` | `view`: `{lon, lat, span}` or keyframes `[{at, lon, lat, span, dur}]` (`span` = degrees of longitude across the frame); `fills`: `[{countries:[...], color, at, until, opacity, fade}]` or `{coords:[[lon,lat],...]}`; `ocean`, `land` |
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
| `char` | `x, y, scale, face: "left"/"right"`, `outfit`: suit, military, navy, soldier, civil or robe; `color, tie, skin, hair`: short, side, slick, white, sides or bald; `hairColor, mustache`: toothbrush, walrus or thin; `beard, glasses, medals, hat`: cap, navy, helmet, fedora, ushanka, kepi or crown; `hatColor`, `hold`: paper, newspaper, bomb, gold, money, pistol, pointer or `flag:<name>`; `pose`/`poses: [{at, pose}]` (down, point, up, cheer, surrender, shrug, hips, wave, hold, fist, think, facepalm); `mood`/`moods` (neutral, happy, smug, angry, furious, worried, sad, scared, shocked, dead); `say: [{text, at, until}]`; `enter`/`exit`: pop, left, right, up, drop, fade or none; `moves: [{at, x, y, dur}]`; `faceImage` (cut-out portrait PNG instead of the drawn face) |
| `marker` | `pos, label, color` |
| `label` | `pos, text, size, color` |
| `arrow` | `from, to, color, width, bend, dur` |
| `pulse` | `pos, r, color` |
| `token` | `pos, flag`, optional `to, moveAt, moveDur` (moves like a game piece) |
| `plane` | `from, to, dur, scale` |
| `boom` | `pos` or `x,y`, `size` (also shakes the camera) |
| `check` / `cross` | `pos, scale` |
| `flagpole` | `pos, flag` |
| `text` | `text`, `style`: big, date, title or stamp; `x, y, size, color` |
| `image` | `src, x, y, w, rotate, grayscale` (for archive photos) |

Flags: usa, japan, risingsun, ussr, uk, france, italy, germany, wehrmacht, china, prc, poland, spain, finland, sweden, norway, greece, yugoslavia, belgium, netherlands, australia, white.

Every item takes `at` / `until`, and `sfx: false` or `sfx: "boom"` to change its sound.

### Camera

`"camera": [{ "at": 0, "zoom": 1 }, { "at": "Kyoto", "zoom": 1.4, "x": 0.3, "y": 0.6, "dur": 0.5 }]` zooms toward the point (x, y). Add `"flash": "bomb"` on a scene for a white flash.

## Layout

```
src/        cli, voice (TTS + word timing), timeline (cues), audio (sfx + mix), render (Playwright -> ffmpeg)
runtime/    browser engine that draws one frame for a time t
projects/   one folder per video: project.json, assets/, out/ (renders), .cache/ (TTS, ignored by git)
```
