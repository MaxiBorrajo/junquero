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

export interface Attachment {
  hash: string;
  name: string;
  mime: string;
  size: number;
}

export interface Spec {
  v: number;
  title: string;
  description: string;
  category: number;
  modality: "onsite" | "remote";
  nonce: string;
  area?: WorkZone;
  startsAt?: number;
  deadline?: number;
  durationMin?: number;
  evidence: string[];
  attachments: Attachment[];
}

export type ChangaStatus = "draft" | "open" | "agreed" | "delivered" | "settled" | "cancelled" | "disputed" | string;

export interface Changa {
  id: number;
  owner: string;
  specHash: string;
  spec: Spec;
  orderId: number | null;
  token: string | null;
  amount: string | null;
  status: ChangaStatus;
  createdAt: number;
}
