<script lang="ts">
	import { onMount } from 'svelte';
	import Skyline from './Skyline.svelte';
	import RainLayer from './RainLayer.svelte';
	import SnowLayer from './SnowLayer.svelte';
	import { initialSimClock, tickSimClock, SIM_MINUTES_PER_REAL_SECOND } from '$lib/weather/timeCycle';
	import type { SimClockState } from '$lib/data/types';

	let { onEnter = () => {} }: { onEnter?: () => void } = $props();

	let reduceMotion = $state(false);
	let wideViewport = $state(false);
	// Same clock, same seed, same tick as the trading floor (TradingFloor.svelte) - the skyline here
	// runs through dawn/day/golden/dusk/night exactly the way it does on the floor. No UFO, ever:
	// ufoActive is hardcoded false below, this page never imports the UFO event module.
	let clock = $state<SimClockState>(initialSimClock());

	onMount(() => {
		reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		const wideQuery = window.matchMedia?.('(max-aspect-ratio: 2/1)');
		const updateWideViewport = () => { wideViewport = wideQuery?.matches ?? false; };
		updateWideViewport();
		wideQuery?.addEventListener('change', updateWideViewport);
		if (reduceMotion) return () => wideQuery?.removeEventListener('change', updateWideViewport);
		let raf = 0;
		let last = performance.now();
		let totalSimMinutes = 0;
		const loop = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			totalSimMinutes += dt * SIM_MINUTES_PER_REAL_SECOND;
			clock = tickSimClock(clock, dt, totalSimMinutes);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(raf);
			wideQuery?.removeEventListener('change', updateWideViewport);
		};
	});

	// Lanes are fixed px offsets (not %) so a tall pedestrian in the back lane never has its head
	// clipped by the sidewalk's own fixed-height overflow:hidden.
	type Walker = {
		id: number; lane: number; delay: number; dur: number; dir: 1 | -1; dog: boolean; scale: number;
		skin: string; hair: string; outfit: string; female: boolean; dogFur: string;
	};
	const walkers: Walker[] = [
		{ id: 0, lane: 0, delay: 0, dur: 26, dir: 1, dog: false, scale: 1, skin: '#c88752', hair: '#1d0e08', outfit: '#355a48', female: false, dogFur: '#6a4a2c' },
		{ id: 1, lane: 12, delay: 3, dur: 22, dir: -1, dog: true, scale: 0.95, skin: '#e1b68d', hair: '#6a4937', outfit: '#5f3a55', female: true, dogFur: '#9c8058' },
		{ id: 2, lane: 0, delay: 9, dur: 30, dir: -1, dog: false, scale: 0.9, skin: '#6e4028', hair: '#0f0c0a', outfit: '#4b5366', female: false, dogFur: '#6a4a2c' },
		{ id: 3, lane: 24, delay: 5, dur: 24, dir: 1, dog: true, scale: 1.05, skin: '#edc49d', hair: '#a8783b', outfit: '#6c4055', female: true, dogFur: '#2c2621' },
		{ id: 4, lane: 12, delay: 14, dur: 27, dir: 1, dog: false, scale: 0.88, skin: '#8b5638', hair: '#130f0c', outfit: '#304562', female: false, dogFur: '#6a4a2c' },
		{ id: 5, lane: 24, delay: 18, dur: 21, dir: -1, dog: false, scale: 1, skin: '#b9784f', hair: '#23120b', outfit: '#6a3f3f', female: true, dogFur: '#6a4a2c' }
	];

	type Cat = { id: number; x: number; y: number; delay: number; dur: number };
	const cats: Cat[] = [
		{ id: 0, x: 12, y: 88, delay: 0, dur: 34 },
		{ id: 1, x: 68, y: 92, delay: 8, dur: 40 }
	];

	const trees = [6, 30, 62, 74, 94];

	// Two real, widely recognized NYC skyscrapers rendered as their own tall silhouettes beside One
	// WTC - Empire State Building's setback crown and antenna, and the Chrysler Building's terraced
	// Art Deco spire. <Skyline>'s own city (reused below for lighting/weather parity with the floor)
	// already reaches both edges of the frame on its own, so these sit in the open gaps beside the
	// tower rather than adding a second competing row of filler buildings.
</script>

