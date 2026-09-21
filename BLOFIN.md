# BloFin (live trading)

Pixel Hedge Fund desk console + Quick Trade talk to BloFin for **balances, positions, orders**, and allowlisted **live writes** (leverage, margin mode, place, cancel, close).

## Danger

- Default base URL is **LIVE**: `https://openapi.blofin.com`.
- Demo (`https://demo-trading-openapi.blofin.com`) is **opt-in only** via `BLOFIN_BASE_URL` / LOGIN base — not the primary path.
- Write routes can move real money. UI requires an explicit **LIVE ORDER — confirm** step before any POST. Assign / sync alone only stores local intent.
- Server routes under `/api/blofin/*` **never** return API secrets.
- Transfer / withdraw endpoints are **not** implemented and must stay that way.
- Snapshot fallback (`static/blofin-snapshot.json`) is an **offline CACHE** when Windows ISP returns 403 — **not demo**. Responses set `fromSnapshot: true`.

## Per-visitor LOGIN (Vercel / multi-user)

**Do not put TRADE API keys in Vercel project env** for shared / multi-visitor deploys.

| Layer | What happens |
|-------|----------------|
| Browser | Desk Console → **LOGIN** saves keys to `sessionStorage` key `phf-exchange-keys` |
| Client fetch | `$lib/client/exchangeHeaders` attaches `x-phf-blofin-*` / `x-phf-bybit-*` on `/api/blofin/*` and `/api/bybit/*` |
| Server | `$lib/server/requestExchangeAuth` reads those headers (AsyncLocalStorage). **Request headers win** over env / `.secrets` |
| `/api/keys/*` on Vercel | Validate-only (masked status). **No** writable shared disk vault |
| Market data | Bybit / BloFin public tape — **no keys** |

Keys stay in **this browser session** (not a shared Vercel vault). Clearing site data logs the visitor out.

### Vercel deploy checklist

1. **Remove / do not set** `BLOFIN_API_KEY`, `BLOFIN_API_SECRET`, `BLOFIN_PASSPHRASE`, `BYBIT_API_KEY`, `BYBIT_API_SECRET` (and aliases) in the Vercel project.
2. Optional public Config only: `BLOFIN_BASE_URL=https://openapi.blofin.com` (default base — LOGIN can override).
3. Deploy. Each visitor opens Desk → **LOGIN**, pastes their own TRADE keys, SAVE.
4. Confirm-gated trades send credentials per-request via headers over HTTPS.

## Solo local / env vars (optional)

For **solo local dev**, env or `.secrets/exchanges.json` still work as fallbacks when request headers are absent:

| Var | Required | Notes |
|-----|----------|--------|
| `BLOFIN_API_KEY` | local only | API key (aliases: `BLOFIN_KEY`) |
| `BLOFIN_API_SECRET` | local only | Secret (aliases: `BLOFIN_SECRET`) |
| `BLOFIN_PASSPHRASE` | local only | Passphrase (aliases: `BLOFIN_PASS`) |
| `BLOFIN_BROKER_ID` | local only | BloFin broker ID when the API key is broker-bound; sent on order placement |
| `BLOFIN_BASE_URL` | no | Default **live**: `https://openapi.blofin.com`. Demo URL discouraged. |

API key needs **TRADE** permission for writes (READ alone is not enough).

### Windows local setup

```bat
copy C:\Users\jorda\.grokbot\blofin.env C:\Users\jorda\pixel-hedge-fund\app\.env.local
```

Ensure `BLOFIN_BASE_URL=https://openapi.blofin.com`, then restart `npm run dev`.

Linux box: same keys in `/workspace/pixel-hedge-fund/app/.env.local`, **or** use Desk LOGIN (session + local `.secrets`).

## Routes

### GET (live first, snapshot cache on 403/network)

| Path | Upstream |
|------|----------|
| `/api/blofin/health` | Credential presence + optional balance ping |
| `/api/blofin/balance` | `GET /api/v1/account/balance` |
| `/api/blofin/positions` | `GET /api/v1/account/positions` |
| `/api/blofin/orders` | `GET /api/v1/trade/orders-pending` |

