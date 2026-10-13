"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSignIn() {
    setPending(true);
    setError(false);
    try {
      await signIn("google", { redirectTo: "/dashboard" });
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => void handleSignIn()}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded bg-white font-bold text-blue-600"
        >
          G
        </span>
        {pending ? "Connecting to Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Unable to start sign-in. Please try again.
        </p>
      )}
    </div>
  );
}
