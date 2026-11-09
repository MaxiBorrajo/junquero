export type SelfieStatus = "none" | "pending" | "approved" | "rejected";

export interface WorkZone {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface FileRef {
  hash: string;
  url: string;
}

export interface MyProfile {
  address: string;
  name: string;
  photo: FileRef | null;
  categories: number[];
  work: WorkZone;
  selfieStatus: SelfieStatus;
  createdAt: number;
}

export interface MeResponse {
  address: string;
  profile: MyProfile | null;
}

export interface LoginResponse {
  token: string;
  expiresAt: number;
  address: string;
}
