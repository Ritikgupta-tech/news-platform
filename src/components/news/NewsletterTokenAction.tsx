"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

type State = { kind: "idle" } | { kind: "working" } | { kind: "done" } | { kind: "error"; message: string };

const COPY = {
  verify: { endpoint: "/api/v1/newsletter/verify", prompt: "Confirm that you want to receive the E News newsletter.", button: "Confirm subscription", done: "You’re subscribed. Thank you!" },
  unsubscribe: { endpoint: "/api/v1/newsletter/unsubscribe", prompt: "You will stop receiving the E News newsletter.", button: "Unsubscribe", done: "You’ve been unsubscribed. We won’t email you again." },
} as const;

/**
 * Confirmation and unsubscribe links open a page with a button instead of acting on GET, so mail scanners
 * and link previewers that "click" every link cannot subscribe or unsubscribe anyone by accident.
 */
export function NewsletterTokenAction({ kind, token }: { kind: keyof typeof COPY; token: string }) {
  const c = COPY[kind];
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    setState({ kind: "working" });
    try {
      const res = await fetch(c.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (res.ok) return setState({ kind: "done" });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setState({ kind: "error", message: res.status === 400 ? "This link is invalid or has expired." : (body?.error?.message ?? "Something went wrong. Please try again.") });
    } catch {
      setState({ kind: "error", message: "Network error. Please try again." });
    }
  }

  return (
    <div className="stack">
      {state.kind === "done" ? null : <p>{c.prompt}</p>}
      {state.kind === "done" ? <p role="status">{c.done}</p> : <Button onClick={run} disabled={state.kind === "working"}>{state.kind === "working" ? "Working…" : c.button}</Button>}
      {state.kind === "error" ? <p role="alert" className="form-status form-status--error">{state.message}</p> : null}
    </div>
  );
}
