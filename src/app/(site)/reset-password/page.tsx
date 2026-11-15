import type { Metadata } from "next";
import { AuthForm, AuthLinks } from "@/components/auth/AuthForm";
import { StateMessage } from "@/components/ui/StateMessage";
import { ButtonLink } from "@/components/ui/Button";

// The reset token is in the URL; keep it out of Referer headers and search indexes.
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token;
  if (!token) {
    return (
      <section className="auth" aria-labelledby="h">
        <StateMessage as="h1" kind="error" title="This reset link is incomplete" action={<ButtonLink href="/forgot-password">Request a new link</ButtonLink>}>
          Open the link from your email again, or request a new one.
        </StateMessage>
      </section>
    );
  }
  return (
    <section className="auth" aria-labelledby="h">
      <h1 id="h">Choose a new password</h1>
      <AuthForm
        endpoint="/api/v1/auth/reset-password" submitLabel="Update password" extraBody={{ token }}
        successMessage="Password updated and all devices signed out. You can log in now."
        fields={[{ name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." }]}
        footer={<AuthLinks links={[{ href: "/login", label: "Log in" }]} />}
      />
    </section>
  );
}
