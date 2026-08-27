"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuth, getAuth, type AuthUser } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setUser(auth.user);
    setChecked(true);
  }, [router]);

  function handleLogout() {
    clearAuth();
    router.replace("/login");
  }

  if (!checked || !user) {
    return null;
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm border border-black p-8 text-center">
        <p className="mb-6 text-black">ようこそ、{user.nickname} さん</p>
        <button
          type="button"
          onClick={handleLogout}
          className="border border-black bg-white px-3 py-2 text-black"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
