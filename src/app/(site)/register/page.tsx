import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm, AuthLinks } from "@/components/auth/AuthForm";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Create account", robots: { index: false }, alternates: { canonical: "/register" } };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <section className="auth" aria-labelledby="h">
      <h1 id="h">Create your account</h1>
      <p className="muted">Save articles, follow topics and keep your reading history.</p>
      <AuthForm
        endpoint="/api/v1/auth/register" submitLabel="Create account" redirectTo="/" withTimezone
        fields={[
          { name: "name", label: "Full name", type: "text", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 10 characters. A long passphrase works best." },
        ]}
        footer={<>Already have an account? <AuthLinks links={[{ href: "/login", label: "Log in" }]} /></>}
      />
    </section>
  );
}
