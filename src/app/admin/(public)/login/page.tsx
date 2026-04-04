"use client";

import { createClient } from "@/lib/supabase/client";
import { adminAr as a } from "@/locales/admin-ar";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 text-start">
      <h1 className="text-2xl font-semibold">{a.login.title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{a.login.subtitle}</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label className="text-sm font-medium">{a.login.email}</label>
          <input
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium">{a.login.password}</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-foreground)] disabled:opacity-60"
        >
          {loading ? a.login.signingIn : a.login.signIn}
        </button>
      </form>
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
