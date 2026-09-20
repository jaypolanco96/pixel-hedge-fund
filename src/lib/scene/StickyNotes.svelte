<script lang="ts">
	import {
		STICKY_COLORS,
		loadStickyNotes,
		saveStickyNotes,
		newStickyId,
		type StickyNote
	} from '$lib/persist/stickyNotes';
	import { onMount } from 'svelte';

	let notes = $state<StickyNote[]>([]);
	let draft = $state('');
	let colorIdx = $state(0);
	let composerOpen = $state(false);
	let wallEl = $state<HTMLDivElement>();
	let dragId: string | null = null;
	let dragPointer: number | null = null;
	let dragOffX = 0;
	let dragOffY = 0;

	onMount(() => {
		notes = loadStickyNotes();
	});

	function persist(next: StickyNote[]) {
		notes = next;
		saveStickyNotes(next);
	}

	function addNote() {
		const text = draft.trim().slice(0, 140);
		if (!text) return;
		const n: StickyNote = {
			id: newStickyId(),
			text,
			x: 12 + Math.random() * 60,
			y: 18 + Math.random() * 40,
			color: STICKY_COLORS[colorIdx % STICKY_COLORS.length],
			createdAt: Date.now()
		};
		persist([...notes, n]);
		draft = '';
		composerOpen = false;
	}

	function removeNote(id: string) {
		persist(notes.filter((n) => n.id !== id));
	}

	function onNotePointerDown(event: PointerEvent, note: StickyNote) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('[data-no-drag]')) return;
		if (!wallEl) return;
		event.preventDefault();
		const rect = wallEl.getBoundingClientRect();
		dragId = note.id;
		dragPointer = event.pointerId;
		dragOffX = ((event.clientX - rect.left) / rect.width) * 100 - note.x;
		dragOffY = ((event.clientY - rect.top) / rect.height) * 100 - note.y;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onNotePointerMove(event: PointerEvent) {
		if (dragId == null || dragPointer !== event.pointerId || !wallEl) return;
		const rect = wallEl.getBoundingClientRect();
		const x = Math.min(92, Math.max(2, ((event.clientX - rect.left) / rect.width) * 100 - dragOffX));
		const y = Math.min(88, Math.max(4, ((event.clientY - rect.top) / rect.height) * 100 - dragOffY));
		notes = notes.map((n) => (n.id === dragId ? { ...n, x, y } : n));
	}

	function onNotePointerUp(event: PointerEvent) {
		if (dragPointer !== event.pointerId) return;
		dragId = null;
		dragPointer = null;
		saveStickyNotes(notes);
	}
</script>

<div class="sticky-layer" bind:this={wallEl} aria-label="Window sticky notes">
	{#each notes as note (note.id)}
		<div
			class="sticky"
			style:left={`${note.x}%`}
			style:top={`${note.y}%`}
			style:background={note.color}
			role="group"
			aria-label={`Sticky note: ${note.text}`}
			onpointerdown={(e) => onNotePointerDown(e, note)}
			onpointermove={onNotePointerMove}
			onpointerup={onNotePointerUp}
			onpointercancel={onNotePointerUp}
		>
			<button
				type="button"
				class="del"
				data-no-drag
				aria-label="Delete sticky note"
				onclick={() => removeNote(note.id)}>×</button
			>
			<p>{note.text}</p>
		</div>
	{/each}

	<div class="sticky-composer">
		{#if composerOpen}
			<div class="composer-card">
				<textarea
					bind:value={draft}
					maxlength={140}
					rows={3}
					placeholder="Stick a note on the glass…"
					aria-label="Sticky note text"
				></textarea>
				<div class="swatches">
					{#each STICKY_COLORS as c, i}
						<button
							type="button"
							class="swatch"
							class:active={colorIdx === i}
							style:background={c}
							aria-label={`Color ${i + 1}`}
							onclick={() => (colorIdx = i)}
						></button>
					{/each}
				</div>
				<div class="composer-actions">
					<button type="button" class="primary" onclick={addNote}>Stick</button>
					<button type="button" onclick={() => (composerOpen = false)}>Cancel</button>
				</div>
			</div>
		{:else}
			<button type="button" class="add-btn" onclick={() => (composerOpen = true)}
				>+ NOTE</button
			>
		{/if}
	</div>
</div>

<style>
	.sticky-layer {
		position: absolute;
		inset: 10px 8px 0;
		z-index: 6;
		pointer-events: none;
	}
	.sticky,
	.sticky-composer {
		pointer-events: auto;
	}
	.sticky {
		position: absolute;
		width: 88px;
		min-height: 72px;
		padding: 10px 8px 8px;
		border: 2px solid rgba(40, 25, 15, 0.35);
		box-shadow:
			2px 3px 0 rgba(20, 10, 5, 0.35),
			inset 0 -6px 0 rgba(0, 0, 0, 0.06);
		transform: translate(-50%, -20%) rotate(-2deg);
		cursor: grab;
		font-family: var(--mono, monospace);
		color: #2a1c12;
		user-select: none;
		touch-action: none;
	}
	.sticky:nth-child(even) {
		transform: translate(-50%, -20%) rotate(1.5deg);
	}
	.sticky p {
		margin: 0;
		font-size: 7px;
		line-height: 1.35;
		word-break: break-word;
	}
	.del {
		position: absolute;
		top: 1px;
		right: 2px;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		background: transparent;
		color: #5a4030;
		font-size: 12px;
		cursor: pointer;
		line-height: 1;
	}
	.sticky-composer {
		position: absolute;
		right: 6px;
		bottom: 10px;
		z-index: 8;
	}
	.add-btn {
		padding: 4px 8px;
		font: 7px var(--mono, monospace);
		letter-spacing: 0.08em;
		background: #f2e3b7;
		color: #39291c;
		border: 2px solid #5c4129;
		box-shadow: 2px 2px 0 rgba(20, 10, 5, 0.4);
		cursor: pointer;
	}
	.composer-card {
		width: 150px;
		padding: 6px;
		background: #1a1512;
		border: 2px solid #9c7040;
		box-shadow: 3px 3px 0 rgba(10, 5, 2, 0.5);
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		resize: none;
		font: 8px var(--mono, monospace);
		background: #f5eedc;
		color: #1e1610;
		border: 1px solid #6a5038;
		padding: 4px;
	}
	.swatches {
		display: flex;
		gap: 4px;
		margin: 5px 0;
	}
	.swatch {
		width: 14px;
		height: 14px;
		border: 2px solid transparent;
		cursor: pointer;
		padding: 0;
	}
	.swatch.active {
		border-color: #efc66f;
	}
	.composer-actions {
		display: flex;
		gap: 4px;
	}
	.composer-actions button {
		font: 7px var(--mono, monospace);
		padding: 3px 6px;
		cursor: pointer;
		background: #2a211d;
		color: #c9a878;
		border: 1px solid #5a4030;
	}
	.composer-actions .primary {
		background: #3a5a3a;
		color: #d6ffe2;
		border-color: #2e6d4d;
	}
	@media (max-width: 768px) {
		.sticky {
			width: 78px;
			min-height: 64px;
		}
		.sticky p {
			font-size: 8px;
		}
	}
</style>
