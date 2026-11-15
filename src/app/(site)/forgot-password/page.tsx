import type { Metadata } from "next";
import { AuthForm, AuthLinks } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false }, alternates: { canonical: "/forgot-password" } };

export default function ForgotPasswordPage() {
  return (
    <section className="auth" aria-labelledby="h">
      <h1 id="h">Reset your password</h1>
      <p className="muted">Enter your email and we’ll send a reset link if an account exists.</p>
      <AuthForm
        endpoint="/api/v1/auth/forgot-password" submitLabel="Send reset link"
        successMessage="If an account exists for that email, a reset link is on its way. It expires in 1 hour."
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        footer={<AuthLinks links={[{ href: "/login", label: "Back to log in" }]} />}
      />
    </section>
  );
}
