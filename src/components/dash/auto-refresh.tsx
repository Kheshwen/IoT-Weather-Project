"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-reads the server data on a timer. The data changes every 5 to 15 minutes, so 60 s is plenty.
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
