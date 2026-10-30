import { createHash, timingSafeEqual } from "node:crypto";

// Constant-time compare. Hashing first makes both buffers the same length.
export function safeEqual(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(expected));
}
