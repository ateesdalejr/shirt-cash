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
      : [{ id: "", prompt: FALLBACK_PLACEHOLDER }],
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
</style>
