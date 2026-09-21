<script lang="ts">
	import type { AnimState, StaffDef, TraderDef, TraderLeg } from '$lib/data/types';
	import { leverageHeat, animFromPnl } from '$lib/characters/cast';
	import type { TraderPostureCard } from '$lib/ta/posture';
	import { statusLabel } from '$lib/ta/posture';
	import MiniChart from './MiniChart.svelte';
	import type { Bar } from '$lib/data/types';

	let {
		trader,
		staff,
		leg,
		posture,
		note = '',
		bars = [],
		forceAnim,
		lampBoost = 0,
		tick = 0,
		pinned = false,
		blofinBadge = null as string | null,
		onInspect = () => {},
		onPin = () => {},
		onLeverageCommit = (_leverage: number) => {}
	}: {
		trader?: TraderDef;
		staff?: StaffDef;
		leg?: TraderLeg | null;
		posture?: TraderPostureCard | null;
		note?: string;
		bars?: Bar[];
		forceAnim?: AnimState;
		lampBoost?: number;
		tick?: number;
		pinned?: boolean;
		/** Short BloFin overlay label when a live position is assigned to this desk. */
		blofinBadge?: string | null;
		onInspect?: () => void;
		onPin?: () => void;
		onLeverageCommit?: (leverage: number) => void;
	} = $props();

	const name = $derived(trader?.name ?? staff?.name ?? '');
	const skin = $derived(trader?.skin ?? staff?.skin ?? 'maya');
	const postureKind = $derived(posture?.posture ?? null);
	const roleLabel = $derived(trader ? `${trader.side.toUpperCase()} DESK` : staff?.title ?? '');
	const status = $derived(posture?.status ?? 'watching');
	let editingLeverage = $state(false);
	let leverageDraft = $state('');
	let leverageInput = $state<HTMLInputElement>();

	const anim = $derived.by((): AnimState => {
		void tick;
		if (forceAnim) return forceAnim;
		if (postureKind === 'open' && leg) {
			const mood = animFromPnl(leg.unrealizedPnlPctMargin);
			if (mood) return mood;
		}
		const id = trader?.id ?? staff?.id ?? 'x';
		const cycle: AnimState[] = staff
			? staff.role === 'pm'
				? ['walk', 'idle', 'point', 'idle']
				: staff.role === 'cio'
					? ['idle', 'point', 'idle', 'phone']
					: staff.role === 'quant'
						? ['type', 'type', 'idle', 'type']
						: ['type', 'idle', 'point', 'phone']
			: postureKind === 'considering'
				? ['idle', 'phone', 'type', 'idle']
				: postureKind === 'counter'
					? ['idle', 'idle', 'phone', 'type']
					: ['type', 'phone', 'point', 'type', 'idle'];
		const idx = (id.charCodeAt(0) + id.charCodeAt(id.length - 1) + tick) % cycle.length;
		return cycle[idx];
	});

	const activity = $derived(
		anim === 'phone' ? 'on phone' : anim === 'point' ? 'pointing' : anim === 'type' ? 'typing' : anim === 'walk' ? 'walking' : anim === 'stress' ? 'stressed' : anim === 'celebrate' ? 'celebrating' : 'watching'
	);

	function inspect() {
		onInspect();
	}
	function pin() {
		onPin();
	}
	function beginLeverageEdit(event: MouseEvent) {
		event.stopPropagation();
		if (!trader) return;
		leverageDraft = String(trader.leverage);
		editingLeverage = true;
	}
	function commitLeverage(event?: Event) {
		event?.stopPropagation();
		if (!trader) return;
		const next = Number(leverageDraft);
		if (Number.isInteger(next) && next >= 1 && next <= 1000) {
			onLeverageCommit(next);
		}
		leverageDraft = String(trader.leverage);
		editingLeverage = false;
	}
	function cancelLeverage(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key !== 'Escape') return;
		leverageDraft = String(trader?.leverage ?? '');
		editingLeverage = false;
	}

	$effect(() => {
		if (!editingLeverage || !leverageInput) return;
		requestAnimationFrame(() => {
			leverageInput?.focus();
			leverageInput?.select();
		});
	});
