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
	let expandedNoteId = $state<string | null>(null);
	let wallEl = $state<HTMLDivElement>();
	let dragId: string | null = null;
	let dragPointer: number | null = null;
	let dragOffX = 0;
	let dragOffY = 0;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragMoved = false;
	const expandedNote = $derived(notes.find((note) => note.id === expandedNoteId) ?? null);

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
		if (expandedNoteId === id) expandedNoteId = null;
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
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragMoved = false;
		dragOffX = ((event.clientX - rect.left) / rect.width) * 100 - note.x;
		dragOffY = ((event.clientY - rect.top) / rect.height) * 100 - note.y;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onNotePointerMove(event: PointerEvent) {
		if (dragId == null || dragPointer !== event.pointerId || !wallEl) return;
		if (!dragMoved && Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) > 6) dragMoved = true;
		const rect = wallEl.getBoundingClientRect();
		const x = Math.min(92, Math.max(2, ((event.clientX - rect.left) / rect.width) * 100 - dragOffX));
		const y = Math.min(88, Math.max(4, ((event.clientY - rect.top) / rect.height) * 100 - dragOffY));
		notes = notes.map((n) => (n.id === dragId ? { ...n, x, y } : n));
	}

	function onNotePointerUp(event: PointerEvent, note?: StickyNote) {
		if (dragPointer !== event.pointerId) return;
		const clicked = !dragMoved;
		dragId = null;
		dragPointer = null;
		saveStickyNotes(notes);
		if (note && clicked) expandedNoteId = expandedNoteId === note.id ? null : note.id;
	}
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') expandedNoteId = null; }} />

<div class:has-expanded={!!expandedNote} class="sticky-layer" bind:this={wallEl} aria-label="Window sticky notes">
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
				onpointerup={(e) => onNotePointerUp(e, note)}
				onpointercancel={onNotePointerUp}
		>
			<button
				type="button"
				class="del"
				data-no-drag
				aria-label="Delete sticky note"
				onclick={() => removeNote(note.id)}>x</button
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
					placeholder="Stick a note on the glass..."
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

	{#if expandedNote}
		<div class="sticky-expanded-backdrop" role="presentation" onclick={() => (expandedNoteId = null)}>
			<dialog
				open
				class="sticky-expanded"
				style:background={expandedNote.color}
				aria-modal="true"
				aria-label={`Expanded sticky note: ${expandedNote.text}`}
				onclick={(event) => event.stopPropagation()}
			>
				<button type="button" class="expanded-close" aria-label="Close expanded sticky note" onclick={() => (expandedNoteId = null)}>x</button>
				<p>{expandedNote.text}</p>
				<small>CLICK OUTSIDE OR PRESS ESC TO CLOSE</small>
			</dialog>
		</div>
	{/if}
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
		color: #1b120c;
		font-weight: 800;
		user-select: none;
		touch-action: none;
	}
	.sticky:nth-child(even) {
		transform: translate(-50%, -20%) rotate(1.5deg);
	}
	.sticky p {
		margin: 0;
		font-size: 9px;
		font-weight: 900;
		line-height: 1.4;
		letter-spacing: 0.01em;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.24);
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
	.sticky-layer.has-expanded {
		z-index: 300000;
	}
	.sticky-expanded-backdrop {
		position: fixed;
		inset: 0;
		z-index: 300000;
		display: grid;
		place-items: center;
		background: rgba(7, 4, 3, 0.68);
		pointer-events: auto;
	}
	.sticky-expanded {
		position: relative;
		width: min(420px, calc(100vw - 32px));
		min-height: min(260px, calc(100vh - 96px));
		max-height: calc(100vh - 64px);
		overflow: auto;
		box-sizing: border-box;
		padding: 32px 26px 26px;
		border: 3px solid rgba(40, 25, 15, 0.56);
		box-shadow: 7px 8px 0 rgba(10, 5, 2, 0.55), inset 0 -10px 0 rgba(0, 0, 0, 0.06);
		transform: rotate(-1deg);
		color: #1b120c;
	}
	.sticky-expanded p {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: clamp(16px, 3vw, 23px);
		font-weight: 900;
		line-height: 1.45;
		letter-spacing: 0.02em;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.3);
	}
	.sticky-expanded small {
		display: block;
		margin-top: 28px;
		padding-top: 8px;
		border-top: 2px solid rgba(60, 35, 20, 0.35);
		font-size: 9px;
		font-weight: 900;
		letter-spacing: 0.05em;
		color: #523a28;
	}
	.expanded-close {
		position: absolute;
		top: 7px;
		right: 8px;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 2px solid #5a4030;
		background: rgba(255, 244, 193, 0.55);
		color: #3a2517;
		font: 900 18px/1 var(--mono, monospace);
		cursor: pointer;
	}
	@media (max-width: 768px) {
		.sticky {
			width: 78px;
			min-height: 64px;
		}
		.sticky p {
			font-size: 9px;
		}
		.sticky-expanded {
			width: calc(100vw - 24px);
			min-height: 220px;
			padding: 30px 20px 22px;
		}
		.sticky-expanded p {
			font-size: 17px;
		}
	}
</style>
