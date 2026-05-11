<script lang="ts">
  import type { PageData } from "./$types";
  import { enhance } from "$app/forms";
  import posthog from "posthog-js";
  import { onMount } from "svelte";

  let { data, form }: { data: PageData; form: import("./$types").ActionData } =
    $props();
  let buying = $state(false);

  let emailModalOpen = $state(false);
  let emailValue = $state("");
  let emailSubmitting = $state(false);
  let emailError = $state("");
  let emailDone = $state(false);

  const formattedTimestamp = $derived(
    new Date(data.drop.created_at)
      .toISOString()
      .replace("T", " ")
      .replace(/\..+/, " UTC"),
  );

  // Session-scoped key so a returning visitor sees the prompt once per
  // browsing session, not on every drop they look at.
  const EMAIL_PROMPT_SEEN_KEY = "shirtcash:email_prompted";

  function openEmailModal(trigger: "exit_intent" | "tab_hidden") {
    if (emailModalOpen || emailDone) return;
    if (sessionStorage.getItem(EMAIL_PROMPT_SEEN_KEY)) return;
    sessionStorage.setItem(EMAIL_PROMPT_SEEN_KEY, "1");
    emailModalOpen = true;
    posthog.capture("email_prompt_shown", {
      drop_id: data.drop.id,
      trigger,
    });
  }

  function dismissEmailModal() {
    emailModalOpen = false;
    posthog.capture("email_prompt_dismissed", { drop_id: data.drop.id });
  }

  async function submitEmail(e: SubmitEvent) {
    e.preventDefault();
    if (emailSubmitting) return;
    emailError = "";
    const email = emailValue.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailError = "that doesn't look like an email";
      return;
    }
    emailSubmitting = true;
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, dropId: data.drop.id }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        emailError =
          res.status === 429
            ? "slow down — try in a minute"
            : body || "couldn't save that — try again";
        posthog.capture("email_prompt_failed", {
          drop_id: data.drop.id,
          status: res.status,
        });
      } else {
        emailDone = true;
        posthog.capture("email_prompt_submitted", { drop_id: data.drop.id });
      }
    } catch (err) {
      emailError = "network error — try again";
      posthog.capture("email_prompt_failed", {
        drop_id: data.drop.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      emailSubmitting = false;
    }
  }

  onMount(() => {
    if (data.justBought) {
      posthog.capture("purchase_completed", {
        drop_id: data.drop.id,
        price_usd: data.priceUsd,
      });
      // Don't pester paying customers.
      return;
    }

    posthog.capture("drop_viewed", {
      drop_id: data.drop.id,
      price_usd: data.priceUsd,
      sold_count: data.drop.sold_count,
    });

    // Exit-intent (desktop): mouse leaves through the top edge of the viewport.
    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) openEmailModal("exit_intent");
    };
    // Tab/app switch (rough mobile fallback): page becomes hidden.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden")
        openEmailModal("tab_hidden");
    };
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
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

{#if emailModalOpen}
  <div
    class="email-backdrop"
    onclick={dismissEmailModal}
    role="presentation"
  ></div>
  <div
    class="email-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="email-modal-title"
  >
    <button
      type="button"
      class="email-close"
      aria-label="close"
      onclick={dismissEmailModal}>×</button
    >
    {#if emailDone}
      <div class="email-done">
        <div class="email-done-mark">✓</div>
        <h2 id="email-modal-title">you're on the list</h2>
        <p>we'll ping you when the next batch drops.</p>
      </div>
    {:else}
      <h2 id="email-modal-title">first dibs on the next drop?</h2>
      <p class="email-sub">
        we ship a new shirt every week. drop your email — we'll send you the
        next one before it hits the homepage.
      </p>
      <form onsubmit={submitEmail}>
        <input
          type="email"
          name="email"
          placeholder="you@somewhere.com"
          autocomplete="email"
          bind:value={emailValue}
          disabled={emailSubmitting}
          required
        />
        <button type="submit" disabled={emailSubmitting}>
          {emailSubmitting ? "saving..." : "keep me posted →"}
        </button>
      </form>
      {#if emailError}
        <div class="email-error">{emailError}</div>
      {/if}
      <button
        type="button"
        class="email-skip"
        onclick={dismissEmailModal}>no thanks</button
      >
    {/if}
  </div>
{/if}

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
  .email-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    z-index: 50;
    animation: fade-in 0.18s ease;
  }
  .email-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: calc(100% - 32px);
    max-width: 380px;
    background: #16161a;
    border: 1px solid #25252b;
    border-radius: 6px;
    padding: 28px 24px 22px;
    z-index: 51;
    animation: pop-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .email-close {
    position: absolute;
    top: 8px;
    right: 10px;
    background: none;
    border: none;
    color: #6e6e7a;
    font-size: 22px;
    line-height: 1;
    padding: 6px 10px;
    cursor: pointer;
  }
  .email-close:hover {
    color: #fff;
  }
  .email-modal h2 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.03em;
    margin: 0 0 8px;
  }
  .email-sub {
    font-size: 13px;
    line-height: 1.5;
    color: #8a8a93;
    margin: 0 0 18px;
  }
  .email-modal form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .email-modal input {
    background: #0a0a0c;
    border: 1px solid #25252b;
    border-radius: 4px;
    color: #fff;
    font-family: inherit;
    font-size: 15px;
    padding: 12px 14px;
  }
  .email-modal input:focus {
    outline: none;
    border-color: #00ff88;
  }
  .email-modal button[type="submit"] {
    background: #00ff88;
    color: #0a0a0c;
    border: none;
    border-radius: 4px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    padding: 13px;
    cursor: pointer;
    min-height: 46px;
  }
  .email-modal button[type="submit"]:hover:not(:disabled) {
    background: #00cc6e;
  }
  .email-modal button[type="submit"]:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .email-error {
    margin-top: 10px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: #ff6e6e;
  }
  .email-skip {
    margin-top: 12px;
    width: 100%;
    background: none;
    border: none;
    color: #6e6e7a;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 6px;
  }
  .email-skip:hover {
    color: #8a8a93;
  }
  .email-done {
    text-align: center;
    padding: 8px 0;
  }
  .email-done-mark {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 2px solid #00ff88;
    color: #00ff88;
    font-size: 22px;
    line-height: 40px;
    margin: 0 auto 12px;
  }
  .email-done h2 {
    color: #00ff88;
  }
  .email-done p {
    font-size: 13px;
    color: #8a8a93;
    margin: 0;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
