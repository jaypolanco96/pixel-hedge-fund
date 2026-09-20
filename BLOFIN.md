# BloFin (live trading)

Pixel Hedge Fund desk console + Quick Trade talk to BloFin for **balances, positions, orders**, and allowlisted **live writes** (leverage, margin mode, place, cancel, close).

## Danger

- Default base URL is **LIVE**: `https://openapi.blofin.com`.
- Demo (`https://demo-trading-openapi.blofin.com`) is **opt-in only** via `BLOFIN_BASE_URL` — not the primary path.
- Write routes can move real money. UI requires an explicit **LIVE ORDER — confirm** step before any POST. Assign / sync alone only stores local intent.
- Server routes under `/api/blofin/*` **never** return API secrets.
- Transfer / withdraw endpoints are **not** implemented and must stay that way.
- Snapshot fallback (`static/blofin-snapshot.json`) is an **offline CACHE** when Windows ISP returns 403 — **not demo**. Responses set `fromSnapshot: true`.

## Env vars

| Var | Required | Notes |
|-----|----------|--------|
| `BLOFIN_API_KEY` | yes | API key (aliases: `BLOFIN_KEY`) |
| `BLOFIN_API_SECRET` | yes | Secret (aliases: `BLOFIN_SECRET`) |
| `BLOFIN_PASSPHRASE` | yes | Passphrase (aliases: `BLOFIN_PASS`) |
| `BLOFIN_BASE_URL` | no | Default **live**: `https://openapi.blofin.com`. Demo URL discouraged. |

API key needs **TRADE** permission for writes (READ alone is not enough).

## Windows local setup

```bat
copy C:\Users\jorda\.grokbot\blofin.env C:\Users\jorda\pixel-hedge-fund\app\.env.local
```

Ensure `BLOFIN_BASE_URL=https://openapi.blofin.com`, then restart `npm run dev`.

Linux box: same keys in `/workspace/pixel-hedge-fund/app/.env.local`.

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
| `/api/blofin/order` | `POST /api/v1/trade/order` | `instId`, `marginMode`, `side`, `orderType`, `size`, optional `price` / `positionSide` / `reduceOnly` |
| `/api/blofin/cancel` | `POST /api/v1/trade/cancel-order` | `instId` + `orderId` or `clientOrderId` |
| `/api/blofin/close` | `POST /api/v1/trade/close-position` | `instId`, `marginMode`, `positionSide` |

Unknown paths are rejected inside `blofin.ts` (GET/POST allowlists).

## Desk UI

- Desk keyboard → console. Esc / × closes.
- **Assign** maps a position → floor trader in `localStorage` (`phf-blofin-assignments`) and can **store a trade intent** (% funds, margin, leverage, order type, reduce-only).
- **LIVE ORDER — confirm** is required before POST. No auto-fire on assign/sync alone.
- Quick Trade: same options + confirm gate; Send enabled when live/writes ready.

## Snapshot fallback (403 / network)

When BloFin upstream returns **403** or a **network error**, `/api/blofin/*` GET serves `static/blofin-snapshot.json`.

Responses set `fromSnapshot: true` and `syncedAt` from the file. Desk shows a **SNAPSHOT / CACHE** banner (not demo). Refresh the JSON via Desk Lead — do not hand-edit fake balances.

## Health flags (desk)

| Flag | Meaning |
|------|---------|
| `configured` | API key + secret + passphrase present (env or `.secrets/exchanges.json`) |
| `writesEnabled` | Same as configured — **not** cleared on ISP 403 |
| `reachable` | Upstream balance ping succeeded |
| `networkBlocked` | 403 / transport failure from this network |

When `configured && networkBlocked`, the desk shows **BloFin unreachable from this network (403). Keys OK — use VPN or deploy server-side.** — not “write APIs blocked”. Confirm still attempts POST and surfaces BloFin `code`/`msg` in toasts.

## Desk LOGIN tab

Before Vercel: open Desk Console → **LOGIN**. Saves BloFin + Bybit keys to gitignored `.secrets/exchanges.json` (masked on GET `/api/keys/status`). Env vars still win when set.
