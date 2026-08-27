"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getAuth() ? "/home" : "/login");
  }, [router]);

  return null;
}
