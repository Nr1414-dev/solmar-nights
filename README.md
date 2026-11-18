# solmar-nights

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Nr1414-dev/solmar-nights/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Nr1414-dev/solmar-nights/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR NIGHTS is an open-world crime game that runs in a desktop browser: drive and steal cars across the sun-soaked coastal city of Solmar, outrun the police and their helicopter through a six-star wanted system, run eight story missions for fixer Mara Solis, take taxi fares, find 12 hidden packages, and buy your way out of trouble at the gun store, the spray shop and the diner. 2D top-down, keyboard + mouse, vanilla JavaScript with no libraries and no network — the whole city, traffic, pedestrians, police AI, day/night cycle and soundtrack are generated in code.

v2.3 is a full rebuild of the game: a six-star wanted system with four star states (hollow — reported but not yet identified, solid white — seen and chased, flashing white — line of sight broken, police searching your last known position, red — escaped but the area stays hot and the police remember your description) plus five independent evidence icons (CCTV, outfit, face, vehicle, weapon), each cleared its own way — change clothes, respray the car, ditch the weapon, leave the hot area, wait out the CCTV tape. Crimes only count when witnessed: pedestrians flee gunfire and call the police a few seconds later. A new eighth story job, Paying the Debt, closes the arc at Marina Pier; Salt Kings Enforcers lead every third hit squad; rain slicks the roads and fog cuts visibility and gang accuracy; the helicopter joins at five stars and can be shaken off-road under cover.

## Run it

```sh
node serve.ts
# open http://localhost:8080 in a desktop browser
```

Controls: WASD move, mouse aim, click attack, E enter/steal car, F interact, Q switch weapon, N minimap size, P pause, O settings.

---

Entered on [make.fun](https://make.fun/?ref=mzt460aw&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards
