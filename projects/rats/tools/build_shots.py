#!/usr/bin/env python3
"""Writes the rats shot list into projects/rats/project.json (voice fields are kept).
Run: python3 projects/rats/tools/build_shots.py"""
import json, os
P = os.path.join(os.path.dirname(__file__), '..', 'project.json')
proj = json.load(open(P))
proj['cast'] = {
  'officer': {'type': 'char', 'outfit': 'suit', 'color': '#2f3b52', 'hair': 'short', 'hairColor': '#5d4037', 'mustache': 'thin'},
  'officer2': {'type': 'char', 'outfit': 'suit', 'color': '#5a4f44', 'hair': 'side', 'hairColor': '#3e2f22', 'glasses': True},
  'student': {'type': 'char', 'outfit': 'civil', 'color': '#f4f4f0', 'hair': 'short', 'hairColor': '#5d4037', 'mustache': 'thin', 'glasses': True},
  'stoker': {'type': 'char', 'outfit': 'civil', 'color': '#4a4f57', 'hat': 'cap', 'hatColor': '#333', 'hair': 'short', 'mustache': 'walrus', 'hairColor': '#3e2f22'},
  'german': {'type': 'char', 'outfit': 'military', 'color': '#6b6f5a', 'hat': 'cap', 'hatColor': '#4a4d40', 'hair': 'short', 'hairColor': '#c9a36b', 'mustache': 'thin'},
  'cadet': {'type': 'char', 'outfit': 'military', 'color': '#6b6f5a', 'hat': 'cap', 'hatColor': '#4a4d40', 'hair': 'short', 'hairColor': '#8a6a3a'},
}
UKROOM = {'type': 'room', 'wall': '#d9cfb8', 'floor': '#6b4a32', 'props': [{'type': 'flag', 'flag': 'uk', 'x': 0.82}, 'window']}
SKITROOM = {'type': 'room', 'wall': '#d8cdb4', 'floor': '#4e3626', 'props': [{'type': 'lamp', 'x': 0.5}]}
Y = lambda text, **k: dict({'type': 'text', 'text': text, 'y': 0.14, 'size': 120, 'color': '#ffe11a', 'font': 'Bangers'}, **k)
bubble = lambda text, **k: dict({'text': text, 'at': 0, 'until': 'end', 'dx': 230, 'dy': -60, 'size': 66}, **k)
GER = [10.5, 51.2]
FACT = [[7.0, 51.45], [11.6, 48.1], [13.4, 52.5], [9.99, 53.55], [8.5, 49.5], [12.4, 51.3]]
shots = [None] * 8
shots[0] = [
  {'bg': {'type': 'spotlight'}, 'camera': [{'at': 0, 'zoom': 1.2, 'y': 0.6}, {'at': 0, 'zoom': 1.0, 'dur': 1.6}], 'items': [
    {'type': 'crate', 'x': 0.5, 'y': 0.76, 'label': 'TOP SECRET', 'openAt': 'never', 'rats': 3, 'at': 0, 'scale': 1.1},
    Y('SECRET WEAPON', at='secret', y=0.15, size=130)]},
  {'at': 'It', 'bg': {'type': 'spotlight', 'floor': 0.7}, 'items': [
    {'type': 'rat', 'x': 0.5, 'y': 0.66, 'scale': 2.3, 'dead': True, 'at': 0},
    Y('A DEAD RAT', at='dead', y=0.2, size=150),
    {'type': 'text', 'style': 'stamp', 'text': 'TOP SECRET', 'at': 'rat+0.2', 'y': 0.33, 'size': 80, 'sfx': 'tick'}]},
]
shots[1] = [
  {'bg': UKROOM, 'items': [
    {'type': 'text', 'style': 'date', 'text': '1941', 'at': 0.05},
    {'cast': 'officer', 'x': 0.4, 'y': 0.82, 'face': 'right', 'at': -1, 'mood': 'worried', 'poses': [{'at': 0, 'pose': 'think'}], 'emotes': [{'at': 'problem', 'kind': '?'}]},
    Y('SECRET SABOTAGE SERVICE', at='secret', y=0.3, size=96)]},
  {'at': 'How', 'bg': {'type': 'map', 'view': [{'at': 0, 'lon': 10.5, 'lat': 51.0, 'span': 14}], 'fills': [{'countries': ['Germany', 'Austria'], 'color': '#8f8f7a', 'at': -5, 'fade': 0}]}, 'items': [
    *[{'type': 'icon', 'kind': 'factory', 'pos': p, 'scale': 1.3, 'at': -1 if k < 2 else 'factory+' + str(round(k * 0.12, 2))} for k, p in enumerate(FACT)],
    {'type': 'icon', 'kind': 'question', 'pos': GER, 'scale': 1.8, 'at': 'caught'},
    Y('HOW?', at=0.1, y=0.12, size=150)]},
  {'at': 'answer', 'bg': {'type': 'boiler', 'coalX': 0.92}, 'items': [
    {'cast': 'stoker', 'x': 0.66, 'y': 0.86, 'face': 'left', 'at': -1, 'mood': 'neutral', 'pose': 'hold', 'hold': 'shovel:coal'},
    Y('BOILER ROOM', at='boiler', y=0.08, size=120),
    Y('COAL', at='coal', y=0.66, x=0.86, size=120)]},
  {'at': 'someone', 'bg': {'type': 'boiler', 'coalX': 0.92}, 'camera': [{'at': 0, 'zoom': 1.15, 'x': 0.5, 'y': 0.6}, {'at': 0, 'zoom': 1.45, 'x': 0.5, 'y': 0.6, 'dur': 3}], 'items': [
    {'cast': 'stoker', 'x': 0.66, 'y': 0.86, 'face': 'left', 'at': -1, 'mood': 'neutral', 'pose': 'hold', 'hold': 'shovel:coal', 'jumps': ['fire', 'all']},
    Y('ALL DAY', at='all', y=0.2, size=130)]},
]
shots[2] = [{'bg': SKITROOM, 'items': [
  {'cast': 'officer', 'x': 0.25, 'y': 0.84, 'face': 'right', 'at': -1, 'mood': 'smug', 'pose': 'point', 'say': [bubble("What if there's a dead rat in the coal?", dx=200, dy=-80)]},
  {'cast': 'officer2', 'x': 0.76, 'y': 0.84, 'face': 'left', 'at': -1, 'mood': 'shocked'},
  {'type': 'thought', 'x': 0.5, 'y': 0.22, 'kind': 'rat', 'at': 'rat', 'tail': {'x': 0.3, 'y': 0.45}}]}]
