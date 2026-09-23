<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { randomElevatorTip } from '$lib/data/elevatorTips';

	let {
		onArrive = () => {},
		reduceMotion = false,
		direction = 'up'
	}: { onArrive?: () => void; reduceMotion?: boolean; direction?: 'up' | 'down' } = $props();

	// A few desk regulars caught on a coffee break in the lobby, visible around the cab - a warm,
	// lived-in touch behind the ride rather than empty void.
	const lobbyTraders = [
		{ id: 0, x: 2, skin: '#c88752', hair: '#1d0e08', outfit: '#355a48' },
		{ id: 1, x: 11, skin: '#e1b68d', hair: '#6a4937', outfit: '#5f3a55' },
		{ id: 2, x: 20, skin: '#edc49d', hair: '#a8783b', outfit: '#6c4055' },
		{ id: 3, x: 80, skin: '#8b5638', hair: '#130f0c', outfit: '#304562' },
		{ id: 4, x: 90, skin: '#b9784f', hair: '#23120b', outfit: '#6a3f3f' }
	];

	const tip = randomElevatorTip();
	// direction is fixed for the life of this page (set once by the route that navigated here) -
	// read its initial value directly rather than tracking it reactively.
	const initialDirection = untrack(() => direction);
	// PHF is on floor 84 (see the "PHF Floor 84" plaque on the tower and the lit 84 button below) -
	// the ride always runs between the lobby (1) and floor 84, never a random in-between floor.
	const startFloor = initialDirection === 'up' ? 1 : 84;
	const endFloor = initialDirection === 'up' ? 84 : 1;
	let floor = $state(startFloor);
	let doorsOpen = $state(true);
	// 'depart': doors open where the ride starts. 'transit': doors closed, riding. 'arrive': doors
	// open at the destination. Exactly one of depart/arrive is "at the lobby" - going up, that's
	// depart (you board there); going down (BREAK), that's arrive (you land there, right before
	// the page navigates to '/'). The lobby is shown only in that one phase, never both.
	const lobbyPhase = initialDirection === 'up' ? 'depart' : 'arrive';
	let phase = $state<'depart' | 'transit' | 'arrive'>('depart');
	const atLobby = $derived(phase === lobbyPhase);
	// Arriving at the lobby, opening the doors here reveals it - good. Arriving at the floor, there's
	// no floor art on this page to reveal, so opening here just flashes black. Instead, the doors
	// stay shut through the whole ride and the floor page itself plays the open (see doorOpenFlag).
	const openDoorsOnArrival = lobbyPhase === 'arrive';
	const doorOpenFlagKey = 'phf-door-open-on-floor';

	onMount(() => {
		const rideMs = reduceMotion ? 300 : 4100;
		// Give the departure lobby (when it's the active lobbyPhase) the same kind of dwell time
		// the arrival lobby gets, instead of flashing past it in 150ms.
		const departMs = reduceMotion ? 150 : lobbyPhase === 'depart' ? 1000 : 150;
		const closeTimer = setTimeout(() => { doorsOpen = false; phase = 'transit'; }, departMs);
		const steps = 24;
		const stepMs = rideMs / steps;
		let i = 0;
		const counter = setInterval(() => {
			i++;
			floor = Math.round(startFloor + ((endFloor - startFloor) * i) / steps);
			if (i >= steps) clearInterval(counter);
		}, stepMs);
		const openTimer = setTimeout(() => {
			phase = 'arrive';
			if (openDoorsOnArrival) doorsOpen = true;
		}, rideMs + 200);
		// Doors take 0.7s to finish sliding open (see .door transition) - hold a beat after that
		// before actually navigating, so the open door is clearly seen, not just implied.
		const arriveTimer = setTimeout(() => {
			if (!openDoorsOnArrival) {
				try { sessionStorage.setItem(doorOpenFlagKey, '1'); } catch { /* private mode, etc. */ }
			}
			onArrive();
		}, rideMs + 200 + 700 + 500);
		return () => {
			clearTimeout(closeTimer);
			clearTimeout(openTimer);
			clearTimeout(arriveTimer);
			clearInterval(counter);
		};
	});
</script>

