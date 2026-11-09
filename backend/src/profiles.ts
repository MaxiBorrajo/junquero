import { roundCoordinate, toMilli } from "./geo";

export interface ProfileInput {
  name: string;
  categories: number[];
  work: { lat: number; lng: number; radiusM: number };
}

export type ProfileResult = { ok: true; profile: ProfileInput } | { ok: false; error: string };

export interface ProfileRow {
  address: string;
  name: string;
  categories: string;
  work_lat_e3: number;
  work_lng_e3: number;
  work_radius_m: number;
  selfie_status: string;
  created_at: number;
  updated_at: number;
}

export function validateProfile(input: unknown): ProfileResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "profile must be an object" };
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 2 || name.length > 40 || /[\u0000-\u001f]/.test(name)) return { ok: false, error: "name must have 2 to 40 characters" };

  const categories = raw.categories ?? [];
  if (!Array.isArray(categories) || categories.length > 10) return { ok: false, error: "categories must be a list of at most 10" };
  if (categories.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return { ok: false, error: "invalid category" };

  const work = raw.work as Record<string, unknown> | undefined;
  if (!work || typeof work !== "object") return { ok: false, error: "work zone is required" };
  const { lat, lng, radiusM } = work;
  if (typeof lat !== "number" || !(lat >= -90 && lat <= 90)) return { ok: false, error: "work.lat out of range" };
  if (typeof lng !== "number" || !(lng >= -180 && lng <= 180)) return { ok: false, error: "work.lng out of range" };
  if (!Number.isInteger(radiusM) || (radiusM as number) < 500 || (radiusM as number) > 50000) {
    return { ok: false, error: "work.radiusM must be between 500 and 50000" };
  }
  return {
    ok: true,
    profile: {
      name,
      categories: [...new Set(categories as number[])].sort((a, b) => a - b),
      work: { lat: roundCoordinate(lat), lng: roundCoordinate(lng), radiusM: radiusM as number },
    },
  };
}

export async function upsertProfile(db: D1Database, address: string, profile: ProfileInput, nowSeconds: number) {
  await db
    .prepare(
      `INSERT INTO profiles (address, name, categories, work_lat_e3, work_lng_e3, work_radius_m, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET name = excluded.name, categories = excluded.categories,
         work_lat_e3 = excluded.work_lat_e3, work_lng_e3 = excluded.work_lng_e3,
         work_radius_m = excluded.work_radius_m, updated_at = excluded.updated_at`,
    )
    .bind(
      address,
      profile.name,
      JSON.stringify(profile.categories),
      toMilli(profile.work.lat),
      toMilli(profile.work.lng),
      profile.work.radiusM,
      nowSeconds,
      nowSeconds,
    )
    .run();
}

export const getProfile = (db: D1Database, address: string) =>
  db.prepare("SELECT * FROM profiles WHERE address = ?").bind(address).first<ProfileRow>();

const hundredth = (milli: number) => Math.round(milli / 10) / 100;

export const presentOwnProfile = (row: ProfileRow) => ({
  address: row.address,
  name: row.name,
  categories: JSON.parse(row.categories) as number[],
  work: { lat: row.work_lat_e3 / 1000, lng: row.work_lng_e3 / 1000, radiusM: row.work_radius_m },
  selfieStatus: row.selfie_status,
  createdAt: row.created_at,
});

export const presentPublicProfile = (row: ProfileRow) => ({
  address: row.address,
  name: row.name,
  categories: JSON.parse(row.categories) as number[],
  zone: { lat: hundredth(row.work_lat_e3), lng: hundredth(row.work_lng_e3) },
  verified: row.selfie_status === "approved",
  createdAt: row.created_at,
});