shots[3] = [{'bg': SKITROOM, 'items': [
  {'cast': 'officer', 'x': 0.25, 'y': 0.84, 'face': 'right', 'at': -1, 'mood': 'smug'},
  {'cast': 'officer2', 'x': 0.76, 'y': 0.84, 'face': 'left', 'at': -1, 'mood': 'happy', 'pose': 'hold', 'hold': 'shovel', 'jumps': [0.2], 'say': [bubble('The stoker throws it in the fire...', dx=-210, dy=-80)]},
  {'type': 'thought', 'x': 0.5, 'y': 0.22, 'kind': 'rat', 'at': -1, 'tail': {'x': 0.3, 'y': 0.45}}]}]
shots[4] = [{'bg': SKITROOM, 'items': [
  {'cast': 'officer', 'x': 0.25, 'y': 0.84, 'face': 'right', 'at': -1, 'mood': 'happy', 'pose': 'cheer', 'jumps': [0.05], 'say': [bubble('...and boom!', dx=200, dy=-80, size=80)]},
  {'cast': 'officer2', 'x': 0.76, 'y': 0.84, 'face': 'left', 'at': -1, 'mood': 'happy', 'pose': 'cheer'},
  {'type': 'thought', 'x': 0.5, 'y': 0.22, 'kind': 'boom', 'at': 0, 'tail': {'x': 0.3, 'y': 0.45}}]}]
