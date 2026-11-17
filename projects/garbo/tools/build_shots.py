#!/usr/bin/env python3
"""Writes the shot list into projects/garbo/project.json (voice fields are kept as they are).
Run: python3 projects/garbo/tools/build_shots.py"""
import json, os
P = os.path.join(os.path.dirname(__file__), '..', 'project.json')
proj = json.load(open(P))

proj['cast'] = {
  'garbo': {'type': 'char', 'outfit': 'suit', 'color': '#3a3a44', 'hair': 'slick', 'hairColor': '#222', 'mustache': 'thin'},
  'oldgarbo': {'type': 'char', 'outfit': 'suit', 'color': '#3a3a44', 'hair': 'white', 'hairColor': '#eee', 'mustache': 'thin'},
  'handler': {'type': 'char', 'outfit': 'suit', 'color': '#5a4f44', 'hair': 'short', 'hairColor': '#5d4037', 'glasses': True},
  'german': {'type': 'char', 'outfit': 'military', 'color': '#6b6f5a', 'hat': 'cap', 'hatColor': '#4a4d40', 'hair': 'short', 'hairColor': '#c9a36b', 'mustache': 'thin'},
  'hitler': {'type': 'char', 'outfit': 'military', 'color': '#7a7a63', 'hair': 'side', 'mustache': 'toothbrush'},
  'soldier': {'type': 'char', 'outfit': 'soldier', 'color': '#6b6f5a', 'hat': 'helmet', 'hatColor': '#55594a'},
  'historian': {'type': 'char', 'outfit': 'civil', 'color': '#6a5a48', 'hair': 'sides', 'hairColor': '#888', 'glasses': True},
}
UKMAP = {'type': 'map', 'view': [{'at': 0, 'lon': -3, 'lat': 54.6, 'span': 15}, {'at': 0, 'lon': -3, 'lat': 54.6, 'span': 12.5, 'dur': 2.5}],
         'fills': [{'countries': ['UK'], 'color': '#c9b98f', 'at': -5, 'fade': 0}]}
TOWNS = [[-2.98,53.41],[-4.25,55.86],[-3.19,55.95],[-1.9,52.48],[-2.24,53.48],[-1.55,53.8],[-1.08,53.96],[-2.59,51.45],[-3.18,51.48],[-1.61,54.97],[-2.1,57.15],[-4.14,50.37],[-1.4,50.9],[1.3,52.63],[1.08,51.28],[-1.26,51.75],[0.12,52.2],[-3.97,51.62],[-1.47,53.38],[-1.15,52.95],[-0.34,53.74],[-3.0,56.46],[-4.22,57.48],[-5.93,54.6],[-1.08,50.8],[-2.36,51.38],[0.5,51.38]]
assert len(TOWNS) == 27
LONDON, LISBON, BERLIN, CALAIS, NORMANDY = [-0.13, 51.5], [-9.14, 38.72], [13.4, 52.5], [1.86, 50.95], [-0.6, 49.35]
SKITROOM = {'type': 'room', 'wall': '#d9cfb8', 'floor': '#6b4a32', 'props': [{'type': 'lamp', 'x': 0.5}]}
UKROOM = {'type': 'room', 'wall': '#d9cfb8', 'floor': '#6b4a32', 'props': [{'type': 'flag', 'flag': 'uk', 'x': 0.82}, 'window']}
DEROOM = {'type': 'room', 'wall': '#c9c2ae', 'floor': '#4e3626', 'props': [{'type': 'flag', 'flag': 'wehrmacht', 'x': 0.8}, {'type': 'lamp', 'x': 0.25}]}
bubble = lambda text, **k: dict({'text': text, 'at': 0, 'until': 'end', 'dx': 230, 'dy': -60, 'size': 70}, **k)

