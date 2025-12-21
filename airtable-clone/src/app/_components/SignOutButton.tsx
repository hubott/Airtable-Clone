// src/app/_components/SignOutButton.tsx
"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20"
    >
      Sign out
    </button>
  );
}
