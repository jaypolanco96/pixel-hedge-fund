---
name: pixel-hedge-fund
description: Build, debug, review, and extend the Pixel Hedge Fund SvelteKit office sim using its established Bybit-first market data (BloFin fallback), TA posture, pixel-scene, persistence, and BloFin safety conventions.
---

# Pixel Hedge Fund

Use this skill for work in the Pixel Hedge Fund repository. Read `AGENTS.md`, then inspect the current code and the relevant README or `BLOFIN.md` section before making a decision. The repository is the source of truth; this skill captures durable product decisions recovered from Grokbot.

## Preserve the product

Keep the experience as a lived-in 1990s pixel hedge-fund office. Prefer diegetic scene elements such as CRTs, boards, ticker tape, paper, fax, desks, and props over floating dashboard panels. Keep the foreground desk camera, NYC window skyline, Empire State silhouette, and rain-on-glass treatment coherent when changing scene layout. Desk SET offers a Miami Vice skyline theme alongside the NYC default (`OfficeTheme` in `src/lib/persist/deskSettings.ts`); the rare skyline event is a UFO abduction (`src/lib/weather/ufoEvent.ts`), which replaced the old King Kong event — do not bring Kong back.

## Market and signal behavior

- Use Bybit as the canonical tape with BloFin as the only public-data fallback. Use the existing symbol table in `src/lib/data/symbols.ts`.
- Use the existing 15m setup plus 4h regime signal path and its Supertrend, EMA, RSI, MACD, and ATR inputs.
- Propagate `sample: true` through fallbacks. Label sample data visibly and never imply it is live.
- Keep trader posture derived from bias, confluence, and structure. Open positions may show risk detail; considering traders get thought clouds; weak, conflicting, or unavailable signals must not create fake fills.
- To send a trader back to thinking, use the existing per-trader Release button (`releaseTrader` in `TradingFloor.svelte`, closes the position with no P&L event and shows a `rethinking the trade` cloud for 60s) or the monitor panel's reset-all control (`resetAllTradersToThinking`). Do not add a second mechanism for this.
- Gate celebrations and stress effects on open posture. Preserve the cast MTM model and its sample inheritance.

## Live trading safety

Treat BloFin write routes as real-money capable. Preserve the explicit confirmation gate, keep assign/sync side-effect free, and do not expose API keys in source, docs, logs, context, skills, or artifacts. Do not add transfer or withdrawal endpoints. When editing trade UI, verify the confirmation state and the error/snapshot messaging paths.

## Committing and pushing

Only when the user asks. See "Git: committing and pushing" in `AGENTS.md`: stage specific files, commit with a HEREDOC message, then `git push origin main`. The HTTPS remote authenticates through the machine's Git Credential Manager, so never handle tokens. If the push is blocked, it is the sandbox (network or credential-manager access): ask for approval to run it unsandboxed or have the user run it. Never force-push.

## Implementation loop

1. Identify the smallest relevant Svelte component, data module, route, or persistence helper.
2. Check existing types and current signal/sample semantics before adding state.
3. Make the smallest coherent change and preserve responsive scene behavior, drag bounds, and local persistence where applicable.
4. Run `npm test`, `npm run check` and `npm run build`; report failures with the affected path and reason.

For visual changes, inspect the running page or a screenshot when available and verify that props do not cover trader nameplates, thought clouds, or the active HUD. For market changes, test both live-shaped and `sample: true` payloads. For BloFin changes, inspect both configured and snapshot/network-blocked paths without using live writes as a test shortcut.