### POST (allowlisted writes only)

| Path | Upstream | Body (validated) |
|------|----------|------------------|
| `/api/blofin/leverage` | `POST /api/v1/account/set-leverage` | `instId`, `leverage`, `marginMode`, optional `positionSide` |
| `/api/blofin/margin-mode` | `POST /api/v1/account/set-margin-mode` | `marginMode`: `isolated` \| `cross` |
| `/api/blofin/order` | `POST /api/v1/trade/order` | `instId`, `marginMode`, `side`, `orderType`, `size`, optional `price` / `positionSide` / `reduceOnly` / TP/SL trigger fields |
| `/api/blofin/cancel` | `POST /api/v1/trade/cancel-order` | `instId` + `orderId` or `clientOrderId` |
| `/api/blofin/close` | `POST /api/v1/trade/close-position` | `instId`, `marginMode`, `positionSide` |

Unknown paths are rejected inside `blofin.ts` (GET/POST allowlists).

### Bybit Quick Trade

Quick Trade can target Bybit linear USDT contracts and spot symbols when Bybit keys are configured. The `/api/bybit/order` route signs `POST /v5/order/create`; linear orders attach full-position market TP1 and Supertrend SL with `MarkPrice` triggers, while spot orders use base-coin sizing and supported TP1 / SL fields. Bybit broker accounts can provide `BYBIT_BROKER_ID`, sent as the `X-Referer` broker header. All orders remain behind the same **LIVE ORDER — confirm** gate.

## Desk UI

- Desk keyboard → console. Esc / × closes.
- **LOGIN**: per-visitor keys in browser session; confirm before save.
- **Assign** maps a position → floor trader in `localStorage` (`phf-blofin-assignments`) and can **store a trade intent** (% funds, margin, leverage, order type, reduce-only).
- **LIVE ORDER — confirm** is required before POST. No auto-fire on assign/sync alone.
- Quick Trade: same options + confirm gate; aligned Chart Desk orders attach full-size TP1 and Supertrend SL using mark-price triggers with market execution (`-1`). The confirmation gate shows both attached levels before sending. Create is blocked when the selected side has no valid aligned levels.
- Spot Quick Trade: choose `SPOT` in the market selector. BloFin sends `POST /api/v1/spot/trade/order`; Bybit sends a `spot` order through `/v5/order/create`. The gate shows the current TP1 / SL plan; Bybit spot sends supported TP1 / SL fields, while BloFin spot currently sends the entry and presents protection for review.
- Leveraged tokens are spot products. PHF discovers currently listed venue symbols at runtime, including names such as `BTC3L` / `BTC3S` or the equivalent symbol returned by the exchange. Availability can change by venue and region, so only instruments reported as tradable by the public spot instrument endpoint are shown. Token orders use the live token price for sizing, require a spot sell to exit, and do not use futures leverage, liquidation protection, or attached futures TP/SL.

## Snapshot fallback (403 / network)

When BloFin upstream returns **403** or a **network error**, `/api/blofin/*` GET serves `static/blofin-snapshot.json`.

Responses set `fromSnapshot: true` and `syncedAt` from the file. Desk shows a **SNAPSHOT / CACHE** banner (not demo). Refresh the JSON via Desk Lead — do not hand-edit fake balances.

## Health flags (desk)

| Flag | Meaning |
|------|---------|
| `configured` | API key + secret + passphrase present (request headers, env, or local `.secrets`) |
| `writesEnabled` | Same as configured — **not** cleared on ISP 403 |
| `reachable` | Upstream balance ping succeeded |
| `networkBlocked` | 403 / transport failure from this network |

When `configured && networkBlocked`, the desk shows **BloFin unreachable from this network (403). Keys OK — use VPN or deploy server-side.** — not “write APIs blocked”. Confirm still attempts POST and surfaces BloFin `code`/`msg` in toasts.
