# Skyline weather & birds

## Holiday snow window
- Real calendar **Dec 1 – Jan 5** (local TZ) → `holidayWindow: true` on `SimClockState`.
- Outside that window: **snow is off**; rain cycle unchanged; birds still run year-round.

## Weather roll
- Same 135 sim-minute cycle as before: 90 clear, then ~45 precip with 8-min ramp in/out.
- In holiday window, each precip bout is deterministic via `cycleIndex % 3`:
  - `!== 0` → **snow** (~2/3 of bouts)
  - `=== 0` → **rain** (~1/3)
- Rain and snow are mutually exclusive. HUD: `· RAIN` or `· XMAS · SNOW`.

## Birds (Skyline)
| Phase   | Behavior |
|---------|----------|
| dawn / day / golden | Sparse silhouettes + V-formations fly across panes |
| dusk    | Roosted pixels on ESB antenna / ledges |
| night   | Hidden |
| Kong active | Hidden / scattered (layer off) |

Respects `prefers-reduced-motion` and desk `reduceMotion` (static birds).

## Festive accents (while snowing)
- Brighter warm window lights, soft rooftop/ground snow tint, tiny string lights + wreath on far buildings.


## Force Christmas snow
Desk **SET → Force Christmas snow** sets continuous snow + holiday accents regardless of calendar (for streams).