shots[5] = [
  {'bg': {'type': 'shop', 'sign': 'LAB SUPPLIES'}, 'items': [
    {'cast': 'student', 'x': 0.28, 'y': 0.92, 'face': 'right', 'at': -1, 'mood': 'smug', 'emotes': [{'at': 'student', 'kind': 'sweat'}]},
    {'type': 'crate', 'x': 0.66, 'y': 0.72, 'scale': 0.85, 'label': 'FOR EXPERIMENTS', 'labelSize': 34, 'openAt': 'hundred', 'dead': False, 'rats': 3, 'at': -1},
    Y('"STUDENT"', at='student', y=0.3, size=110),
    Y('100 RATS', at='hundred', y=0.38, size=120, color='#ffffff')]},
  {'at': 'They', 'bg': {'type': 'plain', 'color': '#e9e4d8'}, 'items': [
    {'type': 'rat', 'x': 0.5, 'y': 0.55, 'scale': 2.2, 'dead': True, 'explosive': True, 'fuse': True, 'at': 0},
    Y('PLASTIC EXPLOSIVE', at='plastic', y=0.25, size=110, color='#e53935')]},
  {'at': 'ready', 'bg': {'type': 'boiler', 'coal': False}, 'items': [
    {'type': 'coal', 'x': 0.5, 'y': 0.9, 'scale': 1.6, 'at': -1},
    *[{'type': 'rat', 'x': x, 'y': y, 'scale': 0.7, 'dead': True, 'at': 'coal+' + str(d), 'rotate': r} for x, y, d, r in [(0.38, 0.78, 0, -8), (0.62, 0.8, 0.15, 6), (0.5, 0.71, 0.3, 0)]],
    Y('GERMAN COAL', at='German', y=0.14, size=120)]},
]
shots[6] = [
  {'bg': {'type': 'field', 'palette': 'mud'}, 'items': [
    {'type': 'crate', 'x': 0.62, 'y': 0.8, 'scale': 0.9, 'label': 'COAL', 'openAt': 'caught', 'rats': 3, 'at': -1},
    {'cast': 'german', 'x': 0.25, 'y': 0.86, 'face': 'right', 'at': -1, 'moods': [{'at': 0, 'mood': 'neutral'}, {'at': 'caught', 'mood': 'shocked'}], 'pose': 'point', 'emotes': [{'at': 'caught+0.2', 'kind': '!!'}]},
    {'type': 'text', 'style': 'stamp', 'text': 'CAPTURED', 'at': 'Germans', 'y': 0.25, 'size': 110}]},
  {'at': 'plan', 'bg': {'type': 'spotlight', 'floor': 0.7}, 'items': [
    {'type': 'rat', 'x': 0.5, 'y': 0.665, 'scale': 2.0, 'dead': True, 'at': -1},
    Y('PLAN: DEAD', at=0.05, y=0.2, size=140, until='Or'),
    Y('...OR WAS IT?', at='Or', y=0.2, size=130)]},
  {'at': 'rattled-0.6', 'bg': {'type': 'classroom'}, 'items': [
    {'cast': 'german', 'x': 0.17, 'y': 0.8, 'face': 'right', 'at': -1, 'mood': 'angry', 'pose': 'point'},
    {'type': 'desk', 'x': 0.6, 'y': 0.7},
    {'type': 'rat', 'x': 0.6, 'y': 0.66, 'scale': 1.1, 'dead': True, 'explosive': True, 'at': 'showed'},
    {'cast': 'cadet', 'x': 0.4, 'y': 0.93, 'scale': 0.85, 'at': -1, 'mood': 'shocked', 'emotes': [{'at': 'rattled', 'kind': '!!'}]},
    {'cast': 'cadet', 'x': 0.78, 'y': 0.93, 'scale': 0.85, 'at': -1, 'mood': 'scared'},
    Y('TOP MILITARY SCHOOLS', at='military', y=0.06, size=90)]},
  {'at': 'went', 'bg': {'type': 'boiler', 'doorOpen': False, 'dark': True, 'coal': False}, 'items': [
    {'cast': 'german', 'x': 0.3, 'y': 0.86, 'face': 'right', 'at': -1, 'mood': 'worried', 'pose': 'hold', 'hold': 'torch'},
    {'type': 'coal', 'x': 0.74, 'y': 0.88, 'at': -1},
    Y('SEARCHING...', at='searching', y=0.14, size=120)]},
]
shots[7] = [
  {'bg': UKROOM, 'items': [
    {'cast': 'officer', 'x': 0.3, 'y': 0.84, 'face': 'right', 'at': -1, 'mood': 'smug', 'pose': 'hold', 'hold': 'paper'},
    {'cast': 'officer2', 'x': 0.72, 'y': 0.84, 'face': 'left', 'at': -1, 'moods': [{'at': 0, 'mood': 'neutral'}, {'at': 'success', 'mood': 'happy'}], 'poses': [{'at': 'success', 'pose': 'cheer'}]},
    {'type': 'typed', 'text': 'SOE REPORT: RATS', 'x': 0.5, 'y': 0.32, 'at': 'verdict', 'dur': 0.8, 'size': 60},
    {'type': 'check', 'x': 0.5, 'y': 0.44, 'scale': 1.8, 'at': 'success'},
    Y('BIGGER SUCCESS', at='bigger', y=0.1, size=120)]},
  {'at': 'never', 'bg': {'type': 'boiler', 'doorOpen': False, 'coal': False}, 'camera': [{'at': 0, 'zoom': 1.0}, {'at': 0, 'zoom': 1.12, 'y': 0.6, 'dur': 6}], 'items': [
    {'type': 'coal', 'x': 0.5, 'y': 0.86, 'scale': 1.5, 'at': -1},
    {'type': 'rat', 'x': 0.52, 'y': 0.745, 'scale': 1.4, 'dead': True, 'at': -1},
    Y('JUST THE IDEA', at='idea', y=0.2, size=120, color='#ffffff')]},
]
for sc, sh in zip(proj['scenes'], shots):
  sc['shots'] = sh
json.dump(proj, open(P, 'w'), indent=1)
print('ok', sum(len(s) for s in shots), 'shots')
