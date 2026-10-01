<script lang="ts">
	import type { DayPhase } from '$lib/data/types';
	import type { OfficeTheme } from '$lib/persist/deskSettings';
	import { skyColors } from '$lib/weather/timeCycle';
	import { buildingShape, FAR_BUILDINGS, skylineBuildings } from './skylineBuildings';

	let {
		phase,
		outdoorLux,
		raining,
		snowing = false,
		theme = 'nyc',
		landmarkOffsetX = 0,
		ufoActive = false,
		ufoFrame = 0,
		reduceMotion = false
	}: {
		phase: DayPhase;
		outdoorLux: number;
		raining: boolean;
		snowing?: boolean;
		theme?: OfficeTheme;
		/** Horizontal viewBox offset for the primary city landmark. */
		landmarkOffsetX?: number;
		ufoActive?: boolean;
		ufoFrame?: number;
		reduceMotion?: boolean;
	} = $props();

	const sky = $derived(skyColors(phase));
	const miamiVice = $derived(theme === 'miami-vice');
	const themedSky = $derived(miamiVice ? miamiSkyColors(phase) : sky);
	const night = $derived(phase === 'night' || phase === 'dusk');
	const showSun = $derived(phase === 'golden' || phase === 'dusk' || phase === 'dawn');
	const sunPhase = $derived(
		phase === 'dawn' ? 'dawn' : phase === 'golden' ? 'golden' : phase === 'dusk' ? 'dusk' : 'off'
	);

	function miamiSkyColors(currentPhase: DayPhase) {
		switch (currentPhase) {
			case 'dawn':
				return { top: '#342259', mid: '#a64879', bottom: '#ef9b58', wash: 'rgba(255, 92, 185, 0.12)' };
			case 'day':
				return { top: '#17284e', mid: '#237f9c', bottom: '#ee9d4d', wash: 'rgba(73, 224, 214, 0.1)' };
			case 'golden':
				return { top: '#3b2966', mid: '#ca5d82', bottom: '#f6a04e', wash: 'rgba(255, 92, 185, 0.14)' };
			case 'dusk':
				return { top: '#11163c', mid: '#493467', bottom: '#d9607d', wash: 'rgba(54, 221, 216, 0.1)' };
			case 'night':
				return { top: '#080b27', mid: '#151b4c', bottom: '#1e3760', wash: 'rgba(61, 214, 226, 0.08)' };
		}
	}

	/** Birds fly in dawn/day/golden; roost sparsely at dusk; hide at night & during the UFO event. */
	const birdMode = $derived.by((): 'fly' | 'roost' | 'hidden' => {
		if (ufoActive) return 'hidden';
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

	const ufoPose = $derived.by(() => {
		if (!ufoActive) return 'hidden';
		if (ufoFrame < 8) return 'approach';
		if (ufoFrame < 29) return 'hover';
		return 'depart';
	});
	const ufoX = $derived(ufoFrame < 8 ? 492 - ufoFrame * 16 : ufoFrame < 29 ? 364 : 364 + (ufoFrame - 29) * 18);
	const ufoY = $derived(ufoFrame < 8 ? 14 + ufoFrame * 0.6 : 18 - Math.max(0, ufoFrame - 29) * 2);
	const beamVisible = $derived(ufoActive && ufoFrame >= 8 && ufoFrame < 31);
	const abducteeY = $derived(149 - Math.min(52, Math.max(0, ufoFrame - 10) * 3.2));

	const festive = $derived(snowing);

	const towers = $derived(skylineBuildings(theme).map((b, i) => ({ b, i, shape: buildingShape(b) })));
	/** The centerpiece tower's three tiers - fixed geometry, see the comment where it is drawn. */
	const CENTER_PARTS = ['M300 95h72v85h-72Z', 'M312 45h48v50h-48Z', 'M322 22h28v24h-28Z'];
</script>

<div
	class="sky"
	class:raining
	class:snowing
	class:reduce-motion={reduceMotion}
	data-sun={sunPhase}
	data-theme={theme}
	style:--sky-top={themedSky.top}
	style:--sky-mid={themedSky.mid}
	style:--sky-bottom={themedSky.bottom}
	style:--wash={themedSky.wash}
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
	{#if phase === 'night'}
		<div class="moon-crescent" aria-hidden="true">
			<svg viewBox="0 0 40 40" role="presentation">
				<path d="M30.5 4.5C24.2 7.1 20 13.2 20 20c0 6.8 4.2 12.9 10.5 15.5C27.7 37.1 24.1 38 20 38 10.1 38 2 30 2 20S10.1 2 20 2c4.1 0 7.7.9 10.5 2.5Z" />
			</svg>
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
		<defs>
			<!-- One World Trade Center's facade treatment (see HomeScene.svelte), shared by every tower:
			     dark chamfered edges, a lit center, and banded window floors. -->
			<linearGradient id="sk-glass" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" stop-color={miamiVice ? '#2b2a55' : '#2a3f57'} />
				<stop offset="45%" stop-color={miamiVice ? '#6f86c4' : '#6f93b8'} />
				<stop offset="55%" stop-color={miamiVice ? '#86c9d6' : '#7fa3c4'} />
				<stop offset="100%" stop-color={miamiVice ? '#26254a' : '#233247'} />
			</linearGradient>
			<linearGradient id="sk-glass-far" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" stop-color="#2c3a4e" />
				<stop offset="50%" stop-color="#55708e" />
				<stop offset="100%" stop-color="#28364a" />
			</linearGradient>
			<pattern id="sk-floors" width="4" height="5" patternUnits="userSpaceOnUse">
				<rect y="4.2" width="4" height="0.8" fill="#101823" opacity="0.55" />
				<rect x="3.5" width="0.5" height="5" fill="#101823" opacity="0.18" />
			</pattern>
			<pattern id="sk-lit" width="7" height="8" patternUnits="userSpaceOnUse">
				<rect x="1" y="1" width="2" height="2.4" fill="#f0c674" />
				<rect x="4.4" y="5" width="1.6" height="2" fill="#f5d78e" opacity="0.7" />
			</pattern>
		</defs>

		<g class="buildings">
			<g class="far" opacity="0.6">
				{#each FAR_BUILDINGS as f (f.x)}
					<rect x={f.x} y={f.top} width={f.w} height={180 - f.top} fill="url(#sk-glass-far)" />
					<rect x={f.x} y={f.top} width={f.w} height={180 - f.top} fill="url(#sk-floors)" />
				{/each}
			</g>

			{#each towers as t (t.b.name)}
				<g class="tower" aria-label={t.b.name}>
					{#each t.shape.trims as trim, i (i)}
						<rect x={trim.x} y={trim.y} width={trim.w} height={trim.h} fill="#1c2836" />
					{/each}
					{#each t.shape.parts as d, i (i)}
						<path {d} fill="url(#sk-glass)" />
						<path {d} fill="url(#sk-floors)" />
						{#if night || festive}<path {d} fill="url(#sk-lit)" class="lit" class:festive-bright={festive} />{/if}
					{/each}
					{#if miamiVice}
						<rect x={t.shape.roof.x} y={t.shape.roof.y} width={t.shape.roof.w} height="1.2" class={t.i % 2 ? 'neon-cyan' : 'neon-pink'} />
					{/if}
				</g>
			{/each}

			<!-- Center tower: Empire State Building (NYC) or Miami Tower's rounded, neon-lit
			     crown (Miami Vice) - night crown glow, snow dusting, and the UFO abduction beam
			     all target this same silhouette, so it keeps its exact geometry. -->
			<g class="esb" transform={`translate(${landmarkOffsetX} 0)`}>
				{#if miamiVice}
					<rect x="323" y="12" width="26" height="10" rx="3" fill="url(#sk-glass)" />
					<rect x="329" y="3" width="14" height="11" rx="5" fill="url(#sk-glass)" />
					<ellipse cx="336" cy="3" rx="6" ry="4" class="miami-beacon" />
				{:else}
					<rect x="332" y="8" width="8" height="14" fill="#1c2836" />
					<rect x="334" y="2" width="4" height="8" fill="#1c2836" />
					<rect x="335" y="0" width="2" height="4" class="antenna" />
				{/if}
				{#each CENTER_PARTS as d (d)}
					<path {d} fill="url(#sk-glass)" />
					<path {d} fill="url(#sk-floors)" />
					{#if night || festive}<path {d} fill="url(#sk-lit)" class="lit" class:festive-bright={festive} />{/if}
				{/each}
			</g>
		</g>

		{#if miamiVice}
			<!-- Miami Tower's signature illuminated setbacks. -->
			<g class="miami-neon" aria-hidden="true" transform={`translate(${landmarkOffsetX} 0)`}>
				<rect x="304" y="94" width="64" height="2" class="neon-cyan" />
				<rect x="316" y="44" width="40" height="2" class="neon-pink" />
				<rect x="326" y="21" width="20" height="2" class="neon-cyan" />
			</g>
		{/if}

		{#if miamiVice}
			<!-- Miami Vice accents: palms, art-deco neon, and a dark waterline. -->
			<g class="miami-details" aria-hidden="true">
				<g class="miami-palms" fill="none" stroke-linecap="square">
					<path d="M72 180 L74 116 M74 120 L62 111 M74 120 L69 105 M74 118 L84 108 M74 116 L79 101" />
					<path d="M552 180 L550 124 M550 128 L538 119 M550 128 L546 114 M550 126 L560 116 M550 124 L556 110" />
				</g>
				<g class="miami-water">
					<rect x="0" y="163" width="640" height="17" />
					<path d="M0 166 H120 M180 168 H300 M390 165 H520 M560 169 H640" />
				</g>
			</g>
		{/if}

		<!-- Roosted birds on antenna / ledge at dusk -->
		{#if birdMode === 'roost'}
			<g class="roost-birds" fill="#1a2030" opacity="0.85">
				<!-- on ESB antenna ledge -->
				<g transform={`translate(${landmarkOffsetX} 0)`}>
					<rect x="330" y="6" width="2" height="2" />
					<rect x="337" y="5" width="2" height="2" />
				</g>
				<!-- on two rooftop ledges -->
				{#each towers.slice(2, 4) as t (t.b.name)}
					<rect x={t.shape.roof.x + 2} y={t.shape.roof.y - 2} width="2" height="2" />
				{/each}
			</g>
		{/if}

		{#if night || festive}
			<!-- Window lights are part of each facade (#sk-lit); the center crown keeps its glow. -->
			<g class="lights" transform={`translate(${landmarkOffsetX} 0)`}>
				<rect x="322" y="22" width="28" height="6" fill="#f5d78e" opacity="0.9" class="crown-glow" />
				<rect x="332" y="8" width="8" height="4" fill="#ffe9a8" opacity="0.95" />
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
				<rect x={314 + landmarkOffsetX} y="44" width="44" height="2" fill="#e8a860" opacity="0.55" />
			</g>
		{/if}

		<!-- Soft snow ground tint -->
		{#if snowing}
			<rect x="0" y="168" width="640" height="12" fill="#d8e8f8" opacity="0.22" class="snow-ground" />
			<!-- rooftop dusting -->
			{#each towers as t (t.b.name)}
				<rect x={t.shape.roof.x} y={t.shape.roof.y - 1} width={t.shape.roof.w} height="1.6" fill="#e8f0f8" opacity="0.32" />
			{/each}
			<rect x={300 + landmarkOffsetX} y="94" width="72" height="2" fill="#e8f0f8" opacity="0.28" />
		{/if}

		<!-- Rare UFO abduction event over the ESB. -->
		{#if ufoActive}
			<g class="ufo-event" opacity={ufoPose === 'depart' ? 0.45 : 1}>
				<g class="ufo-craft" transform="translate({ufoX},{ufoY})">
					<rect x="-18" y="1" width="36" height="4" />
					<rect x="-11" y="-3" width="22" height="4" />
					<rect x="-24" y="5" width="48" height="3" />
					<rect x="-10" y="8" width="20" height="2" class="ufo-glow" />
					<rect x="-14" y="5" width="4" height="2" class="ufo-light pink" />
					<rect x="10" y="5" width="4" height="2" class="ufo-light cyan" />
				</g>

				{#if beamVisible}
					<path class="abduction-beam" d="M {ufoX - 11} {ufoY + 9} L {ufoX + 11} {ufoY + 9} L 347 157 L 327 157 Z" />
					<g class="abductee" transform="translate(337,{abducteeY})">
						<rect x="-3" y="0" width="6" height="6" />
						<rect x="-4" y="6" width="8" height="9" />
						<rect x="-7" y="8" width="3" height="2" />
						<rect x="4" y="8" width="3" height="2" />
						<rect x="-3" y="15" width="2" height="5" />
						<rect x="1" y="15" width="2" height="5" />
					</g>
				{/if}
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
	/* Glass reads bright by day and settles toward silhouette after dark, where the lit
	   windows take over. */
	.buildings {
		filter: brightness(calc(0.45 + 0.55 * var(--lux, 1)));
		transition: filter 2.5s ease;
	}
	.lit {
		opacity: 0.55;
	}
	.lit.festive-bright {
		opacity: 0.8;
	}
	.tower .neon-pink {
		fill: #ff4da6;
		filter: drop-shadow(0 0 2px #ff4da6);
	}
	.tower .neon-cyan {
		fill: #51e4dc;
		filter: drop-shadow(0 0 2px #51e4dc);
	}
	.miami-beacon {
		fill: #ff8fd1;
		filter: drop-shadow(0 0 3px #ff4da6);
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
	.moon-crescent {
		position: absolute;
		z-index: 2;
		top: 12%;
		right: 15%;
		width: 38px;
		height: 38px;
		filter: drop-shadow(0 0 7px rgba(246, 231, 178, 0.32)) drop-shadow(0 0 18px rgba(197, 208, 238, 0.12));
		image-rendering: pixelated;
	}
	.moon-crescent svg {
		display: block;
		width: 100%;
		height: 100%;
	}
	.moon-crescent path {
		fill: #f6e7b2;
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
	.sky[data-theme='miami-vice'] .haze {
		background: linear-gradient(transparent, rgba(14, 20, 66, calc(0.28 * (1 - var(--lux)))))
	}
	.miami-details {
		pointer-events: none;
	}
	.miami-palms {
		stroke: #101a2e;
		stroke-width: 2;
		opacity: 0.9;
	}
	.miami-neon .neon-pink {
		fill: #ff4da6;
		opacity: 0.8;
		filter: drop-shadow(0 0 2px #ff4da6);
	}
	.miami-neon .neon-cyan {
		fill: #51e4dc;
		opacity: 0.82;
		filter: drop-shadow(0 0 2px #51e4dc);
	}
	.miami-water rect {
		fill: #101d43;
		opacity: 0.72;
	}
	.miami-water path {
		fill: none;
		stroke: #37bfc1;
		stroke-width: 1;
		opacity: 0.55;
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

	.ufo-event {
		pointer-events: none;
	}
	.ufo-craft rect {
		fill: #b7d5d4;
		stroke: #182039;
		stroke-width: 1;
	}
	.ufo-craft .ufo-glow {
		fill: #e8f6bc;
		stroke: #8ad9c9;
		filter: drop-shadow(0 0 3px #7fe8d8);
	}
	.ufo-craft .ufo-light {
		stroke: none;
	}
	.ufo-craft .ufo-light.pink {
		fill: #ff5eaa;
	}
	.ufo-craft .ufo-light.cyan {
		fill: #58f0e1;
	}
	.abduction-beam {
		fill: rgba(115, 242, 218, 0.24);
		stroke: #78e6d1;
		stroke-width: 1;
		opacity: 0.9;
	}
	.abductee rect {
		fill: #b9eadb;
		stroke: #1d2841;
		stroke-width: 1;
	}
	@keyframes ufo-pulse {
		50% {
			filter: brightness(1.35) drop-shadow(0 0 3px #7fe8d8);
		}
	}
	.ufo-glow {
		animation: ufo-pulse 0.8s steps(2) infinite;
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
		.moon-crescent {
			top: 10%;
			right: 12%;
			width: 30px;
			height: 30px;
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
		.ufo-glow,
		.bird-flight {
			animation: none;
		}
		.bird-flight {
			left: calc(12% + var(--delay) * 3%);
			opacity: 0.7;
		}
	}
	.sky.reduce-motion .crown-glow,
	.sky.reduce-motion .ufo-glow,
	.sky.reduce-motion .bird-flight {
		animation: none;
	}
	.sky.reduce-motion .bird-flight {
		left: calc(12% + var(--delay) * 3%);
		opacity: 0.7;
	}
</style>
