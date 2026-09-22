# Pixel Hedge Fund

A SvelteKit **lived-in pixel office** — not a dashboard. Warm 90s hedge-fund floor (Apex Capital / sim vibe), panoramic NYC sunset windows, wooden CRT desks, and Chart Desk TA driving real trader behavior.

Art reference: [`static/ref/apex-capital-office.png`](./static/ref/apex-capital-office.png)

## Run

```bash
cd pixel-hedge-fund   # repo root
npm install
npm run dev -- --port 5173
```

```bash
npm test
npm run check
npm run build
```

Do not expose the dev server to your network (`--host 0.0.0.0`) on a machine that holds `.env.local` or `.secrets/`: the `/api/blofin/*` and `/api/bybit/*` write routes fall back to those keys. Cross-site requests to them are rejected, but they have no login.

## Scene (office-first)

Camera sits **behind a cluttered foreground desk** looking across the floor:

- Panoramic **NYC sunset windows** (Empire State silhouette, mullions, rain on glass; switchable **Miami Vice** neon skyline; rare UFO abduction event)
- Wall **PIXEL HEDGE FUND** sign + values: Discipline / Research / Returns
- **TODAY** whiteboard, **MARKET WIRE** board with **CHANNEL** pair switch + multi-crypto rows
- Lounge sofa + Fortune, plants, brass bull on a filing cabinet
- 10 traders at wooden CRT desks (5 LONG / 5 SHORT, 5×–100×) + CIO, PM, Senior Analyst, Research Analyst, Quant
- Foreground props: books, WSJ, legal pad, beige CRT, keyboard, corded phone, calculator, **PHF-monogram coffee mug** (deep green with a brass PHF plaque, click for the coffee trip), **PAIR** desk pad

HUD lives **in the room** (wall board, LED tape, foreground CRT) — no floating metric cards.

**Desk clipboard** (hover/inspect): pointer-**draggable**, clamped to the floor, slight paper tilt while dragging.

## Active pair switching

Diegetic controls (MARKET WIRE **CHANNEL** select + foreground **PAIR** pad) change the floor’s trading symbol. Selection persists in the URL (`?symbol=ETHUSDT`) and `localStorage`. Quote, signal, candles, and trader positions reload for the chosen pair.

## Cast behavior (Chart Desk)

Positions come from live `/api/market/signal` (Supertrend + EMA21/55 + RSI + MACD + ATR; 15m setup / 4h regime). See `src/lib/ta/signal.ts` and `src/lib/ta/posture.ts`.

| Tape | Desk mandate | Floor read |
|------|--------------|------------|
| Confluence ≥5, or ≥4 with structure / lower leverage | Same side as bias | **OPEN** in the simulated cast book. Each trader locks an entry-specific stop and TP1/TP2 plan using the Supertrend distance, ATR floor, and their leverage profile. |
| RSI exhaustion plus price stretched from the EMA21 (in ATR units) | Opposite side, any leverage | **HEDGE OPEN** (fade). The desk fighting the trend, or either desk on a FLAT tape, runs a half-size mean-reversion leg with an ATR-based stop. Higher leverage needs deeper exhaustion (longs need RSI at or below 40 for 5x/10x, 38 for 25x, 35 for 50x, 32 for 100x; shorts mirror it above 60/62/65/68), and every threshold tightens when setup and regime are both strongly aligned against the fade. |
| Fade forming (about 70% of the way to the trigger) | Opposite side | **Thinking** + a "dip-buy?" / "fade the rip?" cloud |
| Confluence 2–4, not yet a fill | Same side | **Thinking** + thought cloud |
| Bias against desk, or ST flipped | Opposite / invalid | **FLAT / Watching** — no invented fill |

