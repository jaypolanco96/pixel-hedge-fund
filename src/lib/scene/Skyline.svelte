<script lang="ts">
	import type { DayPhase } from '$lib/data/types';
	import { skyColors } from '$lib/weather/timeCycle';

	let {
		phase,
		outdoorLux,
		raining,
		snowing = false,
		kongActive = false,
		kongFrame = 0,
		reduceMotion = false
	}: {
		phase: DayPhase;
		outdoorLux: number;
		raining: boolean;
		snowing?: boolean;
		kongActive?: boolean;
		kongFrame?: number;
		reduceMotion?: boolean;
	} = $props();

	const sky = $derived(skyColors(phase));
	const night = $derived(phase === 'night' || phase === 'dusk');
	const showSun = $derived(phase === 'golden' || phase === 'dusk' || phase === 'dawn');
	const sunPhase = $derived(
		phase === 'dawn' ? 'dawn' : phase === 'golden' ? 'golden' : phase === 'dusk' ? 'dusk' : 'off'
	);

	/** Birds fly in dawn/day/golden; roost sparsely at dusk; hide at night & when Kong is up. */
	const birdMode = $derived.by((): 'fly' | 'roost' | 'hidden' => {
		if (kongActive) return 'hidden';
		if (phase === 'night') return 'hidden';
		if (phase === 'dusk') return 'roost';
		return 'fly'; // dawn, day, golden
	});

	const flyingBirds = $derived.by(() => {
		if (birdMode !== 'fly') return [] as { id: number; y: number; delay: number; dur: number; scale: number; v: boolean }[];
		// Sparse V-formation + a couple of loners
		return [
			{ id: 0, y: 22, delay: 0, dur: 28, scale: 1, v: false },
			{ id: 1, y: 36, delay: 4, dur: 32, scale: 0.85, v: true },
			{ id: 2, y: 48, delay: 9, dur: 26, scale: 0.9, v: false },
			{ id: 3, y: 28, delay: 14, dur: 34, scale: 0.75, v: true },
			{ id: 4, y: 55, delay: 18, dur: 30, scale: 0.8, v: false }
		];
	});

	/** Helicopters: positions cycle; when Kong swipes, they tumble. */
	const helis = $derived.by(() => {
		if (!kongActive) return [] as { x: number; y: number; tumble: boolean; id: number }[];
		const swipe = kongFrame >= 8 && kongFrame < 22;
		return [
			{ id: 0, x: 250 + (kongFrame % 6) * 2, y: 18, tumble: swipe && kongFrame % 3 === 0 },
			{ id: 1, x: 380 - (kongFrame % 5) * 3, y: 28, tumble: swipe && kongFrame % 3 === 1 },
			{ id: 2, x: 310 + Math.sin(kongFrame / 2) * 12, y: 8, tumble: swipe }
		];
	});

	const kongPose = $derived.by(() => {
		if (!kongActive) return 'hidden';
		if (kongFrame < 4) return 'climb';
		if (kongFrame < 8) return 'roar';
		if (kongFrame < 22) return 'swipe';
		return 'fade';
	});

	const festive = $derived(snowing);
</script>

<div
	class="sky"
	class:raining
	class:snowing
	class:reduce-motion={reduceMotion}
	data-sun={sunPhase}
	style:--sky-top={sky.top}
	style:--sky-mid={sky.mid}
	style:--sky-bottom={sky.bottom}
	style:--wash={sky.wash}
	style:--lux={outdoorLux}
