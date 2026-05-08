import posthog from "posthog-js";
import { PUBLIC_POSTHOG_PROJECT_TOKEN } from "$env/static/public";
import type { HandleClientError } from "@sveltejs/kit";

// hooks.client.ts only runs in the browser. Initialize PostHog at module top
// so the call fires the moment the script loads — using the `init` export
// pattern was racing against the first navigation and skipping the initial
// pageview.
if (PUBLIC_POSTHOG_PROJECT_TOKEN) {
  posthog.init(PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    capture_pageview: true,
    capture_pageleave: true,
  });
}

export const handleError: HandleClientError = async ({
  error,
  status,
  message,
}) => {
  posthog.captureException(error);

  return {
    message,
    status,
  };
};
