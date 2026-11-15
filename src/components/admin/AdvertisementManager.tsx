"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/reader/ActionButton";
import { errorMessage } from "./api";
import type { AdvertisementDto } from "@/server/advertisements/service";

export function AdvertisementManager({ advertisements }: { advertisements: AdvertisementDto[] }) {
  const router = useRouter();
  const uid = useId();
  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState("HOME_PROMO");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/admin/advertisements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          placement,
          imageUrl,
          linkUrl,
          isActive: true,
        }),
      });
      if (!res.ok) {
        setMsg({ ok: false, text: await errorMessage(res) });
        return;
      }
      setTitle("");
      setImageUrl("");
      setLinkUrl("");
      setMsg({ ok: true, text: "Advertisement created successfully." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form onSubmit={create} className="panel stack" aria-label="Create advertisement">
        <h2>Add Advertisement / Banner</h2>
        <div className="form-grid">
          <div className="auth__field">
            <label htmlFor={`${uid}-t`}>Title / Campaign Name</label>
            <input
              id={`${uid}-t`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Summer Tech Summit 2026"
              required
              minLength={2}
              maxLength={120}
            />
          </div>
          <div className="auth__field">
            <label htmlFor={`${uid}-p`}>Placement Slot</label>
            <select
              id={`${uid}-p`}
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
            >
              <option value="HOME_PROMO">Home Promo Banner (bottom)</option>
              <option value="SIDEBAR">Sidebar (articles & feeds)</option>
              <option value="HERO_SPONSOR">Hero Sponsor Tag</option>
              <option value="FOOTER_BANNER">Footer Banner</option>
            </select>
          </div>
          <div className="auth__field">
            <label htmlFor={`${uid}-img`}>Image URL</label>
            <input
              id={`${uid}-img`}
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              required
              maxLength={1000}
            />
          </div>
          <div className="auth__field">
            <label htmlFor={`${uid}-lnk`}>Destination URL</label>
            <input
              id={`${uid}-lnk`}
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com/event"
              required
              maxLength={1000}
            />
          </div>
        </div>
        <div style={{ marginTop: "var(--sp-2)" }}>
          <button type="submit" className="btn btn--primary btn--md" disabled={busy}>
            {busy ? "Saving…" : "Add Advertisement"}
          </button>
        </div>
      </form>

      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "muted" : "auth__field-error"}>
          {msg.text}
        </p>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <caption className="visually-hidden">Advertisements</caption>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Placement</th>
              <th scope="col">Link</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {advertisements.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "var(--sp-5)" }}>
                  No advertisements created yet. Use the form above to add one.
                </td>
              </tr>
            ) : (
              advertisements.map((ad) => (
                <tr key={ad.id}>
                  <th scope="row">
                    <strong>{ad.title}</strong>
                  </th>
                  <td>
                    <code>{ad.placement}</code>
                  </td>
                  <td>
                    <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer nofollow" className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                      {ad.linkUrl.length > 35 ? `${ad.linkUrl.slice(0, 35)}…` : ad.linkUrl}
                    </a>
                  </td>
                  <td>
                    <span className={`badge ${ad.isActive ? "badge--accent" : "badge--neutral"}`}>
                      {ad.isActive ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td>
                    <span className="action-wrap">
                      <ActionButton
                        endpoint={`/api/v1/admin/advertisements/${ad.id}`}
                        method="PATCH"
                        body={{ isActive: !ad.isActive }}
                        label={ad.isActive ? "Pause" : "Activate"}
                        ariaLabel={`${ad.isActive ? "Pause" : "Activate"} ${ad.title}`}
                      />
                      <ActionButton
                        endpoint={`/api/v1/admin/advertisements/${ad.id}`}
                        method="DELETE"
                        label="Delete"
                        ariaLabel={`Delete ${ad.title}`}
                        variant="danger"
                        confirm={`Delete advertisement "${ad.title}"?`}
                      />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
