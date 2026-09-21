<script lang="ts">
	import { getDeskBook, type DeskBookId } from '$lib/books/deskLibrary';

	let {
		open = $bindable(false),
		bookId = $bindable<DeskBookId | null>(null)
	}: {
		open?: boolean;
		bookId?: DeskBookId | null;
	} = $props();

	let pageIndex = $state(0);

	const book = $derived(getDeskBook(bookId));
	const pageCount = $derived(book ? Math.min(book.pages.length, 5) : 0);
	const pageText = $derived(
		book && pageCount > 0 ? book.pages[Math.min(pageIndex, pageCount - 1)] ?? '' : ''
	);

	$effect(() => {
		if (open && bookId) pageIndex = 0;
	});

	function close() {
		open = false;
		bookId = null;
		pageIndex = 0;
	}

	function prev() {
		if (pageIndex > 0) pageIndex -= 1;
	}

	function next() {
		if (pageIndex < pageCount - 1) pageIndex += 1;
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prev();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			next();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open && book}
	<div class="backdrop" role="presentation" onclick={close}></div>
	<div
		class="book-reader"
		role="dialog"
		aria-modal="true"
		aria-label={`${book.spineTitle} - desk primer`}
	>
		<header class="titlebar">
			<span class="badge">DESK LIBRARY</span>
			<strong>{book.spineTitle}</strong>
			<button type="button" class="x" onclick={close} aria-label="Close book">x</button>
		</header>

		<div class="page-sheet">
			<div class="page-curl" aria-hidden="true"></div>
			<p class="page-body">{pageText}</p>
			<div class="page-footer">
				<span>p. {pageIndex + 1} / {pageCount}</span>
				<span class="folio">PIXEL HEDGE FUND . desk primer</span>
			</div>
		</div>

		<nav class="pager" aria-label="Book pages">
			<button type="button" class="nav" disabled={pageIndex <= 0} onclick={prev}>PREV</button>
			<button type="button" class="nav close-mid" onclick={close}>Close</button>
			<button type="button" class="nav" disabled={pageIndex >= pageCount - 1} onclick={next}
				>NEXT</button
			>
		</nav>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 200000;
		background: rgba(12, 6, 2, 0.68);
	}
	.book-reader {
		position: fixed;
		z-index: 200001;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 24px));
		max-height: min(620px, calc(100vh - 24px));
		display: flex;
		flex-direction: column;
		background: #2a1c12;
		border: 4px solid #5a3a22;
		box-shadow:
			0 0 0 2px #1a1008,
			10px 12px 0 rgba(0, 0, 0, 0.5);
		font-family: Georgia, 'Times New Roman', serif;
		color: #2a1a0e;
		image-rendering: auto;
	}
	.titlebar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: linear-gradient(180deg, #6b4a2e 0%, #4a3220 100%);
		border-bottom: 3px solid #2a1a10;
		color: #f0d9a8;
		font-family: var(--mono, 'Courier New', monospace);
		font-size: 11px;
		letter-spacing: 0.04em;
	}
	.titlebar strong {
		flex: 1;
		font-weight: 800;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badge {
		flex-shrink: 0;
		padding: 2px 5px;
		background: #1a1208;
		border: 1px solid #c4a06a;
		font-size: 8px;
		letter-spacing: 0.1em;
	}
	.x {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border: 2px solid #1a1008;
		background: #8a6040;
		color: #1a1008;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		font-family: inherit;
	}
	.x:hover,
	.x:focus-visible {
		background: #c49060;
	}
	.page-sheet {
		position: relative;
		margin: 12px 14px 8px;
		padding: 18px 20px 14px;
		min-height: 220px;
		background:
			linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, transparent 40%),
			linear-gradient(180deg, #e8d4a8 0%, #d4bc8c 55%, #c8ae7a 100%);
		border: 2px solid #8a6a40;
		box-shadow:
			inset 0 0 30px rgba(80, 50, 20, 0.12),
			inset -18px 0 24px rgba(60, 40, 15, 0.08);
		overflow: hidden;
	}
	.page-curl {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 36px;
		height: 36px;
		background: linear-gradient(135deg, transparent 50%, #b89868 50%, #a88858 100%);
		box-shadow: -2px -2px 4px rgba(40, 20, 5, 0.15);
		pointer-events: none;
	}
	.page-body {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.55;
		letter-spacing: 0.01em;
		color: #2a1a0e;
		text-align: justify;
		hyphens: auto;
	}
	.page-footer {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: 16px;
		padding-top: 8px;
		border-top: 1px solid rgba(80, 50, 20, 0.25);
		font-family: var(--mono, 'Courier New', monospace);
		font-size: 9px;
		color: #5a4028;
		letter-spacing: 0.06em;
	}
	.folio {
		opacity: 0.75;
	}
	.pager {
		display: flex;
		gap: 8px;
		padding: 8px 14px 12px;
		background: #3a2818;
		border-top: 2px solid #1a1008;
	}
	.nav {
		flex: 1;
		padding: 8px 6px;
		border: 2px solid #1a1008;
		background: #c4a06a;
		color: #1a1008;
		font-family: var(--mono, 'Courier New', monospace);
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		cursor: pointer;
	}
	.nav:hover:not(:disabled),
	.nav:focus-visible:not(:disabled) {
		background: #e0c088;
	}
	.nav:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.close-mid {
		background: #8a6040;
		color: #f5e6c8;
	}
</style>
