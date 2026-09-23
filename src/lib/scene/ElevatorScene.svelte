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
			<div class="lobby-columns"><i></i><i></i><i></i><i></i></div>
			<div class="lobby-ceiling-lights"><i></i><i></i><i></i><i></i><i></i></div>
			<div class="lobby-sign">
				<span class="lobby-sign-mark">PGF</span>
				<strong>WORLD TRADE CENTER</strong>
				<small>LOWER MANHATTAN . FLOOR 84</small>
			</div>
			<div class="lobby-directory">
				<b>BUILDING DIRECTORY</b>
				<span>84 . PGF CAPITAL</span>
				<span>RESEARCH . RETURNS</span>
				<i></i>
				<small>VISITORS REPORT TO RECEPTION</small>
			</div>
			<div class="lobby-clock"><span></span><b>08:42</b><small>NYC</small></div>
			<div class="lobby-reception">
				<div class="reception-monitor"><span>PGF // FRONT DESK</span><b>READY</b></div>
				<div class="reception-keyboard"><i></i><i></i><i></i><i></i><i></i><i></i></div>
				<div class="reception-phone"><i></i><b></b></div>
				<div class="reception-calculator"><i></i><i></i><i></i><i></i><b>84</b></div>
				<div class="reception-coffee"><i></i><b></b></div>
				<div class="reception-front"><strong>RECEPTION</strong><small>VISITOR LOG . SECURITY . 84</small></div>
			</div>
			<div class="lobby-lounge"><i class="lounge-seat one"></i><i class="lounge-seat two"></i><i class="lounge-table"></i></div>
			<div class="lobby-plant"><i class="plant-pot"></i><i class="plant-leaf a"></i><i class="plant-leaf b"></i><i class="plant-leaf c"></i></div>
			<div class="lobby-news"><b>THE WIRE</b><span>DISCIPLINE . RESEARCH . RETURNS</span></div>
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
	.lobby-columns {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
	}
	.lobby-columns i {
		position: absolute;
		bottom: 22%;
		width: 34px;
		height: 70%;
		background: linear-gradient(90deg, rgba(26, 17, 13, 0.55), rgba(184, 142, 80, 0.22) 38%, rgba(30, 19, 13, 0.62));
		border-left: 2px solid rgba(221, 178, 102, 0.32);
		border-right: 2px solid rgba(18, 12, 9, 0.62);
		box-shadow: inset 4px 0 rgba(255, 220, 145, 0.08), 5px 0 rgba(0, 0, 0, 0.2);
	}
	.lobby-columns i:nth-child(1) { left: 13%; }
	.lobby-columns i:nth-child(2) { left: 31%; }
	.lobby-columns i:nth-child(3) { right: 31%; }
	.lobby-columns i:nth-child(4) { right: 13%; }
	.lobby-ceiling-lights {
		position: absolute;
		left: 12%;
		right: 12%;
		top: 6%;
		display: flex;
		justify-content: space-between;
		z-index: 1;
	}
	.lobby-ceiling-lights i {
		width: 58px;
		height: 5px;
		background: #f2d58c;
		border: 1px solid #6c4a25;
		box-shadow: 0 0 12px rgba(255, 206, 116, 0.45), 0 3px 0 rgba(43, 27, 17, 0.65);
	}
	.lobby-sign {
		position: absolute;
		left: 50%;
		top: 10%;
		transform: translateX(-50%);
		z-index: 1;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 10px;
		align-items: center;
		width: min(430px, 42vw);
		padding: 9px 12px;
		background: linear-gradient(180deg, #1b1711, #0e0c09);
		border: 3px solid #8b6a36;
		box-shadow: inset 0 0 0 1px #d4ad5a, 4px 5px 0 rgba(0, 0, 0, 0.35);
		color: #f0d27d;
		font-family: 'Courier New', monospace;
	}
	.lobby-sign-mark {
		display: grid;
		place-items: center;
		width: 42px;
		height: 32px;
		background: #c4933f;
		border: 2px solid #f0d27d;
		color: #22170c;
		font-size: 13px;
		font-weight: 900;
		letter-spacing: 0.08em;
	}
	.lobby-sign strong,
	.lobby-sign small {
		display: block;
		grid-column: 2;
	}
	.lobby-sign strong {
		font-size: clamp(10px, 1.3vw, 16px);
		letter-spacing: 0.12em;
	}
	.lobby-sign small {
		margin-top: 3px;
		color: #b9a071;
		font-size: clamp(6px, 0.7vw, 9px);
		letter-spacing: 0.1em;
	}
	.lobby-directory {
		position: absolute;
		left: 6%;
		top: 19%;
		z-index: 2;
		box-sizing: border-box;
		width: 190px;
		padding: 10px;
		background: #d4c59d;
		border: 3px solid #332315;
		box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.35), inset 0 0 0 2px #efe1ae;
		color: #332416;
		font-family: 'Courier New', monospace;
	}
	.lobby-directory b,
	.lobby-directory span,
	.lobby-directory small {
		display: block;
	}
	.lobby-directory b {
		padding-bottom: 5px;
		border-bottom: 2px solid #66502f;
		font-size: 10px;
		letter-spacing: 0.08em;
	}
	.lobby-directory span {
		margin-top: 7px;
		font-size: 8px;
		font-weight: 700;
	}
	.lobby-directory i {
		display: block;
		width: 55px;
		height: 2px;
		margin: 9px 0 7px;
		background: #aa7c32;
	}
	.lobby-directory small {
		font-size: 6px;
		line-height: 1.25;
	}
	.lobby-clock {
		position: absolute;
		top: 19%;
		right: 7%;
		z-index: 2;
		width: 68px;
		padding: 7px 5px 5px;
		background: #11100d;
		border: 3px solid #6e542d;
		box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.4);
		text-align: center;
		font-family: 'Courier New', monospace;
	}
	.lobby-clock span {
		display: block;
		width: 12px;
		height: 12px;
		margin: 0 auto 4px;
		border: 2px solid #d8b263;
		border-radius: 50%;
		box-shadow: inset 2px 0 #352819;
	}
	.lobby-clock b {
		display: block;
		color: #f3d37c;
		font-size: 10px;
	}
	.lobby-clock small {
		color: #9f8960;
		font-size: 6px;
		letter-spacing: 0.14em;
	}
	.lobby-reception {
		position: absolute;
		left: 50%;
		bottom: 22%;
		z-index: 2;
		width: min(430px, 44vw);
		height: 118px;
		transform: translateX(-50%);
		font-family: 'Courier New', monospace;
	}
	.reception-front {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 67px;
		box-sizing: border-box;
		padding-top: 30px;
		background: linear-gradient(180deg, #6b4b2a, #362316);
		border: 4px solid #21140c;
		box-shadow: inset 0 0 0 2px #b18445, 5px 6px 0 rgba(0, 0, 0, 0.4);
		text-align: center;
	}
	.reception-front strong,
	.reception-front small {
		display: block;
	}
	.reception-front strong {
		color: #f0d27d;
		font-size: 11px;
		letter-spacing: 0.18em;
	}
	.reception-front small {
		margin-top: 4px;
		color: #c7a96d;
		font-size: 6px;
		letter-spacing: 0.08em;
	}
	.reception-monitor {
		position: absolute;
		left: 34%;
		top: 0;
		z-index: 2;
		width: 124px;
		height: 52px;
		box-sizing: border-box;
		padding: 8px 6px;
		background: #6d6652;
		border: 4px solid #28241c;
		box-shadow: inset 0 0 0 2px #aaa284, 3px 4px 0 rgba(0, 0, 0, 0.45);
		color: #70d9a0;
		font-size: 6px;
	}
	.reception-monitor::after {
		content: '';
		position: absolute;
		left: 47px;
		bottom: -16px;
		width: 24px;
		height: 14px;
		background: #4b3a27;
		border: 2px solid #24180e;
	}
	.reception-monitor span,
	.reception-monitor b {
		display: block;
	}
	.reception-monitor span {
		padding-bottom: 6px;
		border-bottom: 1px dotted #537f62;
	}
	.reception-monitor b {
		margin-top: 6px;
		color: #a5f0b8;
		font-size: 9px;
		letter-spacing: 0.15em;
	}
	.reception-keyboard {
		position: absolute;
		left: 17%;
		top: 55px;
		z-index: 3;
		display: grid;
		grid-template-columns: repeat(5, 7px);
		gap: 3px;
		padding: 4px;
		background: #c1ad7d;
		border: 2px solid #2b1b0f;
		transform: skewX(-12deg);
	}
	.reception-keyboard i {
		width: 7px;
		height: 5px;
		background: #43372a;
		box-shadow: inset 1px 1px #d7c28c;
	}
	.reception-phone {
		position: absolute;
		left: 8%;
		top: 64px;
		z-index: 3;
		width: 28px;
		height: 13px;
		background: #20242a;
		border: 2px solid #100e0c;
	}
	.reception-phone i {
		position: absolute;
		left: 3px;
		top: -7px;
		width: 18px;
		height: 6px;
		background: #343b43;
		border: 2px solid #100e0c;
		border-bottom: 0;
		border-radius: 7px 7px 0 0;
	}
	.reception-phone b {
		position: absolute;
		right: 3px;
		top: 4px;
		width: 4px;
		height: 4px;
		background: #d9a94a;
	}
	.reception-calculator {
		position: absolute;
		right: 15%;
		top: 62px;
		z-index: 3;
		width: 27px;
		height: 32px;
		box-sizing: border-box;
		padding: 4px 3px;
		background: #50483a;
		border: 2px solid #1d1710;
		box-shadow: inset 1px 1px #88795c;
	}
	.reception-calculator i {
		display: inline-block;
		width: 4px;
		height: 4px;
		margin: 2px 1px 0 0;
		background: #d5bd73;
	}
	.reception-calculator b {
		display: block;
		margin-bottom: 1px;
		color: #f4d47a;
		font-size: 6px;
	}
	.reception-coffee {
		position: absolute;
		right: 5%;
		top: 50px;
		z-index: 3;
		width: 17px;
		height: 20px;
	}
	.reception-coffee i {
		position: absolute;
		left: 2px;
		bottom: 0;
		width: 12px;
		height: 12px;
		background: #f0dfb0;
		border: 2px solid #2a1a0d;
		border-radius: 0 0 4px 4px;
	}
	.reception-coffee b {
		position: absolute;
		left: 5px;
		top: 0;
		width: 4px;
		height: 8px;
		border-left: 2px solid rgba(255, 239, 197, 0.55);
		border-right: 2px solid rgba(255, 239, 197, 0.35);
	}
	.lobby-lounge {
		position: absolute;
		right: 8%;
		bottom: 23%;
		z-index: 1;
		width: 150px;
		height: 80px;
	}
	.lounge-seat {
		position: absolute;
		bottom: 0;
		width: 58px;
		height: 35px;
		background: #3f3440;
		border: 3px solid #1d1515;
		box-shadow: inset 0 0 0 2px #765364;
	}
	.lounge-seat.one { left: 0; }
	.lounge-seat.two { right: 0; }
	.lounge-table {
		position: absolute;
		left: 65px;
		bottom: 12px;
		width: 22px;
		height: 10px;
		background: #b18a4d;
		border: 2px solid #2a1b10;
	}
	.lounge-table::after {
		content: '';
		position: absolute;
		left: 8px;
		top: 10px;
		width: 3px;
		height: 23px;
		background: #2e2116;
	}
	.lobby-plant {
		position: absolute;
		left: 5%;
		bottom: 22%;
		z-index: 2;
		width: 44px;
		height: 78px;
	}
	.plant-pot {
		position: absolute;
		left: 9px;
		bottom: 0;
		width: 26px;
		height: 23px;
		background: linear-gradient(90deg, #8b3f28, #b86736, #6d2d20);
		border: 3px solid #2b180e;
		clip-path: polygon(0 0, 100% 0, 86% 100%, 14% 100%);
	}
	.plant-leaf {
		position: absolute;
		bottom: 19px;
		width: 12px;
		height: 45px;
		background: #315f3c;
		border: 2px solid #152a1a;
		border-radius: 80% 0 80% 0;
		transform-origin: bottom center;
	}
	.plant-leaf.a { left: 8px; transform: rotate(-28deg); }
	.plant-leaf.b { left: 16px; bottom: 25px; height: 50px; }
	.plant-leaf.c { right: 5px; transform: rotate(28deg); }
	.lobby-news {
		position: absolute;
		right: 5%;
		top: 43%;
		z-index: 2;
		box-sizing: border-box;
		width: 138px;
		padding: 7px;
		background: #e1d7b9;
		border: 3px solid #382719;
		box-shadow: 3px 4px 0 rgba(0, 0, 0, 0.35);
		color: #382719;
		font-family: 'Courier New', monospace;
		transform: rotate(2deg);
	}
	.lobby-news b,
	.lobby-news span {
		display: block;
	}
	.lobby-news b {
		padding-bottom: 4px;
		border-bottom: 2px solid #6d5334;
		font-size: 10px;
		letter-spacing: 0.16em;
	}
	.lobby-news span {
		margin-top: 6px;
		font-size: 6px;
		line-height: 1.35;
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
		.lobby-columns i {
			width: 18px;
		}
		.lobby-ceiling-lights {
			left: 5%;
			right: 5%;
		}
		.lobby-ceiling-lights i {
			width: 30px;
			height: 4px;
		}
		.lobby-sign {
			top: 9%;
			width: min(66vw, 280px);
			padding: 6px;
			column-gap: 5px;
		}
		.lobby-sign-mark {
			width: 28px;
			height: 24px;
			font-size: 9px;
		}
		.lobby-sign strong {
			font-size: 8px;
		}
		.lobby-sign small {
			font-size: 5px;
		}
		.lobby-directory {
			left: 3%;
			top: 18%;
			width: 126px;
			padding: 6px;
		}
		.lobby-directory b {
			font-size: 7px;
		}
		.lobby-directory span {
			margin-top: 5px;
			font-size: 6px;
		}
		.lobby-directory small {
			font-size: 4px;
		}
		.lobby-clock {
		top: 18%;
			right: 3%;
			width: 48px;
			padding: 5px 3px 3px;
		}
		.lobby-clock b {
			font-size: 7px;
		}
		.lobby-clock small {
			font-size: 4px;
		}
		.lobby-reception {
			bottom: 22%;
			width: 76vw;
			height: 92px;
		}
		.reception-front {
			height: 52px;
			padding-top: 23px;
		}
		.reception-front strong {
			font-size: 8px;
		}
		.reception-front small {
			font-size: 4px;
		}
		.reception-monitor {
			left: 32%;
			width: 86px;
			height: 38px;
			padding: 5px 4px;
			font-size: 4px;
		}
		.reception-monitor b {
			margin-top: 4px;
			font-size: 6px;
		}
		.reception-monitor::after {
			left: 32px;
			bottom: -12px;
			width: 18px;
			height: 10px;
		}
		.reception-keyboard {
			left: 12%;
			top: 47px;
			grid-template-columns: repeat(5, 5px);
			gap: 2px;
			padding: 3px;
		}
		.reception-keyboard i {
			width: 5px;
			height: 4px;
		}
		.reception-phone {
			left: 5%;
			top: 54px;
			transform: scale(0.8);
			transform-origin: top left;
		}
		.reception-calculator {
			right: 13%;
			top: 52px;
			transform: scale(0.8);
			transform-origin: top right;
		}
		.reception-coffee {
			right: 3%;
			top: 44px;
			transform: scale(0.8);
			transform-origin: top right;
		}
		.lobby-lounge {
			right: 3%;
			bottom: 23%;
			transform: scale(0.62);
			transform-origin: bottom right;
		}
		.lobby-plant {
			left: 2%;
			bottom: 22%;
			transform: scale(0.7);
			transform-origin: bottom left;
		}
		.lobby-news {
			right: 3%;
			top: 40%;
			width: 92px;
			padding: 5px;
		}
		.lobby-news b {
			font-size: 7px;
		}
		.lobby-news span {
			font-size: 4px;
		}
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
