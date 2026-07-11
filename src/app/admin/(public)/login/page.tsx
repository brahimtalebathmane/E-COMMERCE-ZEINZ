"use client";

import Link from "next/link";
import { SiteLogo } from "@/components/SiteLogo";
import { createClient } from "@/lib/supabase/client";
import { adminAr as a } from "@/locales/admin-ar";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/admin";
  const authError = sp.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const gateMessage =
    authError === "suspended"
      ? a.login.suspended
      : authError === "forbidden"
        ? a.login.forbidden
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 text-start">
      <div className="admin-card admin-fade-in w-full max-w-md p-7 sm:p-8">
        <Link href="/" className="mb-6 inline-flex">
          <SiteLogo priority objectAlign="start" />
        </Link>
        <h1 className="admin-page-title">{a.login.title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{a.login.subtitle}</p>
        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">{a.login.email}</label>
            <input
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              className="admin-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">{a.login.password}</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="admin-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {gateMessage ? (
            <p className="admin-alert-warn">{gateMessage}</p>
          ) : null}
          {error ? (
            <p className="admin-alert-error">{error}</p>
          ) : null}
          <button type="submit" disabled={loading} className="admin-btn-primary w-full">
            {loading ? a.login.signingIn : a.login.signIn}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm">{a.login.loading}</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
