"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Callout, Field } from "@/components/ui";
import { apiRequest } from "@/lib/client";
import type { RegistrationAccess } from "@/lib/registration";

export function LoginForm({
  nextPath,
  registration,
}: {
  nextPath?: string;
  registration: RegistrationAccess;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest<{ requiresTwoFactor?: boolean }>("/api/auth/login", {
      body: { email, password },
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if (result.data.requiresTwoFactor) {
      router.push("/login/2fa");
      return;
    }
    router.push(nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="font-serif text-[26px] font-semibold text-ink-900">Sign in</h2>
        <p className="mt-1 text-sm text-ink-500">Access your firm&apos;s workspace.</p>
      </div>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <Field label="Email address" htmlFor="email">
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@firm.com"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <input
          id="password"
          type="password"
          className="input"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••••"
        />
      </Field>

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {registration.allowed ? (
        <p className="text-center text-xs text-ink-500">
          {registration.bootstrap ? "Setting up this deployment?" : "New to Lex Indiana?"}{" "}
          <Link href="/register" className="link font-medium">
            {registration.bootstrap ? "Create the first workspace" : "Create your workspace"}
          </Link>
        </p>
      ) : (
        <p className="text-center text-xs text-ink-400">
          Need access? Ask your firm owner for an invitation.
        </p>
      )}
    </form>
  );
}

export function RegisterForm({ bootstrap = false }: { bootstrap?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", firmName: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/auth/register", { body: form });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push("/settings");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="font-serif text-[26px] font-semibold text-ink-900">
          {bootstrap ? "Create the first workspace" : "Create your workspace"}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {bootstrap
            ? "This first account creates the firm and becomes its owner. Registration closes automatically after this workspace exists."
            : "Your clients, matters, and files stay isolated to your firm."}
        </p>
      </div>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <Field label="Full name" htmlFor="name">
        <input
          id="name"
          className="input"
          autoComplete="name"
          required
          value={form.name}
          onChange={update("name")}
          placeholder="Jordan A. Whitfield"
        />
      </Field>

      <Field label="Firm name" htmlFor="firmName" hint="Optional — appears on invoices and pleadings.">
        <input
          id="firmName"
          className="input"
          autoComplete="organization"
          value={form.firmName}
          onChange={update("firmName")}
          placeholder="Whitfield & Associates, LLC"
        />
      </Field>

      <Field label="Email address" htmlFor="email">
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="email"
          required
          value={form.email}
          onChange={update("email")}
          placeholder="you@firm.com"
        />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 10 characters, including a letter and a number.">
        <input
          id="password"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={update("password")}
          placeholder="••••••••••"
        />
      </Field>

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Creating workspace…" : bootstrap ? "Create first workspace" : "Create workspace"}
      </button>

      <p className="text-center text-xs text-ink-500">
        Already have an account?{" "}
        <Link href="/login" className="link font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function TwoFactorForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/auth/2fa/verify", { body: { code } });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="font-serif text-[26px] font-semibold text-ink-900">Two-factor verification</h2>
        <p className="mt-1 text-sm text-ink-500">
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>
      </div>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <Field label="Authentication code" htmlFor="code">
        <input
          id="code"
          className="input text-center font-mono text-lg tracking-[0.4em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
        />
      </Field>

      <button type="submit" className="btn btn-primary w-full" disabled={busy || code.length !== 6}>
        {busy ? "Verifying…" : "Verify and continue"}
      </button>

      <p className="text-center text-xs text-ink-500">
        <Link href="/login" className="link">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
