"use client";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";

interface Props {
  articleId: string;
  articleTitle: string;
}

export function ReportArticleButton({ articleId, articleTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"MISINFORMATION" | "COPYRIGHT" | "HARASSMENT" | "SPAM" | "OTHER">("MISINFORMATION");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/articles/${articleId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details: details.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Unable to submit report. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label="Report this article"
        title="Report this article"
        onClick={() => {
          setOpen(true);
          setSubmitted(false);
          setError(null);
        }}
      >
        <Icon name="flag" size={18} />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: "var(--sp-4)",
          }}
        >
          <div
            className="panel stack"
            style={{
              maxWidth: 480,
              width: "100%",
              background: "#ffffff",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 id="report-modal-title" style={{ fontSize: "var(--fs-lg)" }}>
                Report Article
              </h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            {submitted ? (
              <div className="stack" style={{ paddingBlock: "var(--sp-3)" }}>
                <p>
                  <strong>Thank you for notifying us.</strong>
                </p>
                <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                  Our editorial review board will inspect &ldquo;{articleTitle}&rdquo; against our standards of accuracy and integrity.
                </p>
                <div style={{ marginTop: "var(--sp-2)" }}>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="stack">
                <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                  Flag issues regarding accuracy, copyright, or ethical standards for &ldquo;{articleTitle}&rdquo;.
                </p>

                {error ? (
                  <p role="alert" className="auth__field-error">
                    {error}
                  </p>
                ) : null}

                <div className="auth__field">
                  <label htmlFor="report-reason">Reason</label>
                  <select
                    id="report-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value as typeof reason)}
                  >
                    <option value="MISINFORMATION">Inaccurate or false reporting</option>
                    <option value="COPYRIGHT">Copyright infringement / plagiarism</option>
                    <option value="HARASSMENT">Harassment or hate speech</option>
                    <option value="SPAM">Spam, undeclared advertisement or clickbait</option>
                    <option value="OTHER">Other editorial concern</option>
                  </select>
                </div>

                <div className="auth__field">
                  <label htmlFor="report-details">Additional details (optional)</label>
                  <textarea
                    id="report-details"
                    rows={3}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    maxLength={1000}
                    placeholder="Provide specific paragraphs or source links..."
                  />
                </div>

                <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setOpen(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
                    {busy ? "Submitting…" : "Submit Report"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