shots = [None] * 10
# 1. hook: 27 agents, none real
shots[0] = [
  {'bg': UKMAP, 'items': [
    {'type': 'text', 'style': 'date', 'text': '1944', 'at': 0.1},
    {'cast': 'garbo', 'pos': [-1.3, 52.4], 'scale': 0.5, 'face': 'right', 'at': 0, 'enter': 'drop', 'mood': 'smug', 'pose': 'hips'},
    {'type': 'web', 'hub': LONDON, 'points': TOWNS, 'at': 'twenty', 'every': 0.045, 'dur': 0.2},
    {'type': 'text', 'text': "HITLER'S TOP SPY", 'at': 'Hitler', 'until': 'twenty', 'y': 0.13, 'size': 110, 'color': '#ffe11a', 'font': 'Bangers'},
    {'type': 'text', 'text': '27 AGENTS', 'at': 'agents', 'y': 0.12, 'size': 130, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'Not', 'bg': {'type': 'map', 'view': [{'at': 0, 'lon': -2.6, 'lat': 53.6, 'span': 11}], 'fills': UKMAP['fills']}, 'items': [
    {'type': 'web', 'hub': LONDON, 'points': TOWNS, 'at': -5, 'every': 0, 'ghostAt': 0.15, 'ghostDur': 1.4},
    {'cast': 'garbo', 'pos': [-1.3, 52.4], 'scale': 0.6, 'face': 'right', 'at': -1, 'mood': 'happy', 'poses': [{'at': 0, 'pose': 'shrug'}]},
    {'type': 'text', 'style': 'stamp', 'text': 'NOT REAL', 'at': 'real', 'y': 0.16, 'size': 110}]},
]
# 2. chicken farmer, rejected by Britain, signs up with Germany
shots[1] = [
  {'bg': {'type': 'field', 'palette': 'grass'}, 'items': [
    {'type': 'flagpole', 'x': 0.86, 'y': 0.62, 'flag': 'spain', 'at': -1},
    {'type': 'chicken', 'x': 0.18, 'y': 0.86, 'scale': 1.5, 'at': -1},
    {'type': 'chicken', 'x': 0.8, 'y': 0.9, 'scale': 1.4, 'face': 'left', 'seed': 2, 'at': -1},
    {'type': 'chicken', 'x': 0.62, 'y': 0.97, 'scale': 1.1, 'seed': 4, 'at': 'chicken'},
    {'cast': 'garbo', 'x': 0.45, 'y': 0.8, 'scale': 1.1, 'at': -1, 'moods': [{'at': 0, 'mood': 'happy'}, {'at': 'hated', 'mood': 'furious'}], 'poses': [{'at': 0, 'pose': 'wave'}, {'at': 'hated', 'pose': 'fist'}], 'emotes': [{'at': 'hated', 'kind': 'anger'}]},
    {'type': 'text', 'text': 'JUAN PUJOL', 'at': 0.1, 'until': 'hated', 'y': 0.16, 'size': 120, 'color': '#ffe11a', 'font': 'Bangers'},
    {'type': 'icon', 'kind': 'flag', 'label': 'wehrmacht', 'x': 0.72, 'y': 0.3, 'scale': 3.2, 'at': 'Nazis-0.15'},
    {'type': 'cross', 'x': 0.72, 'y': 0.3, 'scale': 2.6, 'at': 'Nazis+0.2'}]},
  {'at': 'offered', 'bg': {'type': 'embassy'}, 'items': [
    {'type': 'door', 'x': 0.5, 'y': 0.7, 'openAt': 'said-0.5', 'closeAt': 'no+0.35'},
    {'cast': 'handler', 'x': 0.5, 'y': 0.69, 'scale': 0.85, 'at': 'said-0.4', 'until': 'no+0.35', 'enter': 'none', 'mood': 'smug', 'pose': 'hips'},
    {'cast': 'garbo', 'x': 0.2, 'y': 0.86, 'face': 'right', 'at': -1, 'pose': 'hold', 'hold': 'paper', 'moods': [{'at': 0, 'mood': 'happy'}, {'at': 'no', 'mood': 'sad'}], 'say': [bubble('Hire me!', until='said', dx=200, dy=-40)]},
    {'type': 'text', 'style': 'stamp', 'text': 'REJECTED', 'at': 'no+0.45', 'y': 0.3, 'size': 110}]},
  {'at': 'So', 'bg': {'type': 'spotlight'}, 'items': [
    {'cast': 'garbo', 'x': 0.5, 'y': 0.8, 'scale': 1.2, 'at': -1, 'mood': 'smug', 'poses': [{'at': 0, 'pose': 'think'}], 'emotes': [{'at': 'better', 'kind': 'idea'}]}]},
  {'at': 'Spy#2', 'bg': DEROOM, 'items': [
    {'cast': 'german', 'x': 0.72, 'y': 0.8, 'face': 'left', 'at': -1, 'mood': 'happy', 'pose': 'point'},
    {'cast': 'garbo', 'x': 0.3, 'y': 0.8, 'face': 'right', 'at': -1, 'mood': 'smug', 'pose': 'hold', 'hold': 'paper'},
    {'type': 'text', 'text': 'GERMAN SPY', 'at': 0.1, 'y': 0.14, 'size': 120, 'color': '#ffe11a', 'font': 'Bangers'},
    {'type': 'doc', 'kind': 'lies', 'x': 0.5, 'y': 0.38, 'rotate': -6, 'scale': 0.8, 'at': 'lies-0.1'}]},
]
# 3. Lisbon, fake sources, phantom convoy, Britain calls
shots[2] = [
  {'bg': {'type': 'map', 'view': [{'at': 0, 'lon': -3, 'lat': 48, 'span': 26}], 'fills': [{'countries': ['UK'], 'color': '#c9b98f', 'at': -5, 'fade': 0}, {'countries': ['Portugal'], 'color': '#9fc7a6', 'at': -5, 'fade': 0}]}, 'items': [
    {'type': 'marker', 'pos': LONDON, 'label': 'LONDON?', 'at': 0},
    {'type': 'cross', 'pos': LONDON, 'scale': 1.2, 'at': 'even'},
    {'type': 'arrow', 'from': LONDON, 'to': LISBON, 'at': 'even+0.15', 'color': '#ffe11a', 'width': 16},
    {'type': 'marker', 'pos': LISBON, 'label': 'LISBON', 'at': 'even+0.5', 'color': '#2e7d32'}]},
  {'at': 'From', 'bg': {'type': 'lisbon'}, 'items': [
    {'cast': 'garbo', 'x': 0.28, 'y': 0.88, 'face': 'right', 'at': -1, 'mood': 'smug'},
    {'type': 'cafetable', 'x': 0.62, 'y': 0.82},
    {'type': 'typewriter', 'x': 0.62, 'y': 0.78, 'scale': 0.75, 'text': 'TOP SECRET\nLONDON TODAY:\nI SAW...', 'typeAt': 'faked', 'dur': 2.2, 'at': -1},
    {'type': 'doc', 'kind': 'guidebook', 'x': 0.2, 'y': 0.33, 'rotate': -8, 'scale': 0.8, 'at': 'guidebook'},
    {'type': 'doc', 'kind': 'timetable', 'x': 0.5, 'y': 0.31, 'rotate': 5, 'scale': 0.8, 'at': 'train'},
    {'type': 'doc', 'kind': 'newsreel', 'x': 0.8, 'y': 0.33, 'rotate': -4, 'scale': 0.75, 'at': 'newsreels'}]},
  {'at': 'His', 'bg': {'type': 'nightsea', 'horizon': 0.42}, 'items': [
    {'type': 'ghostconvoy', 'x': 0.5, 'y': 0.55, 'scale': 0.9, 'label': '???', 'at': 'convoy'},
    {'type': 'warship', 'x': 0.1, 'toX': 0.3, 'y': 0.72, 'scale': 1.0, 'at': 0, 'dur': 4},
    {'type': 'warship', 'x': 1.0, 'toX': 0.78, 'y': 0.84, 'scale': 1.0, 'face': 'left', 'seed': 3, 'at': 0, 'dur': 4},
    {'type': 'text', 'text': 'FAKE CONVOY', 'at': 'made', 'y': 0.2, 'size': 110, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'Suddenly', 'bg': UKROOM, 'items': [
    {'cast': 'handler', 'x': 0.4, 'y': 0.82, 'face': 'right', 'at': -1, 'pose': 'hold', 'hold': 'phone', 'moods': [{'at': 0, 'mood': 'shocked'}, {'at': 'after', 'mood': 'happy'}], 'emotes': [{'at': 0.1, 'kind': '!!'}], 'jumps': [0.15]},
    {'type': 'text', 'text': 'WANTED!', 'at': 'wanted', 'y': 0.18, 'size': 140, 'color': '#ffe11a', 'font': 'Bangers'}]},
]
# 4. MI5, Garbo, the network
shots[3] = [
  {'bg': UKROOM, 'items': [
    {'cast': 'handler', 'x': 0.45, 'y': 0.82, 'at': -1, 'mood': 'smug', 'pose': 'hold', 'hold': 'magnifier', 'face': 'right'},
    {'type': 'text', 'text': 'MI5', 'at': 0, 'y': 0.17, 'size': 210},
    {'type': 'text', 'text': 'SPY-CATCHERS', 'at': 'spy', 'y': 0.27, 'size': 90, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'named', 'bg': {'type': 'spotlight'}, 'items': [
    {'cast': 'garbo', 'x': 0.5, 'y': 0.82, 'scale': 1.15, 'at': -1, 'mood': 'happy', 'poses': [{'at': 0, 'pose': 'wave'}, {'at': 'best', 'pose': 'cheer'}]},
    {'type': 'typed', 'text': 'GARBO', 'x': 0.5, 'y': 0.2, 'at': 'Garbo', 'dur': 0.6, 'size': 90},
    {'type': 'text', 'text': 'BEST ACTOR IN THE WORLD', 'at': 'best', 'y': 0.32, 'size': 76, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'together', 'bg': {'type': 'map', 'style': 'paper', 'view': [{'at': 0, 'lon': -3, 'lat': 54.2, 'span': 12}], 'fills': [{'countries': ['UK'], 'color': '#e9d9b0', 'at': -5, 'fade': 0}]}, 'items': [
    {'type': 'web', 'hub': LONDON, 'points': TOWNS, 'at': 'invented', 'every': 0.03, 'dur': 0.18},
    {'cast': 'garbo', 'pos': [-6.5, 52.0], 'scale': 0.45, 'face': 'right', 'at': -1, 'mood': 'smug', 'pose': 'point'},
    {'cast': 'handler', 'pos': [1.2, 55.2], 'scale': 0.45, 'face': 'left', 'at': -1, 'mood': 'happy', 'pose': 'hold', 'hold': 'paper'}]},
]
# 5-7. skit
shots[4] = [{'bg': SKITROOM, 'items': [
  {'type': 'agentcard', 'x': 0.5, 'y': 0.25, 'scale': 1.25, 'label': 'LIVERPOOL', 'at': -1},
  {'cast': 'garbo', 'x': 0.2, 'y': 0.86, 'face': 'right', 'at': -1, 'mood': 'shocked', 'pose': 'point', 'emotes': [{'at': 0.2, 'kind': 'sweat'}], 'say': [bubble('My man in Liverpool missed the whole fleet!', dx=190, dy=-80, size=62)]},
  {'cast': 'handler', 'x': 0.8, 'y': 0.86, 'face': 'left', 'at': -1, 'mood': 'worried'}]}]
shots[5] = [{'bg': SKITROOM, 'items': [
  {'type': 'agentcard', 'x': 0.5, 'y': 0.25, 'scale': 1.25, 'label': 'LIVERPOOL', 'at': -1, 'sickAt': 0.35},
  {'cast': 'garbo', 'x': 0.2, 'y': 0.86, 'face': 'right', 'at': -1, 'mood': 'worried'},
  {'cast': 'handler', 'x': 0.8, 'y': 0.86, 'face': 'left', 'at': -1, 'mood': 'smug', 'pose': 'point', 'say': [bubble('Then he got sick.', dx=-200, dy=-80, size=66)]}]}]
shots[6] = [{'bg': SKITROOM, 'items': [
  {'type': 'agentcard', 'x': 0.5, 'y': 0.25, 'scale': 1.25, 'label': 'LIVERPOOL', 'at': -1, 'sickAt': -1, 'deadAt': 0.2},
  {'cast': 'garbo', 'x': 0.2, 'y': 0.86, 'face': 'right', 'at': -1, 'mood': 'happy', 'pose': 'cheer', 'jumps': [0.1], 'say': [bubble('And died! Put it in the paper.', dx=190, dy=-80, size=62)]},
  {'cast': 'handler', 'x': 0.8, 'y': 0.86, 'face': 'left', 'at': -1, 'mood': 'happy'},
  {'type': 'doc', 'kind': 'obituary', 'x': 0.5, 'y': 0.66, 'scale': 0.7, 'rotate': 6, 'at': 'paper'}]}]
# 8. salaries, D-Day, the big lie
shots[7] = [
  {'bg': {'type': 'map', 'view': [{'at': 0, 'lon': 5, 'lat': 52.5, 'span': 24}], 'fills': [{'countries': ['UK'], 'color': '#c9b98f', 'at': -5, 'fade': 0}, {'countries': ['Germany'], 'color': '#8f8f7a', 'at': -5, 'fade': 0}]}, 'items': [
    {'type': 'web', 'hub': LONDON, 'points': TOWNS, 'at': -5, 'every': 0, 'strings': False},
    {'type': 'marker', 'pos': BERLIN, 'label': 'BERLIN', 'at': -1, 'color': '#333'},
    {'type': 'flow', 'from': BERLIN, 'to': [-1.6, 53.0], 'icon': 'money', 'at': 0, 'every': 0.25, 'dur': 1.2, 'bend': 0.2},
    {'type': 'text', 'text': 'PAID BY BERLIN', 'at': 0.2, 'y': 0.14, 'size': 110, 'color': '#7cb342', 'font': 'Bangers'}]},
  {'at': 'Three', 'bg': {'type': 'sea', 'horizon': 0.42, 'sea': '#2b6f99'}, 'items': [
    {'type': 'text', 'style': 'date', 'text': '9 June 1944', 'at': 0.05},
    {'type': 'vehicle', 'kind': 'landingcraft', 'from': {'x': 0.25, 'y': 0.68}, 'to': {'x': 0.4, 'y': 0.66}, 'at': -1, 'dur': 2.5, 'scale': 1.1},
    {'type': 'vehicle', 'kind': 'landingcraft', 'from': {'x': 0.75, 'y': 0.8}, 'to': {'x': 0.85, 'y': 0.78}, 'at': -1, 'dur': 2.5, 'scale': 1.3},
    {'type': 'text', 'text': 'D-DAY +3', 'at': 'D', 'y': 0.2, 'size': 130, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'Garbo', 'bg': {'type': 'room', 'wall': '#cfc6b3', 'floor': '#5b4030', 'props': ['window']}, 'items': [
    {'type': 'radio', 'x': 0.64, 'y': 0.74, 'scale': 1.0, 'sendAt': 0.1, 'at': -1},
    {'cast': 'garbo', 'x': 0.27, 'y': 0.84, 'face': 'right', 'at': -1, 'mood': 'smug', 'pose': 'point'}]},
  {'at': 'Normandy', 'bg': {'type': 'map', 'view': [{'at': 0, 'lon': 0.6, 'lat': 50.6, 'span': 7.5}], 'fills': [{'countries': ['UK'], 'color': '#c9b98f', 'at': -5, 'fade': 0}, {'countries': ['France'], 'color': '#8f8f7a', 'at': -5, 'fade': 0}]}, 'items': [
    {'type': 'marker', 'pos': NORMANDY, 'label': 'NORMANDY', 'at': 0, 'dy': 60, 'size': 60, 'r': 20},
    {'type': 'text', 'text': 'A TRICK!', 'at': 'trick', 'x': 0.32, 'y': 0.44, 'size': 100, 'color': '#ffe11a', 'font': 'Bangers'},
    {'type': 'cross', 'pos': NORMANDY, 'scale': 1.3, 'at': 'trick'},
    {'type': 'wararrow', 'from': [1.0, 52.3], 'to': CALAIS, 'at': 'real', 'text': 'REAL?', 'width': 80, 'sfx': 'whoosh'},
    {'type': 'marker', 'pos': CALAIS, 'label': 'CALAIS', 'at': 'Calais', 'color': '#ffd23f', 'dx': 40, 'size': 60, 'r': 20}]},
]
# 9. army waits at Calais, two medals
shots[8] = [
  {'bg': {'type': 'map', 'view': [{'at': 0, 'lon': 1.8, 'lat': 50.6, 'span': 6}], 'fills': [{'countries': ['UK'], 'color': '#c9b98f', 'at': -5, 'fade': 0}, {'countries': ['France'], 'color': '#8f8f7a', 'at': -5, 'fade': 0}]}, 'items': [
    *[{'type': 'token', 'flag': 'wehrmacht', 'pos': p, 'at': 0.1 + k * 0.12, 'r': 52} for k, p in enumerate([[2.2, 50.6], [2.7, 50.8], [2.4, 50.25], [3.0, 50.45], [1.9, 50.2], [2.9, 50.1]])],
    {'type': 'marker', 'pos': CALAIS, 'label': 'CALAIS', 'at': -1, 'color': '#ffd23f', 'size': 60, 'r': 20, 'dy': -60},
    {'type': 'icon', 'kind': 'calendar', 'label': 'JUN', 'x': 0.78, 'y': 0.26, 'scale': 2.6, 'at': 'weeks', 'until': 'weeks+0.7', 'bob': False},
    {'type': 'icon', 'kind': 'calendar', 'label': 'JUL', 'x': 0.78, 'y': 0.26, 'scale': 2.6, 'at': 'weeks+0.7', 'until': 'weeks+1.4', 'bob': False},
    {'type': 'icon', 'kind': 'calendar', 'label': 'AUG', 'x': 0.78, 'y': 0.26, 'scale': 2.6, 'at': 'weeks+1.4', 'bob': False},
    {'type': 'text', 'text': 'WAITING...', 'at': 'army', 'y': 0.12, 'size': 110, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'waiting', 'bg': {'type': 'beach', 'horizon': 0.48}, 'items': [
    {'cast': 'soldier', 'x': 0.3, 'y': 0.86, 'face': 'right', 'at': -1, 'mood': 'worried', 'pose': 'hold', 'hold': 'rifle', 'emotes': [{'at': 0.3, 'kind': '...'}]},
    {'cast': 'soldier', 'x': 0.62, 'y': 0.9, 'face': 'right', 'scale': 1.05, 'at': -1, 'mood': 'sad', 'emotes': [{'at': 'never', 'kind': '?'}]}]},
  {'at': 'Hitler', 'bg': DEROOM, 'items': [
    {'cast': 'hitler', 'x': 0.72, 'y': 0.82, 'face': 'left', 'at': -1, 'mood': 'happy', 'pose': 'point'},
    {'cast': 'garbo', 'x': 0.3, 'y': 0.82, 'face': 'right', 'at': -1, 'mood': 'smug'},
    {'type': 'medal', 'kind': 'ironcross', 'x': 0.5, 'y': 0.3, 'scale': 1.3, 'at': 'Iron'},
    {'type': 'text', 'text': 'IRON CROSS', 'at': 'Iron+0.3', 'y': 0.12, 'size': 110, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'Britain', 'bg': UKROOM, 'items': [
    {'cast': 'handler', 'x': 0.75, 'y': 0.82, 'face': 'left', 'at': -1, 'mood': 'happy', 'pose': 'point'},
    {'cast': 'garbo', 'x': 0.3, 'y': 0.82, 'face': 'right', 'at': -1, 'moods': [{'at': 0, 'mood': 'happy'}, {'at': 'same', 'mood': 'smug'}], 'poses': [{'at': 'same', 'pose': 'cheer'}]},
    {'type': 'medal', 'kind': 'british', 'x': 0.68, 'y': 0.3, 'scale': 1.2, 'at': 'medal'},
    {'type': 'medal', 'kind': 'ironcross', 'x': 0.32, 'y': 0.3, 'scale': 1.1, 'at': 'same', 'seed': 2},
    {'type': 'text', 'text': 'SAME LIES', 'at': 'same', 'y': 0.12, 'size': 120, 'color': '#ffe11a', 'font': 'Bangers'}]},
]
# 10. faked death, found in Venezuela, Normandy
shots[9] = [
  {'bg': {'type': 'map', 'view': [{'at': 0, 'lon': 16, 'lat': -10, 'span': 34}], 'fills': [{'countries': ['Angola'], 'color': '#c9b98f', 'at': -5, 'fade': 0}]}, 'items': [
    {'cast': 'garbo', 'pos': [17.5, -12], 'scale': 0.6, 'at': -1, 'until': 'vanished+0.3', 'exit': 'fade', 'mood': 'smug', 'pose': 'wave'},
    {'type': 'doc', 'kind': 'deceased', 'x': 0.72, 'y': 0.3, 'scale': 0.75, 'rotate': 6, 'at': 'death'}]},
  {'at': 'Forty', 'bg': {'type': 'room', 'wall': '#e3d6bc', 'floor': '#6b4a32', 'props': [{'type': 'desk', 'x': 0.5}, {'type': 'lamp', 'x': 0.2}]}, 'items': [
    {'type': 'text', 'style': 'date', 'text': '1984', 'at': 0.05},
    {'cast': 'historian', 'x': 0.5, 'y': 0.82, 'at': -1, 'pose': 'hold', 'hold': 'phone', 'moods': [{'at': 0, 'mood': 'worried'}, {'at': 'found', 'mood': 'shocked'}], 'emotes': [{'at': 'found', 'kind': '!!'}], 'jumps': ['found']},
    {'type': 'text', 'text': 'HISTORIAN', 'at': 0.1, 'until': 'found', 'y': 0.16, 'size': 100, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'alive', 'bg': {'type': 'map', 'view': [{'at': 0, 'lon': -66, 'lat': 8, 'span': 22}], 'fills': [{'countries': ['Venezuela'], 'color': '#ffd23f', 'at': -5, 'fade': 0}]}, 'items': [
    {'cast': 'oldgarbo', 'pos': [-66.9, 8.0], 'scale': 0.6, 'at': 0, 'enter': 'drop', 'mood': 'happy', 'pose': 'wave'},
    {'type': 'text', 'text': 'ALIVE!', 'at': 0.05, 'y': 0.14, 'size': 140, 'color': '#ffe11a', 'font': 'Bangers'}]},
  {'at': 'That', 'bg': {'type': 'beach'}, 'items': [
    {'cast': 'oldgarbo', 'x': -0.1, 'y': 0.86, 'face': 'right', 'at': -1, 'mood': 'happy', 'moves': [{'at': 0, 'x': 0.25, 'y': 0.86, 'dur': 2.4}]},
    *[{'type': 'char', 'outfit': 'suit', 'color': c, 'hair': h, 'hairColor': '#eee', 'medals': True, 'x': 0.55 + k * 0.16, 'y': 0.85, 'scale': 0.78, 'face': 'left', 'at': 'veterans+' + str(round(k * 0.2, 2)), 'enter': 'right', 'mood': 'happy', 'poses': [{'at': 'thank', 'pose': 'wave' if k % 2 == 0 else 'cheer'}]} for k, (c, h) in enumerate([('#2f3b52', 'white'), ('#4b3b2f', 'bald'), ('#2f4a3b', 'sides')])]]},
]
for sc, sh in zip(proj['scenes'], shots):
  sc['shots'] = sh
json.dump(proj, open(P, 'w'), indent=1)
print('ok', sum(len(s) for s in shots), 'shots')
