# Apex fidelity pass — art specs for Desk Lead / Pixel Build sync

**Status:** on-box only (no cloud agent; Cursor Pro gated).  
**Do not** commit these into `main` blindly — sync via Desk Lead.  
**North star still:** `apex-capital-office.png` (same bytes as v1 `app/static/ref/apex-capital-office.png`).

## Intent
Push the playable floor toward the Apex Capital still’s *lived-in office* density while keeping Chart Desk / Tape Wire / Risk Pit logic honest.

## Gap vs current v1 plate (as of inventory)
| Still element | v1 today | Spec for next art pass |
|---------------|----------|------------------------|
| Full-height multi-pane windows + sunset | Panoramic skyline exists | Keep; boost Empire crown glow at dusk; richer orange→purple sky dither |
| Apex wall sign + tagline | Missing / weak | Add left-wall backlit sign: `APEX CAPITAL` / `DISCIPLINE · RESEARCH · RETURNS` (in-world brand OK; product name can stay Pixel Hedge Fund in HUD) |
| Index board (SPX/NDX/DJI/RUT/10Y/GOLD/OIL) | Thin tape only | Wall hardware board; values from real quotes or `sample: true` — **never invent** |
| Whiteboard checklist | Basic SOL·MTF board | Checklist style like still (“TODAY:” earnings / rebalance / Fed / VaR) + optional live bias chip; **no fake price levels** |
| CRT stacks **per desk** | Shared mid-right CRT prop | Per-trader CRT (beige/grey) with green line chart glow; 2–3 bezel stacks on high-lev desks |
| Foreground desk clutter | Light | WSJ/newspaper, yellow legal pad (Positions list = symbols only, not PnL), finance book spines, desk phone, coffee |
| Bull statue | Missing | Filing-cabinet bull (gold) near long bank / CIO path |
| Lounge sofa + Fortune mag | Lounge sofa + plant | Add coffee table + magazine prop; keep idle-only |
| Plants (monstera/fern) | One plant | 3–5 pots: window sill, lounge, between banks |
| Motivational poster | Missing | Right wall framed: `BIGGER IDEAS · BIGGER RETURNS` |
| Lighting | Lamp boost exists | Stronger warm pools on desks vs cool floor; CRT phosphor bleed at night |
| Pixel fidelity | CSS blocks | Prefer dithered/sprite sheets over flat div chrome; avoid “dashboard UI” look |

## Priority order (ship slices)
1. **P0 — Window drama:** sunset gradient + Empire crown + mullions + rain-on-glass only (already partly there — polish).
2. **P0 — Wall hardware:** Apex sign + index board shell (sample-labeled until Tape Wire fills).
3. **P1 — Desk density:** per-desk CRT + legal pad + coffee on `open` desks; sticky optional.
4. **P1 — Whiteboard → checklist** layout matching still (bias chip from Chart Desk).
5. **P2 — Lounge / bull / poster / extra plants.**
6. **P2 — Sprite upgrade** toward hi-fi dither (characters last; props first).

## Layout lock (keep)
- Long bank left / Short bank right (unchanged).
- Prop band under sill; never cover nameplates, thought clouds, hover cards.
- `pointer-events: none` on decorative props.
- Celebrate/stress only when posture `open` (Chart Desk / Risk Pit).

## Branding note
Still says **Apex Capital**. Product HUD can remain **Pixel Hedge Fund**. Treat Apex as in-world firm on the wall sign so the still’s mood stays without renaming the product.

## Honest data
- Index board + tape: Tape Wire only, or clearly `sample`.
- Whiteboard: process checklist + live bias/confluence chips — not fabricated levels.
- Legal pad “Positions”: trader symbols / side tags already on cast — not invented fills.

## Files Desk Lead should sync
```
/workspace/pixel-hf-beta/apex-capital-office.png
/workspace/pixel-hf-beta/APEX_NORTH_STAR.md
/workspace/pixel-hf-beta/APEX_FIDELITY_PASS.md
/workspace/pixel-hedge-fund/refs/apex-capital-office.png
/workspace/pixel-hedge-fund/refs/APEX_NORTH_STAR.md
```
Also mirror this pass into repo `refs/` on a **pixel-hf-beta branch** when Pro/cloud is available — not straight to main.

## Out of scope this pass
New market venues, paper book UI, free camera, voice lines, rewriting TA stack.
