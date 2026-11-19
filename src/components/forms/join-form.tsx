"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { apiRequest } from "@/lib/client";

export function JoinForm({ token, email, firmName }: { token: string; email: string; firmName: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/join/${token}`, {
      method: "POST",
      body: { name, password },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <p className="text-sm leading-relaxed text-ink-600">
        Create your account to join <span className="font-medium text-ink-900">{firmName}</span>.
      </p>
      <Field label="Full name" htmlFor="join-name">
        <input
          id="join-name"
          className="input"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
        />
      </Field>
      <Field label="Email" htmlFor="join-email" hint="Set by the invitation and cannot be changed.">
        <input id="join-email" className="input bg-ink-50" value={email} readOnly />
      </Field>
      <Field label="Password" htmlFor="join-password" hint="At least 10 characters with a letter and a number.">
        <input
          id="join-password"
          type="password"
          className="input"
          required
          minLength={10}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}
