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
  milestones?: Milestone[];
  materials?: "payer" | "worker";
  group?: GroupPlan;
}

export type ChangaStatus = "draft" | "funding" | "open" | "agreed" | "delivered" | "settled" | "cancelled" | "disputed" | string;

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

export type ApplicationStatus = "active" | "withdrawn" | "chosen" | "closed";

export interface Application {
  id: number;
  changaId: number;
  applicant: string;
  amount: string | null;
  message: string;
  attachments: Attachment[];
  plan?: { milestones: Milestone[] } | null;
  status: ApplicationStatus;
  createdAt: number;
  updatedAt: number;
}

export interface MyApplication extends Application {
  changa: { specHash: string; orderId: number | null; status: ChangaStatus; title: string };
}

export interface ReceivedApplication extends Application {
  profile: { name: string; verified: boolean; zone: { lat: number; lng: number } } | null;
}

export type AgreementStatus = "pending" | "sending" | "submitted" | "expired";

export interface AgreementRecord {
  orderId: number;
  payer: string;
  payee: string;
  price: string;
  specHash: string;
  termsHash: string;
  expiry: number;
  status: AgreementStatus;
  txHash: string | null;
  plan?: { milestones: Milestone[] } | null;
}

export interface ChatSummary {
  applicationId: number;
  changaId: number;
  title: string;
  counterpart: string;
  writable: boolean;
  lastSeq: number;
  lastSender: string | null;
  lastAt: number | null;
  unread: boolean;
}

export interface PublicProfile {
  address: string;
  name: string;
  photo: FileRef | null;
  verified: boolean;
}

export interface Milestone {
  name: string;
  amount: string;
  criteria: string;
  evidence: string;
}

export interface GroupPlan {
  target: string;
  fundingDeadline: number;
}
