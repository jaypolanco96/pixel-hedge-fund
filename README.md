# Pixel Hedge Fund

A SvelteKit **lived-in pixel office** — not a dashboard. Warm 90s hedge-fund floor (Apex Capital / sim vibe), panoramic NYC sunset windows, wooden CRT desks, and Chart Desk TA driving real trader behavior.

Art reference: [`static/ref/apex-capital-office.png`](./static/ref/apex-capital-office.png)

## Run

```bash
cd /workspace/pixel-hedge-fund/app
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

```bash
npm run check
npm run build
```

## Scene (office-first)

Camera sits **behind a cluttered foreground desk** looking across the floor:

- Panoramic **NYC sunset windows** (Empire State silhouette, mullions, rain on glass; rare **King Kong** event)
- Wall **PIXEL HEDGE FUND** sign + values: Discipline / Research / Returns
- **TODAY** whiteboard, **MARKET WIRE** board with **CHANNEL** pair switch + multi-crypto rows
- Lounge sofa + Fortune, plants, brass bull on a filing cabinet
- 10 traders at wooden CRT desks (5 LONG / 5 SHORT, 5×–100×) + CIO, PM, Senior Analyst, Research Analyst, Quant
- Foreground props: books, WSJ, legal pad, beige CRT, keyboard, corded phone, calculator, coffee, **PAIR** desk pad

HUD lives **in the room** (wall board, LED tape, foreground CRT) — no floating metric cards.

**Desk clipboard** (hover/inspect): pointer-**draggable**, clamped to the floor, slight paper tilt while dragging.

## Active pair switching

Diegetic controls (MARKET WIRE **CHANNEL** select + foreground **PAIR** pad) change the floor’s trading symbol. Selection persists in the URL (`?symbol=ETHUSDT`) and `localStorage`. Quote, signal, candles, and trader positions reload for the chosen pair.

## Cast behavior (Chart Desk)

Positions come from live `/api/market/signal` (Supertrend + EMA21/55 + RSI + MACD + ATR; 15m setup / 4h regime). See `../ta-signal-stack-v1.md` and `../TRADER_TA_POSTURE.md`.

| Tape | Desk mandate | Floor read |
|------|--------------|------------|
| Confluence ≥5, or ≥4 with structure / lower leverage | Same side as bias | **OPEN** in the simulated cast book. Each trader locks an entry-specific stop and TP1/TP2 plan using the Supertrend distance, ATR floor, and their leverage profile. |
| High-confluence rejection, mixed MTF, RSI exhaustion | Opposite side, 5x/10x/25x only | **HEDGE OPEN**. A small counter-book trade may run alongside the trend book; it uses its own entry-locked risk plan. |
| Confluence 2–4, not yet a fill | Same side | **Thinking** + thought cloud |
| Bias against desk, or ST flipped | Opposite / invalid | **FLAT / Watching** — no invented fill |

Lower-leverage traders have wider stops; higher-leverage traders use tighter stops and require larger reward multiples. A TP1 fill closes the simulated leg, shows a pixel cash-stack profit animation, and applies a 90-second re-entry cooldown to that trader. Stops and invalidations close simulated legs. These cast positions are visual simulations only and never send an order to Bybit or BloFin.

Hover / focus a trader → desk **clipboard** to view that trader's entry, mark, unrealized PNL, risk stop, and individual targets. Click to **pin** CRT snippet. Esc unpins.

## Bybit mapping (multi-crypto)

| Display | Bybit linear | Notes |
|---------|----------------|-------|
| **BTCUSDT** | **`BTCUSDT`** | BTC listed as XBT |
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

Production is always live-only: Bybit is tried first, BloFin is the permitted public-data fallback, and unavailable exchange data returns an empty or `503` response. Local `npm run dev` keeps the labeled SAMPLE fallback for offline work; set `PHF_LIVE_ONLY=true` locally when you want to test the live-only behavior.


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

### Bull / bear pets
When tape bias is **LONG** and confluence is **tradeable/high** → mini **bull** pet on the floor. **SHORT** + tradeable → **bear cub**. **FLAT** → sleeping “zzz” pet (otherwise hidden). Pets are **draggable** (clamped to the scene frame); position persists as `phf-pet-pos`.

### Trash can (busted thesis)
Pixel trash can on the floor — **draggable**, position in `phf-trash-pos`. **Click** opens a crumpled “busted thesis / wrong call” research note built from live Chart Desk bias (counter-trend idea that failed, confluence that flipped, etc.). Post-mortem narrative only — real signal context, no fake live P&L.

### Rare mariachi
Same rarity spirit as Kong: eligible in **day** or **golden** sim phases, ≤ once per sim-day, ~**7%** roll. Band enters the aisle, plays with note sprites (~36 frames). Wire status shows `MARIACHI!` while active.

## Rare King Kong event

On the Empire State Building (center window pane):

- Eligible only during **dusk** or **night** sim phases
- At most **once per sim-day** (1440 sim-minutes)
- ~**8%** roll on first eligible tick of that day
- Brief sequence: climb → roar → swipe helicopters → fade (~28 frames)
- Wire status shows `KONG!` while active — intentionally rare, not every cycle

## Specs (repo root)

- `../PRODUCT_BRIEF.md`
- `../ta-signal-stack-v1.md`
- `../FLOOR_ART_DIRECTION.md`
- `../FLOOR_SIGNAL_DRIVERS.md`
- `../TRADER_TA_POSTURE.md`
- `../OFFICE_PROPS.md`
- `../risk-pit/v1-trader-mtm.md`
- `../market-data/API_CONTRACT.md`