</script>

<div
	class="character"
	class:staff-member={!!staff}
	class:trader-member={!!trader}
	class:pinned
	class:dim={postureKind === 'counter' || postureKind === 'watching'}
	data-skin={skin}
	data-side={trader?.side ?? 'staff'}
	data-anim={anim}
	data-status={status}
	role="button"
	tabindex="0"
	aria-label={`${name}, ${roleLabel}, ${activity}`}
	onmouseenter={inspect}
	onfocus={inspect}
	onclick={pin}
	onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') pin(); }}
	style:--lev-color={trader ? leverageHeat(trader.leverage) : '#d9b66f'}
	style:--lamp={0.56 + lampBoost}
>
	{#if postureKind === 'considering' && posture?.cloud}
		<div class="thought" aria-label={`Thinking: ${posture.cloud}`}>
			<span>{posture.cloud}</span><i></i><b></b>
		</div>
	{/if}

	{#if trader}
		<div class="status-badge" data-status={status}>{statusLabel(status)}</div>
		{#if blofinBadge}
			<div class="blofin-badge" title="BloFin position assigned">{blofinBadge}</div>
		{/if}
	{:else}
		<div class="staff-note">{note}</div>
	{/if}

	<div class="desk-cluster">
		<div class="monitor-case">
			<div class="monitor-screen">
				<MiniChart
					{bars}
					bias={posture?.bias ?? 'FLAT'}
					label={trader ? `${trader.id} / SOL` : staff?.id ?? 'STAFF'}
					showLevels={postureKind === 'open'}
					stop={posture?.stop}
					tp1={posture?.tp1}
					tp2={posture?.tp2}
				/>
			</div>
			<div class="monitor-neck"></div>
		</div>
		<div class="desk-lamp"><i></i><span></span></div>
		<div class="keyboard"></div>
		<div class="mug"><i></i></div>
		{#if trader?.col === 1 || trader?.col === 4}<div class="desk-phone"></div>{/if}
		{#if staff?.role === 'senior_analyst' || staff?.role === 'research_analyst'}<div class="clipboard"></div>{/if}
		<div class="wood-top"></div>
		<div class="desk-base"><i></i><i></i></div>
	</div>

	<div class="person" aria-hidden="true">
		<div class="hair"></div>
		<div class="head"><i></i></div>
		<div class="torso"><i></i></div>
		<div class="arm left"></div>
		<div class="arm right"></div>
		<div class="legs"><i></i></div>
		{#if anim === 'phone'}<div class="receiver"></div>{/if}
		{#if staff?.role === 'pm'}<div class="pm-pad"></div>{/if}
	</div>
	{#if trader && postureKind === 'open' && status === 'celebrating'}
		<div class="champagne-pop" aria-label="Popping champagne">
			<span class="champagne-bottle"><i class="cork"></i><b class="label"></b></span>
			<i class="bubble bubble-one"></i>
			<i class="bubble bubble-two"></i>
			<i class="bubble bubble-three"></i>
			<span class="spray spray-one"></span>
			<span class="spray spray-two"></span>
			<span class="spray spray-three"></span>
		</div>
	{/if}
	<div class="chair"></div>

	<div class="nameplate">
		<div class="who">{name}</div>
		<div class="role">{roleLabel}</div>
		{#if trader}
			{#if editingLeverage}
				<input
					class="leverage leverage-input"
					bind:this={leverageInput}
					type="number"
					min="1"
					max="1000"
					step="1"
					inputmode="numeric"
					aria-label={`${trader.name} leverage`}
					bind:value={leverageDraft}
					onclick={(event) => event.stopPropagation()}
					onpointerdown={(event) => event.stopPropagation()}
					onblur={commitLeverage}
					onkeydown={(event) => {
						event.stopPropagation();
						if (event.key === 'Enter') commitLeverage(event);
						else if (event.key === 'Escape') cancelLeverage(event);
					}}
				/>
			{:else}
				<button
					type="button"
					class="leverage"
					aria-label={`Edit ${trader.name} leverage`}
					onclick={beginLeverageEdit}
					onpointerdown={(event) => event.stopPropagation()}
					>{trader.leverage}×</button
				>
			{/if}
		{/if}
	</div>
	<div class="activity">{activity}</div>
</div>

<style>
	.character {
		position: relative;
		width: 100%;
		max-width: 128px;
		margin: 0 auto;
		height: 154px;
		overflow: visible;
		outline: none;
		image-rendering: pixelated;
		cursor: pointer;
		--skin:#d8a375; --hair:#25150e; --suit:#36536a; --shirt:#f0e8d7;
		transition: filter .2s ease, opacity .2s ease;
	}
	.character:hover, .character:focus-visible, .character.pinned { z-index: 30; filter: brightness(1.08); }
	.character:focus-visible .nameplate, .character.pinned .nameplate { box-shadow:0 0 0 2px #efc66c, 2px 2px 0 #2b170c; }
	.character.dim { opacity:.72; filter:saturate(.68); }
	.character[data-skin='maya'] { --skin:#c88752;--hair:#1d0e08;--suit:#315a48; }
	.character[data-skin='jamal'] { --skin:#6e4028;--hair:#0f0c0a;--suit:#28475e; }
	.character[data-skin='sofia'] { --skin:#d5a275;--hair:#3d2014;--suit:#5f3a55; }
	.character[data-skin='kenji'] { --skin:#e1b68d;--hair:#151414;--suit:#344d62; }
	.character[data-skin='aisha'] { --skin:#75472c;--hair:#120e0c;--suit:#6a3f3f; }
	.character[data-skin='erik'] { --skin:#edc49d;--hair:#a8783b;--suit:#4b5366; }
	.character[data-skin='priya'] { --skin:#b9784f;--hair:#23120b;--suit:#6c4055; }
	.character[data-skin='marcus'] { --skin:#8b5638;--hair:#130f0c;--suit:#3b5366; }
	.character[data-skin='yuki'] { --skin:#e5bd99;--hair:#201b1b;--suit:#564164; }
	.character[data-skin='diego'] { --skin:#bd7e55;--hair:#26140d;--suit:#604239; }
	.character[data-skin='helena'] { --skin:#e8c19d;--hair:#6a4937;--suit:#263e51; }
	.character[data-skin='theo'] { --skin:#c98f65;--hair:#302018;--suit:#375562; }
	.character[data-skin='nora'] { --skin:#edc7a8;--hair:#754928;--suit:#3e506a; }
	.character[data-skin='chris'] { --skin:#d9ac83;--hair:#1d1b1a;--suit:#304562; }
	.character[data-skin='samir'] { --skin:#b7784d;--hair:#15100d;--suit:#313e59; }

	.desk-cluster { position:absolute; left:0; right:0; top:47px; height:72px; z-index:4; overflow:visible; }
	.wood-top { position:absolute; left:2px; right:2px; top:43px; height:8px; z-index:2; background:#9d5e2d; border:2px solid #3d2417; box-shadow:inset 0 2px #c47b3a, 0 3px 0 #2a1710; }
	.desk-base { position:absolute; left:8px; right:8px; top:51px; height:25px; background:#60391f; border:2px solid #332015; z-index:-1; }
	.desk-base i { position:absolute; bottom:-13px; width:7px; height:14px; background:#4a2b1c; }
	.desk-base i:first-child { left:5px; }.desk-base i:last-child { right:5px; }
	.monitor-case { position:absolute; left:21px; top:-5px; width:55px; height:46px; z-index:3; background:#b6aa89; border:3px solid #40392f; border-radius:3px; box-shadow:inset 2px 2px #ded3ad, 3px 3px 0 rgba(27,16,10,.5); }
	.monitor-screen { position:absolute; inset:5px 5px 8px; border:2px solid #3b392f; background:#07110d; overflow:hidden; }
	.monitor-neck { position:absolute; left:21px; bottom:-7px; width:10px; height:7px; background:#91866c; }
	.desk-lamp { position:absolute; right:11px; top:4px; width:23px; height:39px; z-index:5; }
	.desk-lamp span { position:absolute; left:10px; bottom:0; width:3px; height:28px; background:#34291e; transform:rotate(9deg); transform-origin:bottom; }
	.desk-lamp i { position:absolute; top:1px; right:0; width:15px; height:9px; background:#2b5137; border:2px solid #1a291d; clip-path:polygon(15% 0,85% 0,100% 100%,0 100%); box-shadow:0 7px 10px rgba(244,190,94,var(--lamp)); }
	.keyboard { position:absolute; left:35px; top:40px; width:34px; height:6px; z-index:3; background:#c2b797; border:1px solid #494235; transform:skewX(-12deg); }
	/* Sit fully on the wood top — higher z-index so the desk surface doesn't clip the mug */
	.mug { position:absolute; right:28px; top:34px; width:9px; height:10px; z-index:6; background:#ddd0ad; border:1px solid #40392f; box-sizing:border-box; }
	.mug i { position:absolute; right:-3px; top:2px; width:4px; height:5px; border:1px solid #ddd0ad; border-left:0; box-sizing:border-box; }
	.desk-phone { position:absolute; left:5px; top:33px; width:16px; height:9px; background:#9b927b; border:2px solid #40392f; border-radius:3px; }
	.clipboard { position:absolute; right:3px; top:34px; width:16px; height:11px; background:#d5b96e; border:1px solid #47331e; transform:rotate(-7deg); }

	.person { position:absolute; left:23px; top:34px; width:38px; height:62px; z-index:7; transform-origin:50% 100%; }
	.hair { position:absolute; top:0; left:10px; width:20px; height:13px; background:var(--hair); border:2px solid #21140f; clip-path:polygon(0 15%,20% 0,80% 0,100% 20%,95% 85%,5% 85%); }
	.head { position:absolute; top:8px; left:12px; width:16px; height:16px; background:var(--skin); border:2px solid #4a2d1e; }
	.head i { position:absolute; top:5px; right:2px; width:2px; height:2px; background:#261812; box-shadow:-7px 0 #261812; }
	.torso { position:absolute; top:24px; left:7px; width:27px; height:25px; background:var(--suit); border:2px solid #1f2d38; clip-path:polygon(8% 0,92% 0,100% 100%,0 100%); }
	.torso i { position:absolute; left:10px; top:0; width:7px; height:16px; background:var(--shirt); clip-path:polygon(0 0,100% 0,65% 100%,35% 100%); }
	.arm { position:absolute; top:28px; width:7px; height:25px; background:var(--suit); border:2px solid #1f2d38; transform-origin:top; }
	.arm.left { left:1px; transform:rotate(13deg); }.arm.right { right:-1px; transform:rotate(-14deg); }
	.legs { position:absolute; left:9px; bottom:0; width:23px; height:15px; background:#202937; }
	.legs i { position:absolute; left:10px; width:3px; height:15px; background:#111720; }
	.receiver { position:absolute; right:-2px; top:6px; width:5px; height:15px; background:#262c31; border:1px solid #0e1112; }
	.pm-pad { position:absolute; right:-5px; top:34px; width:10px; height:15px; background:#d8c177; border:1px solid #49361e; transform:rotate(9deg); }
	.chair { position:absolute; left:17px; top:69px; width:50px; height:33px; z-index:3; background:#352d2a; border:2px solid #171313; border-radius:8px 8px 2px 2px; }

	.character[data-anim='type'] .arm { animation:type .34s steps(2) infinite; }
	.character[data-anim='phone'] .arm.right { transform:rotate(-112deg) translateY(-5px); }
	.character[data-anim='point'] .arm.right { transform:rotate(-92deg); height:28px; }
	.character[data-anim='walk'] .person { animation:bob .45s steps(2) infinite; }
	.character[data-anim='walk'] { animation:pace 4.8s ease-in-out infinite alternate; }
	.character[data-anim='celebrate'] .person { animation:cheer .5s steps(2) infinite; }
	.character[data-anim='celebrate'] .arm { transform:rotate(155deg); }
	.character[data-anim='stress'] .person { animation:shake .22s steps(2) infinite; }
	.champagne-pop { position:absolute; right:2px; top:5px; width:28px; height:42px; z-index:22; pointer-events:none; }
	.champagne-bottle { position:absolute; left:9px; top:14px; width:8px; height:23px; background:#d5a946; border:2px solid #3d2819; border-radius:2px 2px 3px 3px; transform:rotate(25deg); transform-origin:50% 100%; animation:bottle-pop .5s steps(2) infinite; }
	.champagne-bottle::before { content:''; position:absolute; left:1px; top:-6px; width:4px; height:7px; background:#d5a946; border:2px solid #3d2819; border-bottom:0; }
	.champagne-bottle .cork { position:absolute; left:1px; top:-11px; width:4px; height:4px; background:#bd8751; border:1px solid #3d2819; }
	.champagne-bottle .label { position:absolute; left:1px; top:8px; width:4px; height:6px; background:#f5e6a5; }
	.bubble { position:absolute; width:3px; height:3px; background:#fff1a8; border:1px solid #8e6330; border-radius:50%; animation:fizz 1.1s steps(3) infinite; }
	.bubble-one { left:14px; top:4px; }.bubble-two { left:20px; top:10px; animation-delay:-.35s; }.bubble-three { left:7px; top:1px; animation-delay:-.7s; }
	.spray { position:absolute; left:13px; top:7px; width:3px; height:7px; background:#fff1a8; transform-origin:50% 100%; animation:spray .6s steps(2) infinite; }
	.spray-one { transform:rotate(-30deg); }.spray-two { transform:rotate(2deg); animation-delay:-.2s; }.spray-three { transform:rotate(30deg); animation-delay:-.4s; }
	@keyframes type { 50% { transform:rotate(-34deg); } }
	@keyframes bob { 50% { transform:translateY(-3px); } }
	@keyframes pace { from { transform:translateX(-4px); } to { transform:translateX(9px); } }
	@keyframes cheer { 50% { transform:translateY(-7px); } }
	@keyframes shake { 50% { transform:translateX(2px); } }
	@keyframes bottle-pop { 50% { transform:rotate(32deg) translateY(-2px); } }
	@keyframes fizz { 0% { opacity:0; transform:translate(0,5px); } 35% { opacity:1; } 100% { opacity:0; transform:translate(4px,-8px); } }
	@keyframes spray { 50% { opacity:.45; height:10px; } }

	.nameplate { position:absolute; bottom:0; left:5px; right:5px; z-index:10; min-height:30px; padding:3px 24px 3px 5px; background:#d0ad65; color:#2f1c12; border:2px solid #50321f; box-shadow:2px 2px 0 #25150d; font-family:var(--pixel, monospace); }
	.who { font-size:7px; font-weight:900; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.role { font-size:5px; letter-spacing:.08em; opacity:.78; white-space:nowrap; }
	.leverage { position:absolute; right:3px; top:4px; padding:2px 3px; font:900 7px var(--pixel, monospace); line-height:1; color:#17100b; background:var(--lev-color); border:1px solid #3a2418; cursor:pointer; }
	.leverage-input { width:31px; box-sizing:border-box; text-align:center; color:#f6e6bd; background:#17100b; border-color:#efc66f; cursor:text; }
	.leverage-input::-webkit-inner-spin-button, .leverage-input::-webkit-outer-spin-button { margin:0; }
	.leverage-input:focus { outline:1px solid #fff0aa; }
	.activity { position:absolute; right:7px; top:106px; z-index:12; padding:1px 3px; color:#d9ccb6; background:#2a211d; border:1px solid #5d4432; font:5px var(--mono, monospace); }

	.status-badge { position:absolute; left:1px; top:31px; z-index:15; padding:2px 4px; background:#33433b; color:#e6d9bf; border:2px solid #201713; font:6px var(--mono, monospace); text-transform:uppercase; letter-spacing:.05em; box-shadow:2px 2px 0 rgba(20,10,5,.45); }
	.blofin-badge { position:absolute; left:1px; top:48px; z-index:16; max-width:calc(100% - 4px); padding:2px 4px; background:#0c2a1c; color:#7dffb0; border:2px solid #1a5a3a; font:5px/1.1 var(--mono, monospace); letter-spacing:.04em; box-shadow:2px 2px 0 rgba(10,40,25,.55); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.blofin-badge::before { content:'BF '; opacity:.7; }
	.status-badge[data-status='open'] { background:#2e6d4d; color:#d6ffe2; }
	.status-badge[data-status='thinking'] { background:#8a682c; color:#fff2bd; }
	.status-badge[data-status='flat'] { background:#554a46; color:#c9bfb4; }
	.status-badge[data-status='stress'] { background:#8f392f; color:#ffe0d9; }
	.status-badge[data-status='celebrating'] { background:#2e7958; color:#edffb8; }
	.staff-note { position:absolute; top:27px; left:2px; right:2px; z-index:15; min-height:17px; padding:2px 4px; background:#f2e3b7; color:#39291c; border:2px solid #5c4129; box-shadow:2px 2px 0 rgba(30,15,7,.5); font:5px/1.2 var(--mono,monospace); transform:rotate(-1deg); }

	.thought { position:absolute; left:50%; bottom:118px; transform:translateX(-50%); z-index:30; min-width:0; max-width:min(115px, 96%); padding:5px 7px; color:#2e241c; background:#fff8da; border:2px solid #4c3827; box-shadow:3px 3px 0 rgba(38,20,10,.35); border-radius:11px; text-align:center; font:7px/1.2 var(--pixel,monospace); animation:float 1.9s ease-in-out infinite; }
	.thought i,.thought b { position:absolute; border:2px solid #4c3827; background:#fff8da; border-radius:50%; }
	.thought i { left:32px; bottom:-8px; width:8px; height:8px; }.thought b { left:27px; bottom:-14px; width:5px; height:5px; }
	@keyframes float { 50% { transform:translate(-50%,-2px); } }

	@media (max-width: 768px) {
		.character {
			max-width: 110px;
			min-height: 148px;
			/* touch-friendly hit area without clipping neighbors */
			touch-action: manipulation;
		}
		.who { font-size: 8px; }
		.role { font-size: 6px; }
		.leverage { font-size: 8px; padding: 3px 4px; }
		.leverage-input { width:38px; }
		.status-badge { font-size: 7px; padding: 3px 5px; }
		.staff-note { font-size: 6px; }
		.activity { font-size: 6px; }
		.thought { font-size: 8px; max-width: min(120px, 98%); }
	}
	@media (max-width: 480px) {
		.character { max-width: 96px; }
		.who { font-size: 7px; }
		.nameplate { padding: 3px 22px 3px 4px; min-height: 28px; }
	}
	@media (prefers-reduced-motion: reduce) { .character, .person, .arm, .thought, .champagne-bottle, .bubble, .spray { animation:none !important; } }
</style>
