"use client";
import { useState, type FormEvent } from "react";
import { errorMessage } from "./api";
import type { SiteSettings } from "@/server/settings/service";

export function SettingsManager({ initialSettings }: { initialSettings: SiteSettings }) {
  const [settings, setSettings] = useState<SiteSettings>(initialSettings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        setMsg({ ok: false, text: await errorMessage(res) });
        return;
      }
      const data = await res.json();
      setSettings(data.data);
      setMsg({ ok: true, text: "Settings saved successfully." });
    } catch {
      setMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="stack" aria-label="Platform settings">
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "panel muted" : "auth__field-error"}>
          {msg.text}
        </p>
      ) : null}

      <section className="panel stack" aria-labelledby="gen-h">
        <h2 id="gen-h">General Settings</h2>
        <div className="form-grid">
          <div className="auth__field">
            <label htmlFor="st-name">Brand / Site Name</label>
            <input
              id="st-name"
              value={settings.siteName}
              onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
              required
              minLength={2}
              maxLength={60}
            />
          </div>
          <div className="auth__field">
            <label htmlFor="st-email">Contact / Editorial Email</label>
            <input
              id="st-email"
              type="email"
              value={settings.contactEmail}
              onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
              required
            />
          </div>
          <div className="auth__field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="st-tagline">Tagline / Mission Statement</label>
            <input
              id="st-tagline"
              value={settings.tagline}
              onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
              maxLength={160}
            />
          </div>
          <div className="auth__field">
            <label htmlFor="st-tz">Default Platform Timezone</label>
            <input
              id="st-tz"
              value={settings.defaultTimezone}
              onChange={(e) => setSettings({ ...settings, defaultTimezone: e.target.value })}
              placeholder="UTC"
              required
            />
          </div>
        </div>
      </section>

      <section className="panel stack" aria-labelledby="ed-h">
        <h2 id="ed-h">Editorial & Publishing Policies</h2>
        <label className="checkbox-label" style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.requireEditorialReview}
            onChange={(e) => setSettings({ ...settings, requireEditorialReview: e.target.checked })}
          />
          <span>
            <strong>Enforce editorial peer review before publication</strong>
            <br />
            <small className="muted">When active, authors cannot publish directly without editor sign-off.</small>
          </span>
        </label>

        <label className="checkbox-label" style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.breakingNewsTicker}
            onChange={(e) => setSettings({ ...settings, breakingNewsTicker: e.target.checked })}
          />
          <span>
            <strong>Enable Breaking News hero badges & alerts</strong>
            <br />
            <small className="muted">Shows prominent breaking news indicators on live breaking stories.</small>
          </span>
        </label>
      </section>

      <section className="panel stack" aria-labelledby="comm-h">
        <h2 id="comm-h">Community & Engagement</h2>
        <label className="checkbox-label" style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.allowRegistration}
            onChange={(e) => setSettings({ ...settings, allowRegistration: e.target.checked })}
          />
          <span>
            <strong>Allow new reader registrations</strong>
            <br />
            <small className="muted">Disable temporarily during platform maintenance or invitation-only periods.</small>
          </span>
        </label>

        <label className="checkbox-label" style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.commentsEnabled}
            onChange={(e) => setSettings({ ...settings, commentsEnabled: e.target.checked })}
          />
          <span>
            <strong>Enable article comments</strong>
            <br />
            <small className="muted">Allows community comments under published stories with moderation queue.</small>
          </span>
        </label>
      </section>

      <div style={{ marginTop: "var(--sp-3)" }}>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving Settings…" : "Save Settings"}
        </button>
      </div>
    </form>
  );
}
