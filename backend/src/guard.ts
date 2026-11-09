export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export const clientKey = (headers: Headers): string => headers.get("cf-connecting-ip") ?? "unknown";

export async function allowed(limiter: Limiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  return (await limiter.limit({ key })).success;
}
