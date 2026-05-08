<script lang="ts">
  import { enhance } from "$app/forms";
  import posthog from "posthog-js";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
  let lastPrompt = $state("");
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
    use:enhance={({ formData }) => {
      submitting = true;
      lastPrompt = (formData.get("prompt") ?? "").toString().trim();
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
      placeholder="a sad raccoon eating a hot pocket at 3am, in the style of a renaissance oil painting"
      required
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
