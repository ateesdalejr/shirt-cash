<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>shirt.cash · {page.status === 404 ? 'drop not found' : 'something broke'}</title>
</svelte:head>

<main>
	<a class="mark" href="/">shirt.cash</a>
	{#if page.status === 404}
		<h1>this drop didn't make it.</h1>
		<p class="sub">lost in the chat.</p>
	{:else}
		<h1>something broke.</h1>
		<p class="sub">{page.error?.message ?? 'try again in a moment.'}</p>
	{/if}
	<a href="/" class="back">← back to shirt.cash</a>
</main>

<style>
	:global(html), :global(body) {
		background: #0a0a0c;
		color: #fff;
		margin: 0;
		min-height: 100vh;
	}
	:global(body) { font-family: 'Space Grotesk', system-ui, sans-serif; }
	main {
		max-width: 460px; margin: 0 auto; padding: 64px 20px;
		min-height: 100vh; display: flex; flex-direction: column; justify-content: center;
	}
	.mark {
		font-size: 14px; font-weight: 700; letter-spacing: -0.03em;
		margin-bottom: 32px; color: inherit; text-decoration: none;
		align-self: flex-start;
	}
	.mark::before { content: '◆ '; color: #00ff88; }
	.mark:hover { opacity: 0.85; }
	h1 { font-size: 32px; font-weight: 700; line-height: 1.15; letter-spacing: -0.04em; margin: 0 0 12px; }
	.sub {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 12px; color: #8a8a93; letter-spacing: 0.06em;
		margin: 0 0 48px; text-transform: uppercase;
	}
	.back {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 13px; color: #00ff88; text-decoration: none;
		letter-spacing: 0.04em;
	}
	.back:hover { text-decoration: underline; }
</style>
