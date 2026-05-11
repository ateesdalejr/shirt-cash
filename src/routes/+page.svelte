<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import posthog from "posthog-js";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
  let lastPrompt = $state("");
  let promptValue = $state("");
  let placeholderText = $state("");
  let currentDropIndex = $state(0);
  let loadingWord = $state("conjuring");

  // Post-generation email-capture modal state. Lives only on this page and
  // sits between "generation succeeded" and "navigate to /s/[id]".
  let generatedDrop = $state<{ id: string; prompt: string; mockupUrl: string } | null>(null);
  let emailValue = $state("");
  let emailSubmitting = $state(false);
  let emailError = $state("");

  const EMAIL_PROMPT_SEEN_KEY = "shirtcash:email_prompted";

  async function navigateToDrop() {
    if (!generatedDrop) return;
    await goto(`/s/${generatedDrop.id}`);
  }

  async function submitEmail(e: SubmitEvent) {
    e.preventDefault();
    if (!generatedDrop || emailSubmitting) return;
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
        body: JSON.stringify({ email, dropId: generatedDrop.id }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        emailError =
          res.status === 429
            ? "slow down — try in a minute"
            : body || "couldn't save that — try again";
        posthog.capture("postgen_email_failed", {
          drop_id: generatedDrop.id,
          status: res.status,
        });
        emailSubmitting = false;
        return;
      }
      posthog.capture("postgen_email_submitted", {
        drop_id: generatedDrop.id,
      });
      sessionStorage.setItem(EMAIL_PROMPT_SEEN_KEY, "1");
      await navigateToDrop();
    } catch (err) {
      emailError = "network error — try again";
      posthog.capture("postgen_email_failed", {
        drop_id: generatedDrop.id,
        error: err instanceof Error ? err.message : "unknown",
      });
      emailSubmitting = false;
    }
  }

  async function skipEmail() {
    if (!generatedDrop) return;
    posthog.capture("postgen_email_skipped", {
      drop_id: generatedDrop.id,
    });
    sessionStorage.setItem(EMAIL_PROMPT_SEEN_KEY, "1");
    await navigateToDrop();
  }

  // Claude-flavored "thinking" verbs cycled on the button while the server
  // grinds through Replicate. Shuffled per-submit so it doesn't always start
  // on the same word.
  const LOADING_WORDS = [
    "conjuring",
    "pondering",
    "cogitating",
    "ruminating",
    "marinating",
    "deliberating",
    "synthesizing",
    "percolating",
    "noodling",
    "manifesting",
    "concocting",
    "brewing",
    "distilling",
    "wrangling",
    "ideating",
    "musing",
  ];

  $effect(() => {
    if (!submitting) return;
    let i = Math.floor(Math.random() * LOADING_WORDS.length);
    loadingWord = LOADING_WORDS[i];
    const interval = setInterval(() => {
      i = (i + 1) % LOADING_WORDS.length;
      loadingWord = LOADING_WORDS[i];
    }, 1200);
    return () => clearInterval(interval);
  });

  const FALLBACK_PLACEHOLDER =
    "a sad raccoon eating a hot pocket at 3am, in the style of a renaissance oil painting";

  // Recent drops drive the typewriter and the "no-text → existing shirt" jump.
  // Falls back to a single static prompt when D1 is empty (first deploy).
  const cycle = $derived(
    data.recentDrops.length > 0
      ? data.recentDrops
      : [{ id: "", prompt: FALLBACK_PLACEHOLDER, mockup_url: "" }],
  );

  // Marquee duplicates the list once so the CSS keyframe can translate -50%
  // and seam perfectly. Only built when there's at least 1 real drop.
  const marquee = $derived(
    data.recentDrops.length > 0
      ? [...data.recentDrops, ...data.recentDrops]
      : [],
  );

  $effect(() => {
    if (cycle.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const TYPE_MS = 45;
    const ERASE_MS = 20;
    const HOLD_MS = 1800;

    const run = async () => {
      // Outer loop kept by recursive setTimeout chain so it stays cancellable.
      let i = currentDropIndex;
      const tick = (fn: () => void, ms: number) => {
        timer = setTimeout(() => {
          if (cancelled) return;
          fn();
        }, ms);
      };

      const typeOut = (text: string, pos: number) => {
        if (cancelled) return;
        if (pos > text.length) {
          tick(() => eraseOut(text, text.length), HOLD_MS);
          return;
        }
        placeholderText = text.slice(0, pos);
        tick(() => typeOut(text, pos + 1), TYPE_MS);
      };

      const eraseOut = (text: string, pos: number) => {
        if (cancelled) return;
        if (pos < 0) {
          i = (i + 1) % cycle.length;
          currentDropIndex = i;
          tick(() => typeOut(cycle[i].prompt, 0), TYPE_MS);
          return;
        }
        placeholderText = text.slice(0, pos);
        tick(() => eraseOut(text, pos - 1), ERASE_MS);
      };

      typeOut(cycle[i].prompt, 0);
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  });
</script>

<svelte:head>
  <title>shirt.cash</title>
  <meta name="description" content="Turn a group chat joke into a shirt." />
  {#if data.turnstileSiteKey}
    <script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
      async
      defer
    ></script>
  {/if}
</svelte:head>

<main>
  <h1>shirt.cash</h1>
  <p class="tag">Turn a group chat joke into a shirt.</p>

  <form
    method="POST"
    onsubmit={(e) => {
      // Empty submit → jump to the shirt currently in the typewriter, if it
      // came from D1 (fallback has empty id).
      if (promptValue.trim() === "") {
        const target = cycle[currentDropIndex];
        if (target?.id) {
          e.preventDefault();
          posthog.capture("recent_shirt_clicked", { drop_id: target.id });
          goto(`/s/${target.id}`);
        }
      }
    }}
    use:enhance={({ formData, cancel }) => {
      const prompt = (formData.get("prompt") ?? "").toString().trim();
      if (!prompt) {
        // onsubmit already navigated; cancel the POST.
        cancel();
        return;
      }
      submitting = true;
      lastPrompt = prompt;
      posthog.capture("shirt_generation_submitted", {
        prompt_length: lastPrompt.length,
      });
      return async ({ result, update }) => {
        submitting = false;
        if (result.type === "failure") {
          posthog.capture("shirt_generation_failed", {
            error: (result.data as { error?: string })?.error ?? "unknown",
            prompt_length: lastPrompt.length,
          });
          await update();
          return;
        }
        if (result.type === "success") {
          const drop = (result.data as { drop?: typeof generatedDrop } | undefined)?.drop;
          if (drop?.id) {
            generatedDrop = drop;
            posthog.capture("postgen_email_shown", {
              drop_id: drop.id,
            });
            // Skip update() — the action's `form` return would render below
            // the modal; we want the modal to be the only post-success UI.
            return;
          }
        }
        await update();
      };
    }}
  >
    <label for="prompt">describe the shirt</label>
    <textarea
      id="prompt"
      name="prompt"
      rows="3"
      maxlength="500"
      placeholder={placeholderText}
      bind:value={promptValue}
    ></textarea>
    {#if data.turnstileSiteKey}
      <div
        class="cf-turnstile"
        data-sitekey={data.turnstileSiteKey}
        data-theme="dark"
      ></div>
    {/if}
    <button type="submit" disabled={submitting}>
      {#if submitting}
        <span class="spinner" aria-hidden="true"></span>
        {#key loadingWord}
          <span class="loading-word">{loadingWord}...</span>
        {/key}
      {:else}
        make the shirt →
      {/if}
    </button>
  </form>

  {#if form?.error}
    <div class="error">
      <p>generation failed: {form.error}</p>
      <p class="hint">try again — replicate sometimes hangs.</p>
    </div>
  {/if}
</main>

{#if marquee.length > 0}
  <section class="carousel" aria-label="recent drops">
    <div class="carousel-label">recent drops</div>
    <div class="carousel-viewport">
      <div class="carousel-track">
        {#each marquee as drop, i (i)}
          <a class="card" href="/s/{drop.id}" aria-label={drop.prompt}>
            <img
              src={drop.mockup_url}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span class="card-prompt">{drop.prompt}</span>
          </a>
        {/each}
      </div>
    </div>
  </section>
{/if}

{#if generatedDrop}
  <div class="email-backdrop" role="presentation"></div>
  <div
    class="email-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="postgen-title"
  >
    <div class="email-preview">
      <img src={generatedDrop.mockupUrl} alt="your new shirt" />
    </div>
    <h2 id="postgen-title">your shirt is ready</h2>
    <p class="email-sub">
      we ship a new one every week. drop your email and we'll send you the
      next batch first — or skip ahead to see what we made you.
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
        {emailSubmitting ? "saving..." : "send me drops + see my shirt →"}
      </button>
    </form>
    {#if emailError}
      <div class="email-error">{emailError}</div>
    {/if}
    <button
      type="button"
      class="email-skip"
      onclick={skipEmail}
      disabled={emailSubmitting}>skip to my shirt →</button
    >
  </div>
{/if}

<footer class="site-footer">
  <span>by</span>
  <a
    href="https://x.com/divinesturgeon"
    target="_blank"
    rel="noopener noreferrer">@divinesturgeon</a
  >
  <span class="dot">·</span>
  <a
    href="https://linkedin.com/in/andrew-teesdale-jr"
    target="_blank"
    rel="noopener noreferrer">linkedin</a
  >
</footer>

<style>
  :global(body) {
    background: #0a0a0c;
    color: #fff;
    font-family: "Space Grotesk", system-ui, sans-serif;
    margin: 0;
    min-height: 100vh;
  }
  main {
    max-width: 460px;
    margin: 0 auto;
    padding: 48px 20px;
  }
  h1 {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.04em;
    margin: 0 0 4px;
  }
  h1::before {
    content: "◆ ";
    color: #00ff88;
  }
  .tag {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 12px;
    color: #6e6e7a;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 0 0 32px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  label {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: #8a8a93;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  textarea {
    background: #16161a;
    border: 1px solid #25252b;
    border-radius: 4px;
    color: #fff;
    font-family: inherit;
    font-size: 16px;
    padding: 14px;
    resize: vertical;
    min-height: 96px;
  }
  textarea:focus {
    outline: none;
    border-color: #00ff88;
  }
  button {
    background: #00ff88;
    color: #0a0a0c;
    border: none;
    border-radius: 4px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 700;
    padding: 16px;
    cursor: pointer;
    min-height: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(10, 10, 12, 0.25);
    border-top-color: #0a0a0c;
    animation: spin 0.7s linear infinite;
  }
  .loading-word {
    /* fade each new word in so the swap feels intentional, not a glitch */
    animation: word-fade 0.25s ease;
    font-variant-numeric: tabular-nums;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes word-fade {
    from {
      opacity: 0.3;
    }
    to {
      opacity: 1;
    }
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  button:hover:not(:disabled) {
    background: #00cc6e;
  }
  .error {
    margin-top: 24px;
    padding: 12px 14px;
    background: #1a0a0a;
    border-left: 2px solid #ff4d4d;
    font-size: 14px;
  }
  .error .hint {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: #8a8a93;
    margin-top: 6px;
  }
  .carousel {
    margin: 16px 0 64px;
  }
  .carousel-label {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: #8a8a93;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    max-width: 460px;
    margin: 0 auto 16px;
    padding: 0 20px;
  }
  .carousel-viewport {
    overflow: hidden;
    /* fade edges so cards melt into the background */
    -webkit-mask-image: linear-gradient(
      to right,
      transparent,
      black 8%,
      black 92%,
      transparent
    );
    mask-image: linear-gradient(
      to right,
      transparent,
      black 8%,
      black 92%,
      transparent
    );
  }
  .carousel-track {
    display: flex;
    gap: 16px;
    width: max-content;
    padding: 4px 0;
    animation: scroll 60s linear infinite;
  }
  .carousel-viewport:hover .carousel-track {
    animation-play-state: paused;
  }
  @keyframes scroll {
    from {
      transform: translateX(0);
    }
    to {
      /* gap (16) gets added once per item, so the duplicated half ends exactly
         one gap past the original — translate by -50% lands on a seam. */
      transform: translateX(calc(-50% - 8px));
    }
  }
  .card {
    flex: 0 0 auto;
    width: 160px;
    background: #16161a;
    border: 1px solid #25252b;
    border-radius: 4px;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition:
      border-color 0.15s ease,
      transform 0.15s ease;
  }
  .card:hover {
    border-color: #00ff88;
    transform: translateY(-2px);
  }
  .card img {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    background: #0a0a0c;
  }
  .card-prompt {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    line-height: 1.4;
    color: #8a8a93;
    padding: 8px 10px 10px;
  }
  @media (prefers-reduced-motion: reduce) {
    .carousel-track {
      animation: none;
    }
    .carousel-viewport {
      overflow-x: auto;
    }
  }
  .site-footer {
    max-width: 460px;
    margin: 0 auto;
    padding: 0 20px 48px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: #6e6e7a;
    letter-spacing: 0.06em;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .site-footer a {
    color: #8a8a93;
    text-decoration: none;
    border-bottom: 1px solid #25252b;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .site-footer a:hover {
    color: #00ff88;
    border-color: #00ff88;
  }
  .site-footer .dot {
    color: #3a3a42;
  }
  .email-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
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
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    background: #16161a;
    border: 1px solid #25252b;
    border-radius: 6px;
    padding: 20px 24px 22px;
    z-index: 51;
    animation: pop-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .email-preview {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 4px;
    overflow: hidden;
    background: radial-gradient(ellipse at center, #1a1a22 0%, #0a0a0c 70%);
    margin-bottom: 16px;
  }
  .email-preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    filter: blur(16px);
    /* nudge the scale up so the blur halo doesn't show the dark card edge */
    transform: scale(1.05);
  }
  .email-modal h2 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.03em;
    margin: 0 0 8px;
  }
  .email-modal h2::before {
    content: "◆ ";
    color: #00ff88;
  }
  .email-sub {
    font-size: 13px;
    line-height: 1.5;
    color: #8a8a93;
    margin: 0 0 16px;
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
  .email-skip:hover:not(:disabled) {
    color: #8a8a93;
  }
  .email-skip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