<div class="home">
	<div class="skyline-wrap">
		<div class="skyline-bg" aria-hidden="true">
			<Skyline
				phase={clock.phase}
				outdoorLux={clock.outdoorLux}
				raining={clock.raining}
				snowing={clock.snowing}
				theme="nyc"
				landmarkOffsetX={wideViewport ? -270 : -470}
				ufoActive={false}
				ufoFrame={0}
				{reduceMotion}
			/>
			<RainLayer intensity={clock.rainIntensity} />
			<SnowLayer intensity={clock.snowIntensity} {reduceMotion} />
		</div>

		<div class="flank-buildings" aria-hidden="true">
			<!-- Chrysler Building: terraced Art Deco crown tapering to a needle spire. -->
			<svg class="landmark chrysler" style:left="83%" style:height="60%" viewBox="0 0 50 180" preserveAspectRatio="xMidYMax meet">
				<rect x="5" y="100" width="40" height="80" />
				<rect x="10" y="75" width="30" height="25" />
				<polygon points="15,75 35,75 31,45 19,45" />
				<rect x="23" y="10" width="4" height="35" />
				<polygon points="23,10 27,10 25,0" />
			</svg>
		</div>

		<!-- One World Trade Center: square base chamfering into a tapering octagon, glass curtain
		     wall, spire reaching 1,776 ft (symbolic height). Viewed from the plaza looking up. -->
		<div class="tower-wrap" aria-hidden="true">
			<svg class="tower" viewBox="0 0 400 900" preserveAspectRatio="xMidYMax meet">
				<defs>
					<linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stop-color="#2a3f57" />
						<stop offset="45%" stop-color="#6f93b8" />
						<stop offset="55%" stop-color="#7fa3c4" />
						<stop offset="100%" stop-color="#233247" />
					</linearGradient>
					<linearGradient id="glassDark" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stop-color="#1c2a3b" />
						<stop offset="50%" stop-color="#3c5674" />
						<stop offset="100%" stop-color="#162131" />
					</linearGradient>
				</defs>
				<!-- neighboring low-rise podiums for scale -->
				<g fill="#1a2230">
					<rect x="0" y="620" width="70" height="280" />
					<rect x="330" y="600" width="70" height="300" />
				</g>
				<!-- chamfered shaft: base square tapering, corner facets suggested via angled edge strips -->
				<polygon points="90,900 310,900 300,120 100,120" fill="url(#glass)" />
				<polygon points="90,900 130,900 138,120 100,120" fill="url(#glassDark)" opacity="0.65" />
				<polygon points="270,900 310,900 300,120 262,120" fill="url(#glassDark)" opacity="0.65" />
				<!-- parapet / crown -->
				<rect x="100" y="105" width="200" height="18" fill="#1c2836" />
				<!-- spire mast -->
				<rect x="194" y="10" width="12" height="98" fill="#2a3646" />
				<rect x="197" y="0" width="6" height="14" fill="#8fb4d6" class="beacon" />
				<!-- window grid -->
				<g class="window-grid" opacity="0.5">
					{#each Array(26) as _, row (row)}
						<rect x="96" y={130 + row * 30} width="208" height="2" fill="#101823" />
					{/each}
				</g>
			</svg>
			<!-- Small tenant plaque near the lobby doors - not on the tower itself. -->
			<div class="tenant-plaque">
				<span>PHF</span>
				<small>Floor 84</small>
			</div>
		</div>
	</div>

	<!-- Sidewalk: trees, benches, a curb, streetlamps, and foot traffic in their own strip. -->
	<div class="sidewalk" aria-hidden="true">
		<div class="curb"></div>
		<div class="lamp" style:left="38%"><span class="lamp-post"></span><span class="lamp-head"></span><span class="lamp-glow"></span></div>
		<div class="lamp" style:left="90%"><span class="lamp-post"></span><span class="lamp-head"></span><span class="lamp-glow"></span></div>

		<div class="bench" style:left="15%"><span class="bench-back"></span><span class="bench-seat"></span><span class="bench-leg l"></span><span class="bench-leg r"></span></div>
		<div class="bench" style:left="48%"><span class="bench-back"></span><span class="bench-seat"></span><span class="bench-leg l"></span><span class="bench-leg r"></span></div>
		<div class="bench" style:left="82%"><span class="bench-back"></span><span class="bench-seat"></span><span class="bench-leg l"></span><span class="bench-leg r"></span></div>

		{#each trees as tx, i (i)}
			<div class="tree" style:left="{tx}%">
				<span class="tree-trunk"></span>
				<span class="tree-canopy back"></span>
				<span class="tree-canopy mid"></span>
				<span class="tree-canopy front"></span>
			</div>
		{/each}

		<div class="foot-traffic">
			{#each walkers as w (w.id)}
				<div
					class="walker"
					class:reverse={w.dir === -1}
					style:--lane="{w.lane}px"
					style:--delay="{w.delay}s"
					style:--dur="{w.dur}s"
					style:--sc={w.scale}
				>
					<div class="figure" style:--skin={w.skin} style:--hair={w.hair} style:--outfit={w.outfit}>
						<div class="head"><i class="eye"></i></div>
						{#if w.female}<div class="hair-back"></div>{/if}
						<div class="hair" class:female={w.female}></div>
						<div class="torso"></div>
						<div class="leg l"></div>
						<div class="leg r"></div>
					</div>
					{#if w.dog}
						<div class="leash"></div>
						<div class="dog" style:--fur={w.dogFur}>
							<div class="dog-tail"></div>
							<div class="dog-body"></div>
							<div class="dog-head"><div class="dog-ear"></div></div>
							<div class="dog-leg l"></div>
							<div class="dog-leg r"></div>
						</div>
					{/if}
				</div>
			{/each}

			{#each cats as c (c.id)}
				<div class="cat" style:--cx="{c.x}%" style:--delay="{c.delay}s" style:--dur="{c.dur}s">
					<svg viewBox="0 0 16 10" width="28" height="18">
						<path d="M1 9 L1 6 Q1 3 4 3 L6 1 L6 3 L10 3 L11 1 L11 3 Q14 3 14 6 L14 9 Z" fill="#37312a" stroke="#181410" stroke-width="0.5" stroke-linejoin="round" />
						<circle cx="12" cy="5.4" r="0.5" fill="#e8c98a" />
					</svg>
				</div>
			{/each}
		</div>
	</div>

	<div class="plaza">
		<!-- National September 11 Memorial, at the site widely known as Ground Zero: twin reflecting
		     pools ("Reflecting Absence") set in the original towers' footprints, ringed by bronze
		     parapets, plus the Survivor Tree - a real Callery pear that lived through the attack and
		     was replanted here. Given its own clear space, never crowded by UI text or foot traffic,
		     and kept still and non-interactive - keep it that way in future edits. -->
		<div class="memorial-zone">
			<!-- The sign and tree are positioned independently of the pools so they never pull the
			     pools off dead-center - only the two pools drive the centering here. -->
			<div
				class="memorial"
				role="img"
				aria-label="National September 11 Memorial at Ground Zero. 'Reflecting Absence': two one-acre reflecting pools set within the original Twin Towers' footprints, the largest man-made waterfalls in North America, ringed by bronze parapets inscribed with the names of the 2,977 people killed on September 11, 2001 and the six killed in the 1993 World Trade Center bombing. Beside them stands the Survivor Tree, a Callery pear that lived through the attack and was replanted here. In memory."
			>
				<div class="pool" title="North Pool">
					<div class="pool-parapet" aria-hidden="true"></div>
					<div class="pool-water"></div>
					<div class="pool-void"></div>
				</div>
				<div class="pool" title="South Pool">
					<div class="pool-parapet" aria-hidden="true"></div>
					<div class="pool-water"></div>
					<div class="pool-void"></div>
				</div>
			</div>

			<div class="ground-zero-sign" aria-hidden="true"><span>GROUND ZERO</span></div>

			<div class="survivor-tree" aria-hidden="true">
				<span class="tree-trunk"></span>
				<span class="tree-canopy back"></span>
				<span class="tree-canopy mid"></span>
				<span class="tree-canopy front blossom"></span>
				<small>Survivor Tree</small>
			</div>

			<p class="memorial-plaque">Reflecting Absence &middot; In memory &middot; September 11, 2001</p>
			<p class="memorial-caption">Twin one-acre pools in the towers' footprints &middot; the largest man-made waterfalls in North America</p>
		</div>

		<div class="hero-foot">
			<h1>PIXEL HEDGE FUND</h1>
			<p>One World Trade Center &middot; Lower Manhattan</p>
			<button type="button" class="enter-btn" onclick={onEnter}>ACCESS THE FLOOR</button>
		</div>
	</div>
</div>

<style>
	.home {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 100vh;
		min-height: 100dvh;
		overflow-x: hidden;
		overflow-y: auto;
	overscroll-behavior-x: none;
		background: #78451f;
		font-family: 'Courier New', monospace;
		color: #eee6d4;
	}

	/* Sky + skyline: takes all leftover vertical space above the sidewalk/plaza, with a floor so the
	   tower and flanking buildings are never crushed on a short viewport. */
	.skyline-wrap {
		position: relative;
		flex: 1 1 auto;
		min-height: 260px;
		overflow: hidden;
	}
	.skyline-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.flank-buildings {
		position: absolute;
		inset: 0;
		z-index: 1;
	}
	/* The Chrysler silhouette sits on the far right of the home skyline. */
	.landmark {
		position: absolute;
		bottom: 0;
		width: 7%;
		fill: #241a12;
		stroke: rgba(217, 169, 74, 0.4);
		stroke-width: 1.5;
		filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.7));
	}

	.tower-wrap {
		position: absolute;
		left: 50%;
		top: 32px;
		bottom: 0;
		width: min(52vw, 460px);
		transform: translateX(-50%);
		z-index: 2;
	}
	.tower {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.beacon {
		animation: beacon-pulse 2.4s ease-in-out infinite;
	}
	@keyframes beacon-pulse {
		50% {
			opacity: 0.55;
		}
	}
	.tenant-plaque {
		position: absolute;
		left: 50%;
		bottom: 78%;
		transform: translateX(-50%);
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 3px 8px;
		background: rgba(10, 14, 20, 0.6);
		border: 1px solid rgba(217, 169, 74, 0.55);
		font-size: 9px;
		letter-spacing: 0.08em;
		color: #d9a94a;
		opacity: 0.92;
	}
	.tenant-plaque small {
		font-size: 7px;
		color: #b7a888;
		letter-spacing: 0.06em;
	}

	/* Sidewalk: its own fixed-height strip so trees, benches, and foot traffic never compete with
	   the skyline or the memorial for space. */
	.sidewalk {
		position: relative;
		flex: 0 0 auto;
		height: 96px;
		background: repeating-linear-gradient(90deg, #6b6255 0 64px, #5c5347 64px 66px);
		overflow: hidden;
	}
	.curb {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 6px;
		background: linear-gradient(180deg, #857a68 0%, #453d33 100%);
		border-bottom: 2px solid #2e2820;
		z-index: 1;
	}
	.foot-traffic {
		position: absolute;
		inset: 0;
		z-index: 2;
	}

	.lamp {
		position: absolute;
		bottom: 8px;
		width: 4px;
		height: 88px;
		z-index: 1;
	}
	.lamp-post {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 3px;
		height: 88px;
		background: linear-gradient(90deg, #1f2622, #3a453e);
		border: 1px solid #12160f;
	}
	.lamp-head {
		position: absolute;
		top: -3px;
		left: -4px;
		width: 11px;
		height: 8px;
		background: #2c352e;
		border: 1px solid #12160f;
		border-radius: 2px 2px 5px 5px;
	}
	.lamp-glow {
		position: absolute;
		top: 3px;
		left: -6px;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 214, 140, 0.55) 0%, transparent 70%);
	}

	.bench {
		position: absolute;
		bottom: 8px;
		width: 30px;
		height: 16px;
		z-index: 1;
	}
	.bench-seat {
		position: absolute;
		bottom: 4px;
		left: 0;
		width: 30px;
		height: 3px;
		background: repeating-linear-gradient(90deg, #7a5a35 0 4px, #5c4226 4px 5px);
		border: 1px solid #3a2a18;
	}
	.bench-back {
		position: absolute;
		bottom: 7px;
		left: 2px;
		width: 26px;
		height: 8px;
		background: repeating-linear-gradient(90deg, #7a5a35 0 4px, #5c4226 4px 5px);
		border: 1px solid #3a2a18;
	}
	.bench-leg {
		position: absolute;
		bottom: 0;
		width: 2px;
		height: 5px;
		background: #3a2a18;
	}
	.bench-leg.l {
		left: 2px;
	}
	.bench-leg.r {
		left: 26px;
	}

	/* Trees: bigger, layered canopy (back/mid/front blobs) for a fuller, less flat silhouette. */
	.tree {
		position: absolute;
		bottom: 2px;
		width: 22px;
		height: 44px;
		z-index: 1;
	}
	.tree-trunk {
		position: absolute;
		left: 9px;
		bottom: 0;
		width: 4px;
		height: 16px;
		background: linear-gradient(90deg, #4a3a24, #2c2114);
		border: 1px solid #1d1710;
	}
	.tree-canopy {
		position: absolute;
		left: 1px;
		bottom: 12px;
		width: 20px;
		height: 26px;
		border-radius: 50% 50% 45% 45%;
		border: 1px solid #1d2b1c;
	}
	.tree-canopy.back {
		background: #2e4a2c;
		opacity: 0.85;
	}
	.tree-canopy.mid {
		left: 4px;
		bottom: 16px;
		width: 15px;
		height: 20px;
		background: #3d5a3a;
	}
	.tree-canopy.front {
		left: 6px;
		bottom: 20px;
		width: 10px;
		height: 13px;
		background: #4f7048;
		border-color: transparent;
		box-shadow: inset -2px -2px rgba(0, 0, 0, 0.2);
	}

	/* Plaza: memorial + hero text share one continuous paved ground so they read as a single
	   space, but each keeps its own fixed-size row - no percentage-of-viewport overlap is possible. */
	/* Same wood tones as the foreground desk on the trading floor (TradingFloor.svelte
	   .foreground-desk), so the plaza ground reads as the same "room" as the rest of the site. */
	.plaza {
		flex: 0 0 auto;
		background: linear-gradient(180deg, #78451f 0%, #3d2516 100%);
	}

	.memorial-zone {
		position: relative;
		padding: 14px 0 10px;
		text-align: center;
	}
	.memorial {
		position: relative;
		display: flex;
		justify-content: center;
		gap: 4%;
		align-items: flex-end;
	}
	/* Positioned just outside the pool cluster (not inside the centering flex row above), so it
	   labels the spot without pulling the pools off dead-center. */
	.ground-zero-sign {
		position: absolute;
		left: 27%;
		bottom: 16px;
		padding: 2px 6px;
		background: #1c2b20;
		border: 1px solid #0f1a13;
		box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5);
		transform: rotate(-1.5deg);
	}
	.ground-zero-sign span {
		font-size: 7px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: #eaf2e6;
		white-space: nowrap;
	}
	.pool {
		position: relative;
		width: min(15vw, 150px);
		height: min(7.5vw, 75px);
		background: #16191b;
		border: 3px solid #7a5a35;
		box-shadow: inset 0 0 0 2px #3a2f1f, 0 3px 8px rgba(0, 0, 0, 0.45);
	}
	/* Bronze parapet: a fine inscribed-line texture around the pool edge, standing in for the
	   real memorial's engraved victim names without fabricating any specific text. */
	.pool-parapet {
		position: absolute;
		inset: -3px;
		border: 3px solid transparent;
		background:
			repeating-linear-gradient(90deg, rgba(20, 14, 6, 0.55) 0 1px, transparent 1px 3px) top / 100% 3px no-repeat,
			repeating-linear-gradient(90deg, rgba(20, 14, 6, 0.55) 0 1px, transparent 1px 3px) bottom / 100% 3px no-repeat;
		pointer-events: none;
	}
	.pool-water {
		position: absolute;
		inset: 5px;
		background: radial-gradient(ellipse at 50% 28%, #2a3a44 0%, #12181c 75%);
		animation: pool-shimmer 6s ease-in-out infinite;
	}
	.pool-void {
		position: absolute;
		left: 32%;
		top: 30%;
		width: 36%;
		height: 40%;
		background: #05070a;
		box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.85);
	}
	@keyframes pool-shimmer {
		0%,
		100% {
			opacity: 0.92;
		}
		50% {
			opacity: 1;
		}
	}
	.memorial-plaque {
		margin: 12px 0 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: #f3ead2;
		text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.6);
	}
	.memorial-caption {
		margin: 4px 0 0;
		font-size: 8px;
		letter-spacing: 0.04em;
		color: #e2d3ac;
		text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5);
	}

	/* The Survivor Tree: right beside the pools (not off on its own), slightly larger than the
	   sidewalk's street trees, with a warmer blossoming canopy and its own label - a real,
	   documented detail of the actual memorial plaza. */
	.survivor-tree {
		position: absolute;
		right: 27%;
		bottom: 2px;
		width: 26px;
		height: 52px;
	}
	.survivor-tree .tree-trunk {
		left: 11px;
		height: 18px;
	}
	.survivor-tree .tree-canopy {
		left: 1px;
		bottom: 14px;
		width: 24px;
		height: 30px;
	}
	.survivor-tree .tree-canopy.mid {
		left: 5px;
		bottom: 19px;
		width: 17px;
		height: 22px;
		background: #4a6a3f;
	}
	.survivor-tree .tree-canopy.front.blossom {
		left: 7px;
		bottom: 24px;
		width: 12px;
		height: 15px;
		background: #6f8a4a;
		box-shadow: inset -2px -2px rgba(0, 0, 0, 0.18);
	}
	.survivor-tree .tree-canopy.front.blossom::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 2px;
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: #f3ead6;
		box-shadow:
			5px 2px 0 #f3ead6,
			2px 6px 0 #f3ead6,
			7px 7px 0 #f3ead6;
		opacity: 0.85;
	}
	.survivor-tree small {
		position: absolute;
		left: 50%;
		bottom: -11px;
		transform: translateX(-50%);
		white-space: nowrap;
		font-size: 6px;
		letter-spacing: 0.05em;
		color: #cbbc98;
		opacity: 0.85;
	}

	.cat {
		position: absolute;
		left: var(--cx);
		bottom: 10%;
		animation: cat-wander var(--dur) ease-in-out var(--delay) infinite;
	}
	@keyframes cat-wander {
		0%,
		100% {
			transform: translateX(0) scaleX(1);
		}
		45% {
			transform: translateX(26px) scaleX(1);
		}
		50% {
			transform: translateX(26px) scaleX(-1);
		}
		95% {
			transform: translateX(0) scaleX(-1);
		}
	}

	.walker {
		position: absolute;
		left: -6%;
		bottom: var(--lane);
		animation: walk-across var(--dur) linear var(--delay) infinite;
	}
	.walker.reverse {
		animation-name: walk-across-rev;
	}
	@keyframes walk-across {
		from {
			transform: translateX(0) scale(var(--sc));
		}
		to {
			transform: translateX(112vw) scale(var(--sc));
		}
	}
	@keyframes walk-across-rev {
		from {
			left: auto;
			right: -6%;
			transform: translateX(0) scale(var(--sc)) scaleX(-1);
		}
		to {
			left: auto;
			right: -6%;
			transform: translateX(-112vw) scale(var(--sc)) scaleX(-1);
		}
	}
	.figure {
		position: relative;
		width: 14px;
		height: 34px;
	}
	.head {
		position: absolute;
		top: 1px;
		left: 3px;
		width: 7px;
		height: 7px;
		background: var(--skin, #d8a375);
		border: 1px solid #1d120c;
		border-radius: 50%;
		z-index: 2;
	}
	.eye {
		position: absolute;
		top: 3px;
		right: 1px;
		width: 1px;
		height: 1px;
		background: #1d120c;
	}
	.hair {
		position: absolute;
		top: -1px;
		left: 2px;
		width: 9px;
		height: 4px;
		background: var(--hair, #25150e);
		border: 1px solid #1d120c;
		border-bottom: none;
		border-radius: 4px 4px 0 0;
		z-index: 3;
	}
	.hair.female {
		height: 6px;
		left: 1.5px;
		width: 10px;
	}
	.hair-back {
		position: absolute;
		top: 1px;
		left: 1px;
		width: 11px;
		height: 12px;
		background: var(--hair, #25150e);
		border: 1px solid #1d120c;
		border-radius: 3px 3px 5px 5px;
		z-index: 1;
	}
	.torso {
		position: absolute;
		top: 8px;
		left: 0;
		width: 14px;
		height: 13px;
		background: var(--outfit, #26364a);
		border: 1px solid #1d120c;
		z-index: 2;
	}
	.leg {
		position: absolute;
		top: 21px;
		width: 5px;
		height: 12px;
		background: #17222f;
		border: 1px solid #100b07;
		transform-origin: top center;
		animation: leg-swing 0.55s ease-in-out infinite;
	}
	.leg.l {
		left: 0;
	}
	.leg.r {
		left: 9px;
		animation-delay: 0.275s;
	}
	@keyframes leg-swing {
		0%,
		100% {
			transform: rotate(18deg);
		}
		50% {
			transform: rotate(-18deg);
		}
	}
	.leash {
		position: absolute;
		left: -17px;
		top: 17px;
		width: 17px;
		height: 1px;
		background: #6a5638;
		transform: rotate(6deg);
	}
	.dog {
		position: absolute;
		left: -37px;
		top: 18px;
		width: 20px;
		height: 16px;
	}
	.dog-body {
		position: absolute;
		inset: 0 6px 4px 0;
		background: var(--fur, #6a4a2c);
		border: 1px solid #1d120c;
		border-radius: 4px 2px 2px 3px;
		z-index: 1;
	}
	/* The dog's head sits on its leash side (near the walker) and its tail trails on the far side,
	   so it visibly faces the same direction of travel as the walker leading it. */
	.dog-head {
		position: absolute;
		right: 0;
		top: -2px;
		width: 8px;
		height: 8px;
		background: var(--fur, #6a4a2c);
		border: 1px solid #1d120c;
		border-radius: 2px;
	}
	.dog-ear {
		position: absolute;
		right: 1px;
		top: -3px;
		width: 3px;
		height: 4px;
		background: #4a3220;
		clip-path: polygon(0 100%, 50% 0, 100% 100%);
	}
	.dog-tail {
		position: absolute;
		left: -4px;
		top: 1px;
		width: 5px;
		height: 2px;
		background: #4a3220;
		transform: rotate(30deg);
		transform-origin: right center;
	}
	.dog-leg {
		position: absolute;
		top: 10px;
		width: 4px;
		height: 7px;
		background: #4a3220;
		border: 1px solid #1d120c;
		box-sizing: border-box;
		z-index: 0;
		animation: leg-swing 0.4s ease-in-out infinite;
	}
	.dog-leg.l {
		left: 6px;
	}
	.dog-leg.r {
		left: 13px;
		animation-delay: 0.2s;
	}

	.hero-foot {
		padding: 18px 16px 28px;
		text-align: center;
		text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6);
	}
	.hero-foot h1 {
		margin: 0;
		font-size: clamp(20px, 4vw, 32px);
		letter-spacing: 0.14em;
		color: #f0e4cf;
	}
	.hero-foot p {
		margin: 4px 0 16px;
		font-size: 11px;
		letter-spacing: 0.08em;
		color: #d9a94a;
	}
	.enter-btn {
		padding: 12px 28px;
		background: #d9a94a;
		color: #241914;
		border: 3px solid #241914;
		font: 700 13px/1 'Courier New', monospace;
		letter-spacing: 0.12em;
		cursor: pointer;
		box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.5);
	}
	.enter-btn:hover,
	.enter-btn:focus-visible {
		background: #efc370;
		outline: 3px solid #f8efdc;
		outline-offset: 4px;
	}

	@media (prefers-reduced-motion: reduce) {
		.beacon,
		.pool-water,
		.cat,
		.walker,
		.leg,
		.dog-leg {
			animation: none !important;
		}
	}

	@media (max-width: 640px) {
		.home {
			min-height: 100dvh;
		}
		.skyline-wrap {
			min-height: 230px;
			flex-basis: 230px;
		}
		.tower-wrap {
			top: 20px;
			width: 84vw;
		}
		.tenant-plaque {
			bottom: 75%;
			padding: 2px 5px;
			font-size: 7px;
		}
		.tenant-plaque small {
			font-size: 5px;
		}
		.sidewalk {
			height: 76px;
		}
		.lamp {
			height: 72px;
		}
		.lamp-post {
			height: 72px;
		}
		.survivor-tree {
			display: none;
		}
		.ground-zero-sign {
			left: 5%;
			bottom: 14px;
			padding: 2px 4px;
		}
		.memorial-plaque {
			font-size: 8px;
		}
		.memorial-caption {
			padding: 0 12px;
			font-size: 6px;
			line-height: 1.35;
		}
		.hero-foot h1 {
			font-size: 18px;
		}
		.hero-foot p {
			font-size: 8px;
		}
		.enter-btn {
			max-width: calc(100vw - 40px);
			padding: 11px 16px;
			font-size: 11px;
		}
	}
</style>