>
	<div class="gradient"></div>
	<div class="wash"></div>

	<!-- Sun sits BEHIND the skyline silhouette (intentional golden-hour orb). -->
	{#if showSun}
		<div class="sun-wrap" class:dawn={sunPhase === 'dawn'} class:golden={sunPhase === 'golden'} class:dusk={sunPhase === 'dusk'} aria-hidden="true">
			<div class="sun-glow outer"></div>
			<div class="sun-glow mid"></div>
			<div class="sun-core"></div>
			<div class="sun-rim"></div>
		</div>
	{/if}

	<div class="haze"></div>

	<!-- Pixel birds in the sky (diegetic, not UI chrome) -->
	{#if birdMode === 'fly'}
		<div class="birds-layer" aria-hidden="true">
			{#each flyingBirds as b (b.id)}
				<div
					class="bird-flight"
					class:static={reduceMotion}
					style:--y="{b.y}%"
					style:--delay="{b.delay}s"
					style:--dur="{b.dur}s"
					style:--sc={b.scale}
				>
					{#if b.v}
						<!-- Tiny V-formation -->
						<svg class="bird-svg vform" viewBox="0 0 24 10" width="24" height="10">
							<path d="M2 6 L5 3 L8 6" fill="none" stroke="#1a2030" stroke-width="1.4" />
							<path d="M8 5 L11 2 L14 5" fill="none" stroke="#121820" stroke-width="1.5" />
							<path d="M14 6 L17 3 L20 6" fill="none" stroke="#1a2030" stroke-width="1.4" />
						</svg>
					{:else}
						<svg class="bird-svg" viewBox="0 0 10 6" width="10" height="6">
							<path d="M1 4 L5 1 L9 4" fill="none" stroke="#151c28" stroke-width="1.5" />
						</svg>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<svg class="skyline" viewBox="0 0 640 180" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
		<g class="far" fill="#0a1018" opacity="0.55">
			<rect x="20" y="90" width="28" height="90" />
			<rect x="52" y="70" width="22" height="110" />
			<rect x="80" y="100" width="35" height="80" />
			<rect x="520" y="85" width="30" height="95" />
			<rect x="555" y="60" width="40" height="120" />
			<rect x="600" y="95" width="25" height="85" />
		</g>

		<g class="mid" fill="#0d1520">
			<rect x="110" y="55" width="42" height="125" />
			<rect x="118" y="48" width="26" height="8" />
			<rect x="160" y="75" width="36" height="105" />
			<rect x="205" y="40" width="50" height="140" />
			<rect x="215" y="30" width="30" height="12" />
			<rect x="420" y="50" width="48" height="130" />
			<rect x="430" y="42" width="28" height="10" />
			<rect x="475" y="70" width="38" height="110" />
		</g>

		<!-- Empire State Building (center) -->
		<g class="esb" fill="#111a28">
			<rect x="300" y="95" width="72" height="85" />
			<rect x="312" y="45" width="48" height="50" />
			<rect x="322" y="22" width="28" height="24" />
			<rect x="332" y="8" width="8" height="14" />
			<rect x="334" y="2" width="4" height="8" />
			<rect x="335" y="0" width="2" height="4" class="antenna" />
		</g>

		<!-- Roosted birds on antenna / ledge at dusk -->
		{#if birdMode === 'roost'}
			<g class="roost-birds" fill="#1a2030" opacity="0.85">
				<!-- on ESB antenna ledge -->
				<rect x="330" y="6" width="2" height="2" />
				<rect x="337" y="5" width="2" height="2" />
				<!-- on mid building ledge -->
				<rect x="218" y="28" width="2" height="2" />
				<rect x="224" y="29" width="2" height="2" />
				<rect x="428" y="40" width="2" height="2" />
			</g>
		{/if}

		{#if night || festive}
			<g class="lights" fill="#f0c674" class:festive-bright={festive}>
				{#each Array(18) as _, i}
					<rect
						x={118 + (i % 6) * 6}
						y={70 + Math.floor(i / 6) * 14}
						width="3"
						height="4"
						opacity={(festive ? 0.65 : 0.4) + (i % 3) * 0.2}
					/>
				{/each}
				{#each Array(24) as _, i}
					<rect
						x={214 + (i % 8) * 5}
						y={55 + Math.floor(i / 8) * 16}
						width="3"
						height="4"
						opacity={(festive ? 0.55 : 0.35) + (i % 4) * 0.15}
					/>
				{/each}
				<rect x="322" y="22" width="28" height="6" fill="#f5d78e" opacity="0.9" class="crown-glow" />
				<rect x="332" y="8" width="8" height="4" fill="#ffe9a8" opacity="0.95" />
				{#each Array(20) as _, i}
					<rect
						x={308 + (i % 10) * 6}
						y={105 + Math.floor(i / 10) * 20}
						width="3"
						height="5"
						opacity={festive ? 0.7 : 0.5}
						fill="#e8d48a"
					/>
				{/each}
				{#each Array(16) as _, i}
					<rect
						x={430 + (i % 6) * 6}
						y={60 + Math.floor(i / 6) * 18}
						width="3"
						height="4"
						opacity={festive ? 0.65 : 0.45}
					/>
				{/each}
			</g>
		{/if}

		<!-- Tasteful festive accents while snowing: string lights + tiny wreath -->
		{#if festive}
			<g class="festive-accents" opacity="0.9">
				<!-- string lights on far-left building -->
				{#each Array(6) as _, i}
					<rect
						x={24 + i * 4}
						y={92}
						width="2"
						height="2"
						fill={i % 3 === 0 ? '#e06050' : i % 3 === 1 ? '#60c070' : '#e8c060'}
						opacity="0.85"
					/>
				{/each}
				<!-- tiny wreath silhouette on mid building -->
				<rect x="176" y="82" width="5" height="5" fill="#2a5030" opacity="0.75" />
				<rect x="177" y="83" width="3" height="3" fill="#3a6840" opacity="0.9" />
				<rect x="178" y="84" width="1" height="1" fill="#c05040" />
				<!-- warm glow line on ESB setback -->
				<rect x="314" y="44" width="44" height="2" fill="#e8a860" opacity="0.55" />
			</g>
		{/if}

		<!-- Soft snow ground tint -->
		{#if snowing}
			<rect x="0" y="168" width="640" height="12" fill="#d8e8f8" opacity="0.22" class="snow-ground" />
			<!-- rooftop dusting -->
			<rect x="110" y="54" width="42" height="2" fill="#e8f0f8" opacity="0.35" />
			<rect x="205" y="39" width="50" height="2" fill="#e8f0f8" opacity="0.3" />
			<rect x="300" y="94" width="72" height="2" fill="#e8f0f8" opacity="0.28" />
			<rect x="420" y="49" width="48" height="2" fill="#e8f0f8" opacity="0.32" />
			<rect x="555" y="59" width="40" height="2" fill="#e8f0f8" opacity="0.3" />
		{/if}

		<!-- Rare King Kong event on ESB -->
		{#if kongActive}
			<g class="kong-event" opacity={kongPose === 'fade' ? 0.35 : 1}>
				{#each helis as h (h.id)}
					<g
						transform="translate({h.x},{h.y}) rotate({h.tumble ? 25 + kongFrame * 8 : 0})"
						opacity={h.tumble ? 0.55 : 0.9}
					>
						<!-- chopper body -->
						<rect x="0" y="4" width="14" height="5" fill="#c8d0dc" />
						<rect x="12" y="5" width="6" height="3" fill="#a8b0bc" />
						<rect x="-2" y="2" width="18" height="1" fill="#e8eef4" class="rotor" />
						<rect x="5" y="9" width="1" height="4" fill="#8890a0" />
						<rect x="3" y="12" width="5" height="1" fill="#8890a0" />
					</g>
				{/each}

				<!-- Kong on upper setback -->
				<g class="kong" transform="translate(328,{kongPose === 'climb' ? 28 - kongFrame : 18})">
					<!-- body -->
					<rect x="2" y="8" width="10" height="12" fill="#4a3020" />
					<!-- head -->
					<rect x="3" y="2" width="8" height="7" fill="#5a3a28" />
					<rect x="4" y="4" width="2" height="2" fill="#e8c060" />
					<rect x="8" y="4" width="2" height="2" fill="#e8c060" />
					<!-- arms -->
					{#if kongPose === 'swipe' || kongPose === 'roar'}
						<rect
							x={kongFrame % 2 === 0 ? -8 : 14}
							y="6"
							width="10"
							height="3"
							fill="#4a3020"
							transform="rotate({kongFrame % 2 === 0 ? -20 : 20} {kongFrame % 2 === 0 ? -8 : 14} 7)"
						/>
						<rect
							x={kongFrame % 2 === 0 ? 14 : -8}
							y="10"
							width="9"
							height="3"
							fill="#4a3020"
						/>
					{:else}
						<rect x="-2" y="10" width="4" height="8" fill="#4a3020" />
						<rect x="12" y="10" width="4" height="8" fill="#4a3020" />
					{/if}
					<!-- legs -->
					<rect x="3" y="18" width="3" height="6" fill="#3a2818" />
					<rect x="8" y="18" width="3" height="6" fill="#3a2818" />
					{#if kongPose === 'roar'}
						<rect x="5" y="0" width="4" height="3" fill="#c07060" opacity="0.8" />
					{/if}
				</g>
			</g>
		{/if}

		<rect x="0" y="165" width="640" height="15" fill="url(#fog)" opacity="0.4" />
		<defs>
			<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#1a2438" stop-opacity="0" />
				<stop offset="100%" stop-color="#0b1220" stop-opacity="0.8" />
			</linearGradient>
		</defs>
	</svg>
</div>

<style>
	.sky {
		position: absolute;
		inset: 0;
		overflow: hidden;
		image-rendering: pixelated;
	}
	.gradient {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			180deg,
			var(--sky-top) 0%,
			var(--sky-mid) 45%,
			var(--sky-bottom) 100%
		);
		transition: background 2.5s ease;
		z-index: 0;
	}
	.wash {
		position: absolute;
		inset: 0;
		background: var(--wash);
		mix-blend-mode: soft-light;
		pointer-events: none;
		transition: background 2.5s ease;
		z-index: 1;
	}
	.haze {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 40%;
		background: linear-gradient(transparent, rgba(10, 16, 28, calc(0.35 * (1 - var(--lux)))));
		pointer-events: none;
		z-index: 3;
	}
	.skyline {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -4px;
		width: 100%;
		height: 72%;
		filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8));
		z-index: 4;
	}
	.antenna {
		fill: #c8d0dc;
	}
	.crown-glow {
		animation: pulse 2.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 0.75;
		}
		50% {
			opacity: 1;
		}
	}

	/* Sun: behind skyline (z-index 2), horizon-anchored, phase-tinted */
	.sun-wrap {
		position: absolute;
		z-index: 2;
		pointer-events: none;
		width: 56px;
		height: 56px;
		display: grid;
		place-items: center;
		transition:
			right 2.5s ease,
			bottom 2.5s ease,
			opacity 1.2s ease;
	}
	.sun-wrap.golden {
		right: 14%;
		bottom: 22%;
	}
	.sun-wrap.dusk {
		right: 10%;
		bottom: 14%;
	}
	.sun-wrap.dawn {
		left: 12%;
		right: auto;
		bottom: 18%;
		opacity: 0.85;
	}
	.sun-glow {
		position: absolute;
		border-radius: 50%;
		pointer-events: none;
	}
	.sun-glow.outer {
		width: 56px;
		height: 56px;
		background: radial-gradient(circle, rgba(255, 160, 60, 0.45) 0%, transparent 70%);
	}
	.sun-glow.mid {
		width: 36px;
		height: 36px;
		background: radial-gradient(circle, rgba(255, 200, 100, 0.55) 0%, transparent 68%);
	}
	.sun-core {
		position: relative;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #ffc56a;
		box-shadow:
			0 0 12px 4px rgba(255, 170, 70, 0.65),
			0 0 28px 10px rgba(255, 120, 40, 0.35);
		image-rendering: pixelated;
	}
	.sun-rim {
		position: absolute;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 2px solid rgba(255, 220, 160, 0.35);
		box-sizing: border-box;
	}
	.sun-wrap.dusk .sun-core {
		background: #ff8a3a;
		width: 20px;
		height: 20px;
		box-shadow:
			0 0 14px 5px rgba(255, 100, 40, 0.7),
			0 0 32px 12px rgba(200, 60, 40, 0.4);
	}
	.sun-wrap.dusk .sun-glow.outer {
		background: radial-gradient(circle, rgba(255, 90, 40, 0.4) 0%, transparent 70%);
	}
	.sun-wrap.dawn .sun-core {
		background: #ffd0a0;
		width: 18px;
		height: 18px;
		box-shadow:
			0 0 10px 3px rgba(255, 180, 140, 0.55),
			0 0 22px 8px rgba(255, 140, 100, 0.3);
	}

	.raining .skyline {
		filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8)) brightness(0.92);
	}
	.snowing .skyline {
		filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8)) brightness(1.04) saturate(0.92);
	}
	.snowing .haze {
		background: linear-gradient(transparent, rgba(200, 220, 240, calc(0.18 * var(--lux, 0.5))));
	}

	/* Birds */
	.birds-layer {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		overflow: hidden;
	}
	.bird-flight {
		position: absolute;
		top: var(--y);
		left: -8%;
		transform: scale(var(--sc));
		animation: fly-across var(--dur) linear var(--delay) infinite;
		will-change: transform;
	}
	.bird-flight.static {
		animation: none;
		left: calc(12% + var(--delay) * 3%);
		opacity: 0.7;
	}
	.bird-svg {
		display: block;
		image-rendering: pixelated;
		opacity: 0.75;
	}
	@keyframes fly-across {
		0% {
			transform: translateX(0) scale(var(--sc));
		}
		100% {
			transform: translateX(120vw) scale(var(--sc));
		}
	}

	.rotor {
		animation: spin 0.15s steps(2) infinite;
	}
	@keyframes spin {
		to {
			transform: scaleX(-1);
		}
	}
	@media (max-width: 768px) {
		.skyline {
			height: 85%;
			bottom: -2px;
		}
		.sun-wrap {
			width: 44px;
			height: 44px;
		}
		.sun-core {
			width: 18px;
			height: 18px;
		}
		.sun-glow.outer {
			width: 44px;
			height: 44px;
		}
		.sun-glow.mid {
			width: 28px;
			height: 28px;
		}
		/* Fewer visual birds on small screens via opacity on later ones */
		.bird-flight:nth-child(n + 4) {
			display: none;
		}
	}
	@media (max-width: 480px) {
		.skyline {
			height: 92%;
		}
		.sun-wrap.golden {
			right: 12%;
			bottom: 18%;
		}
		.bird-flight:nth-child(n + 3) {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.crown-glow,
		.rotor,
		.bird-flight {
			animation: none;
		}
		.bird-flight {
			left: calc(12% + var(--delay) * 3%);
			opacity: 0.7;
		}
	}
	.sky.reduce-motion .crown-glow,
	.sky.reduce-motion .rotor,
	.sky.reduce-motion .bird-flight {
		animation: none;
	}
	.sky.reduce-motion .bird-flight {
		left: calc(12% + var(--delay) * 3%);
		opacity: 0.7;
	}
</style>
