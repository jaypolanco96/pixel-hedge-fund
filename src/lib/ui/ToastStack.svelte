<script lang="ts">
	import { dismissToast, toasts, type ToastItem } from '$lib/ui/toast';

	let items = $state<ToastItem[]>([]);

	$effect(() => {
		const unsub = toasts.subscribe((list) => {
			items = list;
		});
		return unsub;
	});
</script>

{#if items.length}
	<div class="toast-stack" aria-live="polite" aria-relevant="additions">
		{#each items as t (t.id)}
			<div class="toast" data-kind={t.kind} role="status">
				<strong>{t.title}</strong>
				{#if t.detail}
					<span>{t.detail}</span>
				{/if}
				<button type="button" class="x" onclick={() => dismissToast(t.id)} aria-label="Dismiss">x</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-stack {
		position: fixed;
		right: 14px;
		bottom: 14px;
		z-index: 400000;
		display: flex;
		flex-direction: column-reverse;
		gap: 8px;
		max-width: min(360px, calc(100vw - 24px));
		pointer-events: none;
		font-family: var(--mono, 'Courier New', monospace);
	}
	.toast {
		pointer-events: auto;
		position: relative;
		padding: 10px 28px 10px 12px;
		border: 3px solid #5a4a2f;
		background: #120e06;
		color: #e3d072;
		box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.55);
		image-rendering: pixelated;
	}
	.toast[data-kind='ok'] {
		border-color: #3d6b52;
		background: #0e1a14;
		color: #8fd4a8;
	}
	.toast[data-kind='err'] {
		border-color: #8a4a42;
		background: #1a0e0c;
		color: #ff8a7a;
	}
	.toast[data-kind='info'] {
		border-color: #4a5a7a;
		background: #0e121a;
		color: #a8c4ef;
	}
	.toast strong {
		display: block;
		font-size: 10px;
		letter-spacing: 0.08em;
		margin-bottom: 2px;
	}
	.toast span {
		display: block;
		font-size: 9px;
		line-height: 1.35;
		opacity: 0.92;
		word-break: break-word;
	}
	.x {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 20px;
		height: 20px;
		padding: 0;
		border: 1px solid currentColor;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font-size: 12px;
		line-height: 1;
		opacity: 0.7;
	}
	.x:hover {
		opacity: 1;
	}
</style>
