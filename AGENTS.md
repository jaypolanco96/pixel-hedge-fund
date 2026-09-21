# Pixel Hedge Fund working context

This workspace is the active Pixel Hedge Fund checkout. Treat the code and docs in this repository as the current source of truth; the notes below preserve durable decisions recovered from Grokbot's PHF work.

## Product direction

- PHF is a SvelteKit lived-in pixel office, not a generic trading dashboard.
- The camera looks across a warm 1990s hedge-fund floor from behind a cluttered foreground desk.
- The scene includes panoramic NYC windows, an Empire State silhouette, a wall sign, a market wire, a whiteboard, lounge props, CRT desks, and the trader cast.
- Diegetic controls belong in the room. Keep charts and metrics in desk terminals, CRTs, wall boards, ticker tape, or paper/fax props instead of floating dashboard cards.
- The art direction favors readable silhouettes, restrained pixel detail, lived-in clutter, and rain on the glass only. The Empire State crown should read at dusk.

## Market and signal rules

- Canonical market source is Kraken Futures.
- Display `SOLUSDT` maps to Kraken Futures `PF_SOLUSD`; `BTCUSDT` maps to `PF_XBTUSD` because Kraken uses XBT. Check `src/lib/data/symbols.ts` for the full mapping.
- The signal stack uses 15m setup plus 4h regime, including Supertrend, EMA21/55, RSI, MACD, and ATR. Use the existing implementation and API routes rather than inventing a second signal path.
- Preserve `sample: true` through every fallback payload and show SAMPLE in the UI. Never present fallback prices or candles as live data.
- Grokbot froze ATR14% buckets for the SOL 15m tape at quiet `< 0.39`, normal `0.39–0.49`, and wild `> 0.49`. Verify current code/specs before changing these thresholds.

## Trader behavior

- The floor has ten traders: five LONG and five SHORT, with leverage ladders 5x, 10x, 25x, 50x, and 100x. Staff roles remain badge-less.
- Trader posture is driven by bias, confluence, and structure: open, considering, watching, or counter. Strong confluence aligns with the signal; weak or conflicting signals do not create invented fills.
- Both desks scan independently. The signal `bias`/`confluence` only describe the trend side, so the opposing desk (or both, on a FLAT tape) runs a half-size fade playbook in `src/lib/ta/posture.ts` (`wantsHedgeOpen`): RSI exhaustion plus stretch from EMA21 in ATR units, ATR-based stop, thesis exit on RSI normalising, leverage-scaled time stops. `reconcileBook` also enforces a net-exposure cap (`MAX_NET_FRACTION`) on new entries only, and returns `stopOuts`/`timeStops`/`riskDenied` for the floor's cooldowns and PM/CIO notes. Do not gate entries for one side on the other side's bias again.
- Open traders can show mark-to-market details, Supertrend stop, TP1 at 1.5R, and TP2 at 2.5R. Considering traders get thought clouds; watching/counter traders do not get fake open positions.
- Trader sprites are drawn in `CharacterSprite.svelte`; `female: true` on a `TraderDef` in `src/lib/characters/cast.ts` switches on the female model (long hair, framing locks, lips). Status, BloFin, and PNL banners sit stacked above the head and the thought cloud sits above them, so keep new desk overlays out of the head area.
- Celebrate/stress effects are gated on `posture === "open"`. Seed marks must not look like profitable live positions.
- The cast MTM model is separate from any player paper-book risk model: ten cast legs, $10k notional each, signed move from the Tape Wire mark, with the `sample` flag inherited. Do not reintroduce the deferred player-book 2x Prop caps into cast behavior without an explicit product decision.

## BloFin, Bybit, and live trading

- BloFin routes can read balances, positions, and orders and support allowlisted writes for leverage, margin mode, place, cancel, and close.
- Live is the default base URL. Any write must remain behind the explicit `LIVE ORDER — confirm` UI gate. Assign/sync stores local intent and must not fire a live order.
- Never put trade credentials into committed files, context, skills, documentation, or generated artifacts. Use the existing per-session login/header flow and local secret fallbacks only as documented in `BLOFIN.md`.
- Bybit linear Quick Trade uses `/api/bybit/order` and must attach full-position market TP1 and Supertrend SL with MarkPrice triggers behind the same confirmation gate.
- Transfer and withdrawal endpoints stay out of scope.

## Working conventions

- Work in this checkout: `C:\Users\jorda\orca\pixel-hedge-fund`.
- Before changing behavior, read the relevant existing component, data module, route, and README/BLOFIN documentation. Preserve unrelated user changes.
- Prefer existing persistence helpers and UI primitives. Keep pair selection in URL/local storage as the app already does.
- Run `npm run check` and `npm run build` after meaningful changes.
- Use the local PHF skill at `.codex/skills/pixel-hedge-fund/SKILL.md` for implementation and review tasks.

## Git: committing and pushing

Claude Code pushed this repo successfully with plain git. There is no special trick.

- Remote `origin` is `https://github.com/jaypolanco96/pixel-hedge-fund` over HTTPS, branch `main` tracks `origin/main`.
- Git for Windows' system config sets `credential.helper = manager` (Git Credential Manager), which already holds the user's GitHub login. Do not add tokens, PATs, SSH keys, or credentials to the remote URL, files, or commands.
- Only commit or push when the user asks. Never force-push, skip hooks, or change git config.
- Workflow: `git status --short`, then `git add <specific files>` (not `-A`), then commit with a HEREDOC message (the existing style is `feat:` / `fix:` / `docs:` prefixes), then `git push origin main`, then `git status -sb` to confirm it is no longer ahead.
- If a push is blocked, the cause is the sandbox rather than git: outbound network to github.com and access to the Windows credential manager are usually gated. Request approval to run `git push` unsandboxed / with network access, or ask the user to run it, instead of hunting for workarounds. If the error is an auth or non-fast-forward rejection, report the exact message and stop; do not rewrite history.
