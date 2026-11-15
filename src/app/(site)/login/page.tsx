import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm, AuthLinks } from "@/components/auth/AuthForm";
import { safeNextPath } from "@/server/auth/http";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Log in", robots: { index: false }, alternates: { canonical: "/login" } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <section className="auth" aria-labelledby="h">
      <h1 id="h">Log in</h1>
      <p className="muted">Welcome back. Sign in to save stories and manage your reading.</p>
      <AuthForm
        endpoint="/api/v1/auth/login" submitLabel="Log in" redirectTo={next}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        footer={<AuthLinks links={[{ href: "/forgot-password", label: "Forgot password?" }, { href: "/register", label: "Create an account" }]} />}
      />
    </section>
  );
}
