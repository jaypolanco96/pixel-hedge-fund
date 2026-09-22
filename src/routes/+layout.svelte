<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import './layout.css';
	import { page } from '$app/state';

	let { children } = $props();
</script>

<svelte:head>
	<title>Pixel Hedge Fund</title>
	<meta name="description" content="Pixel hedge-fund office sim with live crypto TA on Bybit and BloFin." />
	<meta name="theme-color" content="#241914" />
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
	<link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/site.webmanifest" />
	<link rel="canonical" href={page.url.origin + page.url.pathname} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Pixel Hedge Fund" />
	<meta property="og:title" content="Pixel Hedge Fund" />
	<meta property="og:description" content="Pixel hedge-fund office sim with live crypto TA on Bybit and BloFin." />
	<meta property="og:url" content={page.url.origin + page.url.pathname} />
	<meta property="og:image" content={page.url.origin + '/icon-512.png'} />
	<meta name="twitter:card" content="summary" />
</svelte:head>

{@render children()}