<div class="elevator" class:reduce-motion={reduceMotion} role="status" aria-live="polite">
	<!-- WTC lobby: marble floor, warm light, and a few traders on a coffee break. Shown only in
	     whichever phase is actually at the lobby (see lobbyPhase above), never both. -->
	{#if atLobby}
		<div class="lobby-backdrop" aria-hidden="true">
			<div class="lobby-wall"></div>
			<div class="lobby-glow"></div>
			<div class="lobby-floor"></div>
			{#each lobbyTraders as t (t.id)}
				<div class="lobby-trader" style:left="{t.x}%" style:--skin={t.skin} style:--hair={t.hair} style:--outfit={t.outfit}>
					<div class="lt-head"></div>
					<div class="lt-torso"></div>
					<div class="lt-arm"></div>
					<div class="lt-cup"><i class="steam"></i></div>
					<div class="lt-leg l"></div>
					<div class="lt-leg r"></div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="cab">
		<div class="tip-card">
			<span class="tip-label">DESK NOTE</span>
			<p class="tip-text">{tip}</p>
		</div>
	</div>

	<!-- Anchored to the screen corner (not the cab's centered box), so it never shares space with
	     the tip note and the note never has to move out of the way for it. -->
	{#if !atLobby}
		<div class="panel">
			<div class="indicator">
				<span class="arrow" aria-hidden="true">{direction === 'up' ? '▲' : '▼'}</span>
				<span class="floor-num">{floor}</span>
			</div>
			<div class="floor-buttons" aria-hidden="true">
				{#each [78, 79, 80, 81, 82, 83, 84] as fl (fl)}
					<i class:lit={fl === 84}>{fl}</i>
				{/each}
			</div>
			<div class="door-controls" aria-hidden="true">
				<i class="door-btn open-btn" title="Door open"><b></b><b></b></i>
				<i class="door-btn close-btn" title="Door close"><b></b><b></b></i>
			</div>
			<i class="alarm-btn" aria-hidden="true" title="Alarm">!</i>
		</div>
	{/if}

	<div class="door left" class:open={doorsOpen}>
		<div class="pgf-plaque" aria-label="PGF, floor 84, discipline, research, returns">
			<strong>PGF</strong>
			<span>FLOOR 84</span>
			<small>DISCIPLINE . RESEARCH . RETURNS</small>
		</div>
	</div>
	<div class="door right" class:open={doorsOpen}></div>
</div>

<style>
	.elevator {
		position: fixed;
		inset: 0;
		min-height: 100dvh;
		z-index: 500;
		display: grid;
		place-items: center;
		background: #0c0805;
		overflow: hidden;
	}
	.lobby-backdrop {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
	}
	.lobby-wall {
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, #3a2a1e 0%, #5a4530 55%, #3a2a1e 100%);
	}
	.lobby-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse 60% 45% at 50% 35%, rgba(255, 200, 120, 0.28) 0%, transparent 70%);
	}
	.lobby-floor {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 22%;
		background: repeating-linear-gradient(90deg, #8a7454 0 60px, #766043 60px 64px);
		box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.4);
	}
	.lobby-trader {
		position: absolute;
		bottom: 22%;
		width: 20px;
		height: 48px;
		transform: scale(1.9);
		transform-origin: bottom center;
	}
	.lt-head {
		position: absolute;
		top: 0;
		left: 6px;
		width: 9px;
		height: 9px;
		background: var(--skin);
		border: 1px solid #1d120c;
		border-radius: 50%;
	}
	.lt-torso {
		position: absolute;
		top: 8px;
		left: 2px;
		width: 16px;
		height: 20px;
		background: var(--outfit);
		border: 1px solid #1d120c;
		border-radius: 2px;
	}
	.lt-arm {
		position: absolute;
		top: 12px;
		left: 15px;
		width: 5px;
		height: 10px;
		background: var(--outfit);
		border: 1px solid #1d120c;
		transform: rotate(-25deg);
	}
	.lt-cup {
		position: absolute;
		top: 8px;
		left: 17px;
		width: 5px;
		height: 5px;
		background: #eee6d4;
		border: 1px solid #1d120c;
	}
	.steam {
		position: absolute;
		top: -6px;
		left: 1px;
		width: 2px;
		height: 6px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 2px;
		animation: steam-rise 2.2s ease-in-out infinite;
	}
	@keyframes steam-rise {
		0%, 100% {
			opacity: 0.2;
			transform: translateY(0);
		}
		50% {
			opacity: 0.6;
			transform: translateY(-3px);
		}
	}
	.lt-leg {
		position: absolute;
		top: 28px;
		width: 6px;
		height: 16px;
		background: #1c2836;
		border: 1px solid #10161f;
	}
	.lt-leg.l {
		left: 2px;
	}
	.lt-leg.r {
		left: 11px;
	}
	.elevator.reduce-motion .steam {
		animation: none;
	}
	/* No box - just a layout container. The tip note and (once boarded) the button panel float
	   directly over whatever's behind them (lobby while departing, plain wall once underway). */
	.cab {
		position: relative;
		width: min(520px, 92vw);
		height: min(70vh, 560px);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.panel {
		position: absolute;
		z-index: 3;
		right: 6%;
		top: 8%;
		width: 108px;
		background: #2a251f;
		border: 3px solid #14110d;
		padding: 8px;
		box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.4);
	}
	.indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background: #0a0e0a;
		border: 2px solid #1a2818;
		padding: 6px 0;
		color: #5dff8a;
		font-family: 'Courier New', monospace;
		text-shadow: 0 0 6px rgba(60, 255, 120, 0.55);
	}
	.arrow {
		font-size: 12px;
		animation: rise 1s steps(2) infinite;
	}
	.elevator.reduce-motion .arrow {
		animation: none;
	}
	@keyframes rise {
		50% {
			transform: translateY(-2px);
			opacity: 0.6;
		}
	}
	.floor-num {
		font-size: 22px;
		font-weight: 700;
		min-width: 28px;
		text-align: center;
	}
	.floor-buttons {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 4px;
		margin-top: 8px;
	}
	.floor-buttons i {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 14px;
		background: #423b31;
		border: 1px solid #17130f;
		box-shadow: inset 1px 1px #5a5145;
		font: 700 8px/1 'Courier New', monospace;
		font-style: normal;
		color: #cfc6b4;
	}
	.floor-buttons i.lit {
		background: #4a3620;
		color: #ffe9a8;
		box-shadow: inset 1px 1px #d9a94a, 0 0 4px rgba(217, 169, 74, 0.5);
	}
	.door-controls {
		display: flex;
		gap: 4px;
		margin-top: 6px;
	}
	.door-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: 14px;
		background: #423b31;
		border: 1px solid #17130f;
		box-shadow: inset 1px 1px #5a5145;
	}
	.door-btn b {
		display: block;
		width: 0;
		height: 0;
		border-style: solid;
		border-width: 3px 0 3px 4px;
		border-color: transparent transparent transparent #cfc6b4;
	}
	.open-btn b:first-child {
		transform: rotate(180deg);
	}
	.close-btn b:last-child {
		transform: rotate(180deg);
	}
	.alarm-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		margin: 6px auto 0;
		background: #6b2018;
		border: 1px solid #17130f;
		box-shadow: inset 1px 1px #c94a3a;
		border-radius: 50%;
		font: 900 10px/1 'Courier New', monospace;
		font-style: normal;
		color: #ffd9d0;
	}
	.tip-card {
		position: relative;
		z-index: 3;
		width: 78%;
		max-width: 360px;
		background: #1a1611;
		border: 3px solid #d9a94a;
		padding: 20px 22px;
		text-align: center;
		box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.45), 0 0 24px rgba(217, 169, 74, 0.12);
	}
	.tip-label {
		display: block;
		font: 700 10px/1 'Courier New', monospace;
		letter-spacing: 0.18em;
		color: #d9a94a;
		margin-bottom: 10px;
	}
	.tip-text {
		margin: 0;
		font: 700 16px/1.55 'Courier New', monospace;
		color: #f8efdc;
	}
	.pgf-plaque {
		position: absolute;
		z-index: 3;
		left: 50%;
		top: 44%;
		transform: translate(-50%, -50%);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		width: min(230px, 72%);
		min-height: 102px;
		padding: 12px 10px 10px;
		background: linear-gradient(145deg, #d8bd73, #8c6936 82%);
		border: 4px solid #251c13;
		box-shadow:
			inset 0 0 0 2px #f1d890,
			inset 0 0 0 5px #6d4c27,
			5px 6px 0 rgba(0, 0, 0, 0.42);
		text-align: center;
	}
	.pgf-plaque strong {
		color: #2a1a0d;
		font: 900 clamp(22px, 4vw, 34px)/0.9 'Courier New', monospace;
		letter-spacing: 0.12em;
		text-shadow: 2px 2px 0 rgba(247, 222, 145, 0.6);
	}
	.pgf-plaque span {
		padding: 3px 8px;
		background: #2b2117;
		color: #f2d47d;
		border: 1px solid #604421;
		font: 700 9px/1 'Courier New', monospace;
		letter-spacing: 0.12em;
	}
	.pgf-plaque small {
		color: #332313;
		font: 700 6px/1.2 'Courier New', monospace;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}
	.door {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 50%;
		background: linear-gradient(90deg, #6a6155 0%, #474036 90%);
		border: 4px solid #17130f;
		box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.35);
		transition: transform 0.7s cubic-bezier(0.6, 0, 0.4, 1);
		z-index: 2;
	}
	.door.left {
		left: 0;
		transform: translateX(0);
	}
	.door.left.open {
		transform: translateX(-101%);
	}
	.door.right {
		right: 0;
		transform: translateX(0);
	}
	.door.right.open {
		transform: translateX(101%);
	}
	.elevator.reduce-motion .door {
		transition: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.door {
			transition: none;
		}
		.arrow {
			animation: none;
		}
	}
	@media (max-width: 520px) {
		.panel {
			top: 4%;
			right: 3%;
			width: 92px;
			padding: 6px;
			transform: scale(0.92);
			transform-origin: top right;
		}
		.tip-card {
			width: min(70vw, 300px);
			padding: 16px 12px;
		}
		.tip-text {
			font-size: 13px;
			line-height: 1.4;
		}
		.pgf-plaque {
			width: min(180px, 78%);
			min-height: 84px;
			padding: 8px 5px;
			gap: 3px;
		}
		.pgf-plaque strong {
			font-size: 22px;
		}
		.pgf-plaque span {
			font-size: 7px;
		}
		.pgf-plaque small {
			font-size: 4px;
		}
	}
</style>
