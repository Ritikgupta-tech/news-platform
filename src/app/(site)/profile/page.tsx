import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { ActionButton } from "@/components/reader/ActionButton";
import { formatDate } from "@/lib/format";
import { normalizeTimeZone, timeZoneOptions } from "@/lib/timezone";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const access = await requirePageAccess("/profile", "article:read");
  if ("denied" in access) return access.denied;
  const { ctx } = access;
  const row = await getDeps().db.user.findUniqueOrThrow({ where: { id: ctx.id }, select: { createdAt: true, timezone: true } });
  const zones = timeZoneOptions(row.timezone, typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []);
  const roles = ctx.roles.filter((r) => r !== "READER");
  return (
    <div className="stack">
      <h1>Your profile</h1>
      <div className="profile-grid">
        <section className="panel" aria-labelledby="acct">
          <h2 id="acct" className="panel__title">Account</h2>
          <dl className="kv">
            <dt>Email</dt><dd>{ctx.email}</dd>
            <dt>Member since</dt><dd>{formatDate(row.createdAt.toISOString())}</dd>
            <dt>Role</dt><dd>{roles.length ? roles.map((r) => r.toLowerCase()).join(", ") : "reader"}</dd>
          </dl>
          <AuthForm
            endpoint="/api/v1/account" method="PATCH" submitLabel="Save profile" keepForm successMessage="Profile saved."
            initialValues={{ name: ctx.name, timezone: normalizeTimeZone(row.timezone) }}
            fields={[
              { name: "name", label: "Full name", type: "text", autoComplete: "name" },
              { name: "timezone", label: "Timezone", type: "select", autoComplete: "off", hint: "Dates you see are shown in this timezone.", options: zones.map((z) => ({ value: z, label: z })) },
            ]}
          />
        </section>

        <section className="panel" aria-labelledby="pw">
          <h2 id="pw" className="panel__title">Password and devices</h2>
          <AuthForm
            endpoint="/api/v1/account/password" submitLabel="Change password" keepForm resetOnSuccess successMessage="Password changed. Your other devices were signed out."
            fields={[
              { name: "currentPassword", label: "Current password", type: "password", autoComplete: "current-password" },
              { name: "newPassword", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
            ]}
          />
          <div className="action-wrap">
            <ActionButton endpoint="/api/v1/account/sessions/revoke-others" method="POST" label="Sign out of my other devices" variant="secondary" doneMessage="Done." />
          </div>
        </section>

        <section className="panel" aria-labelledby="data">
          <h2 id="data" className="panel__title">Your data</h2>
          <p className="muted">Download a copy of everything we hold about you: profile, preferences, saved articles, reading history, notifications and the articles you wrote.</p>
          <p><a className="btn btn--secondary btn--sm" href="/api/v1/account/export" download>Download my data (JSON)</a></p>
        </section>

        <section className="panel danger-zone" aria-labelledby="del">
          <h2 id="del" className="panel__title">Delete account</h2>
          <p className="muted">This erases your profile, saved articles, history and notifications, and signs you out everywhere. Articles you wrote stay in the newsroom’s archive, credited to “Deleted user”. This can’t be undone.</p>
          <AuthForm
            endpoint="/api/v1/account/delete" submitLabel="Permanently delete my account" redirectTo="/" danger
            fields={[
              { name: "password", label: "Your password", type: "password", autoComplete: "current-password" },
              { name: "confirm", label: "Type DELETE to confirm", type: "text", autoComplete: "off" },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
