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
        }
        await update();
        if (result.type === "redirect") return;
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
      {submitting ? "generating..." : "make the shirt →"}
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
</style>
