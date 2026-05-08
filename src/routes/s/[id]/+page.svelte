<script lang="ts">
  import type { PageData } from "./$types";
  import { enhance } from "$app/forms";
  import posthog from "posthog-js";
  import { onMount } from "svelte";

  let { data, form }: { data: PageData; form: import("./$types").ActionData } =
    $props();
  let buying = $state(false);

  const formattedTimestamp = $derived(
    new Date(data.drop.created_at)
      .toISOString()
      .replace("T", " ")
      .replace(/\..+/, " UTC"),
  );

  onMount(() => {
    if (data.justBought) {
      posthog.capture("purchase_completed", {
        drop_id: data.drop.id,
        price_usd: data.priceUsd,
      });
    } else {
      posthog.capture("drop_viewed", {
        drop_id: data.drop.id,
        price_usd: data.priceUsd,
        sold_count: data.drop.sold_count,
      });
    }
  });
</script>

<svelte:head>
  <title>{data.og.title}</title>
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="shirt.cash" />
  <meta property="og:title" content={data.og.title} />
  <meta property="og:description" content={data.og.description} />
  <meta property="og:image" content={data.og.image} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.og.title} />
  <meta name="twitter:description" content={data.og.description} />
  <meta name="twitter:image" content={data.og.image} />
  <meta name="description" content={data.og.description} />
</svelte:head>

<div class="container">
  <div class="topbar">
    <a class="mark" href="/" data-sveltekit-preload-data="hover">shirt.cash</a>
    <div class="live">DROP_LIVE</div>
  </div>

  <div class="drop-card">
    <div class="drop-meta">
      <span class="id">{data.drop.id}</span>
      <span>{formattedTimestamp}</span>
    </div>

    <div class="mockup">
      <img
        src={data.drop.mockup_url}
        alt="shirt mockup"
        loading="eager"
        decoding="async"
      />
    </div>

    <div class="quote">"{data.drop.prompt}"</div>

    <div class="ticker">
      <span class="label">PRICE</span>
      <span class="price"
        ><span class="small">$</span>{data.priceWhole}<span class="small"
          >.{String(data.priceCents).padStart(2, "0")}</span
        ></span
      >
    </div>

    <div class="stats">
      <div class="stat">
        <div class="v">{data.drop.sold_count}</div>
        <div class="k">SOLD</div>
      </div>
      <div class="stat">
        <div class="v">{data.drop.view_count}</div>
        <div class="k">VIEWED</div>
      </div>
      <div class="stat">
        <div class="v">{data.shipsIn === 0 ? "now" : `${data.shipsIn}d`}</div>
        <div class="k">{data.shipsIn === 0 ? "SHIPS" : "SHIPS IN"}</div>
      </div>
    </div>

    {#if data.justBought}
      <div class="thanks">✓ ORDERED · CHECK DISCORD FOR FULFILLMENT</div>
    {:else}
      <form
        method="POST"
        action="?/checkout"
        use:enhance={() => {
          buying = true;
          posthog.capture("checkout_initiated", {
            drop_id: data.drop.id,
            price_usd: data.priceUsd,
          });
          return async ({ result, update }) => {
            buying = false;
            if (result.type === "redirect") {
              // Stripe Checkout is external — SvelteKit's goto() can't reach it.
              window.location.href = result.location;
              return;
            }
            if (result.type === "failure") {
              posthog.capture("checkout_failed", {
                drop_id: data.drop.id,
                error: (result.data as { error?: string })?.error ?? "unknown",
              });
            }
            await update();
          };
        }}
      >
        <button type="submit" class="buy-btn" disabled={buying}>
          {buying ? "opening checkout..." : "Buy Drop →"}
        </button>
      </form>
      {#if form?.error}
        <div class="checkout-error">{form.error}</div>
      {/if}
      <div class="pay-row">APPLE PAY · GOOGLE PAY · CARD</div>
    {/if}
  </div>
</div>

<style>
  :global(html),
  :global(body) {
    background: #0a0a0c;
    color: #fff;
    margin: 0;
    min-height: 100vh;
  }
  :global(body) {
    font-family: "Space Grotesk", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    padding: 16px;
  }
  .container {
    max-width: 460px;
    margin: 0 auto;
  }
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 20px;
  }
  .mark {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: inherit;
    text-decoration: none;
  }
  .mark::before {
    content: "◆ ";
    color: #00ff88;
  }
  .mark:hover {
    opacity: 0.85;
  }
  .live {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    color: #00ff88;
    letter-spacing: 0.1em;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .live::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #00ff88;
    box-shadow: 0 0 8px #00ff88;
    animation: pulse 1.5s infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .live::before {
      animation: none;
    }
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .drop-card {
    background: linear-gradient(180deg, #16161a 0%, #0e0e10 100%);
    border: 1px solid #25252b;
    border-radius: 4px;
    padding: 0 0 20px;
    overflow: hidden;
  }
  .drop-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid #25252b;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: #8a8a93;
  }
  .drop-meta .id {
    color: #fff;
  }
  .mockup {
    width: 100%;
    aspect-ratio: 1/1;
    background: radial-gradient(ellipse at center, #1a1a22 0%, #0a0a0c 70%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mockup img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .quote {
    margin: 18px 18px 0;
    padding: 12px 14px;
    background: #0a0a0c;
    border-left: 2px solid #00ff88;
    font-size: 14px;
    line-height: 1.5;
    color: #c5c5cc;
    font-style: italic;
  }
  .ticker {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 18px 18px 8px;
  }
  .ticker .label {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    color: #8a8a93;
    letter-spacing: 0.1em;
  }
  .ticker .price {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -0.04em;
  }
  .ticker .price .small {
    font-size: 18px;
    color: #8a8a93;
    font-weight: 500;
    vertical-align: super;
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border-top: 1px solid #25252b;
    border-bottom: 1px solid #25252b;
    margin: 6px 18px 0;
    font-family: "JetBrains Mono", ui-monospace, monospace;
  }
  .stat {
    padding: 12px 0;
    text-align: center;
  }
  .stat + .stat {
    border-left: 1px solid #25252b;
  }
  .stat .v {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .stat .k {
    font-size: 9px;
    color: #8a8a93;
    letter-spacing: 0.1em;
    margin-top: 2px;
  }

  .buy-btn {
    display: block;
    width: calc(100% - 36px);
    margin: 16px 18px 0;
    padding: 18px;
    background: #00ff88;
    color: #0a0a0c;
    border: none;
    border-radius: 4px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
    cursor: pointer;
    min-height: 52px;
  }
  .buy-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .buy-btn:hover:not(:disabled) {
    background: #00cc6e;
  }
  .pay-row {
    text-align: center;
    padding-top: 10px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 9px;
    color: #8a8a93;
    letter-spacing: 0.12em;
  }
  .checkout-error {
    margin: 8px 18px 0;
    padding: 10px 12px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: #ff6e6e;
    border-left: 2px solid #ff4d4d;
    background: #1a0a0a;
  }
  .thanks {
    margin: 16px 18px 0;
    padding: 18px;
    border: 1px solid #00ff88;
    text-align: center;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #00ff88;
    font-size: 13px;
  }
</style>