Lower-leverage traders have wider stops; higher-leverage traders use tighter stops and require larger reward multiples. A TP1 fill closes the simulated leg, shows a pixel cash-stack profit animation, and applies a 90-second re-entry cooldown to that trader. Stops and invalidations close simulated legs. A stop-out puts the desk on a 4-minute re-entry cooldown. Fade legs also carry a time stop (12 / 8 / 6 / 4 candles for 5-10x / 25x / 50x / 100x) checked at closed-candle decisions, followed by a one-candle cooldown. The risk desk refuses any new entry that would push one-way net exposure past 50% of combined desk capacity (a fully one-sided default book fits exactly, so it binds once a desk's leverage is raised or the cap is tightened); entries that reduce net exposure are always allowed, existing legs are never force-closed, and a held desk shows a "risk desk: net cap" cloud. The PM's note shows live net/gross exposure and the CIO's note flags held desks. Trend legs exit when Supertrend flips against them; fade legs are not liquidated by a bias flip and instead exit once RSI normalises (55 / 45), or on their stop or TP. These cast positions are visual simulations only and never send an order to Bybit or BloFin.

Hover / focus a trader → desk **clipboard** to view that trader's entry, mark, unrealized PNL, risk stop, and individual targets. Click to **pin** CRT snippet. Esc unpins.

## Bybit mapping (multi-crypto)

| Display | Bybit linear | Notes |
|---------|----------------|-------|
| **BTCUSDT** | **`BTCUSDT`** | `XBTUSDT` is accepted as an alias |
| **ETHUSDT** | **`ETHUSDT`** | |
| **XRPUSDT** | **`XRPUSDT`** | |
| **SOLUSDT** | **`SOLUSDT`** | Default |
| **ADAUSDT** | **`ADAUSDT`** | |
| **DOGEUSDT** | **`DOGEUSDT`** | |
| **LINKUSDT** | **`LINKUSDT`** | |
| **AVAXUSDT** | **`AVAXUSDT`** | |

- `GET /api/market/quote?symbol=SOLUSDT`
- `GET /api/market/candles?symbol=ETHUSDT&tf=15m`
- `GET /api/market/signal?symbol=BTCUSDT`
- `GET /api/market/tape` - all live tape symbols from Bybit and BloFin
- `GET /api/market/health`
- `GET /api/market/leveraged-tokens`, `GET /api/market/leveraged-token-quote`, `GET /api/news`

The full symbol list lives in `SYMBOLS` in `src/lib/data/symbols.ts`; unlisted `*USDT` names resolve as dynamic channels.

Production is always live-only: Bybit is tried first, BloFin is the permitted public-data fallback, and unavailable exchange data returns an empty or `503` response. Local `npm run dev` keeps the labeled SAMPLE fallback for offline work; set `PHF_LIVE_ONLY=true` locally when you want to test the live-only behavior.

### Real WSJ wire headlines

The WSJ desk prop requests real, multi-outlet crypto headlines through Google News RSS at `GET /api/news?symbol=BTCUSDT`. The active symbol's configured news phrase is searched, each story keeps its publisher and link, and successful results are cached for five minutes. The visible `SAMPLE` stories remain the final fallback when the live feed is unavailable.


## Feature pack (office toys)

### 90s fax / printer
Pixel fax by the lounge. **Click** to open **PRINT REPORT** options built from live Chart Desk signal + candles (never invents prices; labels **SAMPLE** when needed):

- Bias & confluence desk brief
- Supertrend / EMA structure sheet
- Risk card (SL, TP1/TP2, ATR vol state)
- Multi-timeframe alignment memo
- Session tape / funding-style summary

After print: on-screen 90s “fax spit”, **Printable HTML**, or **Download .txt**.

### Sticky notes on the window
**+ NOTE** control on the panoramic glass → type, pick a color, **Stick**. Drag notes on the window; **×** deletes. Persists in `localStorage` (`phf-window-stickies`).

### Change trader leverage
Click a trader's leverage badge (for example, `5×`) → enter an integer from `1` to `1000`, then press Enter or blur to commit (Escape cancels). Posture gates and P&L margin % update; overrides persist (`phf-leverage-overrides`).

### Set how long a trader has been in
Each trader's **TIME** field is in **minutes** (900 seconds is `15`). Type the total time and press Enter or click away: the trader gets a position opened that long ago, priced at the tape then (linear inside the 15m candle), so P&L reflects the real move since. It works on a flat trader (it forces a position) and on one already in a trade (it re-times and re-prices it, keeping its strategy and size). A forced position is a long or short by the trader's book and full or half size by the current tape, just as an organic entry would be. History is capped at the loaded candles (about 20 hours). Forced positions skip thesis and time-stop exits, and if the tape already ran through the stop or target, those are re-laid around the current mark so the position is not closed the instant it is created. The counter runs in real minutes and is not persisted across reloads.

### Bull / bear pets
When tape bias is **LONG** and confluence is **tradeable/high** → mini **bull** pet on the floor. **SHORT** + tradeable → **bear cub**. **FLAT** → sleeping “zzz” pet (otherwise hidden). Pets are **draggable** (clamped to the scene frame); position persists as `phf-pet-pos`.

### Trash can (busted thesis)
Pixel trash can on the floor — **draggable**, position in `phf-trash-pos`. **Click** opens a crumpled “busted thesis / wrong call” research note built from live Chart Desk bias (counter-trend idea that failed, confluence that flipped, etc.). Post-mortem narrative only — real signal context, no fake live P&L.

### Rare mariachi
Same rarity spirit as the UFO: eligible in **day** or **golden** sim phases, ≤ once per sim-day, ~**7%** roll. Band enters the aisle, plays with note sprites (~36 frames). Wire status shows `MARIACHI!` while active.

## Skyline theme and rare UFO event

Use **SET → Office Decor → Theme** to switch between the default NYC dusk view and a Miami Vice skyline with magenta/cyan neon, palms, waterline accents, and the same moving bird layer.

The rare UFO abduction event appears over the Empire State Building (center window pane):

- Eligible only during **dusk** or **night** sim phases
- At most **once per sim-day** (1440 sim-minutes)
- ~**8%** roll on first eligible tick of that day
- Brief sequence: approach → hover beam → abduct a pixel silhouette → depart (~36 frames)
- Birds hide while the event is active.
- Wire status shows `UFO!` while active — intentionally rare, not every cycle
