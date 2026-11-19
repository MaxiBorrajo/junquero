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
  doneMilestones?: Milestone[];
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
  // Cuándo se cerró y pagó (solo en tus listas, para trabajos cerrados).
  closedAt?: number | null;
}

export type ApplicationStatus = "active" | "withdrawn" | "chosen" | "closed" | "dismissed" | "abandoned";

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
  changa: { specHash: string; orderId: number | null; status: ChangaStatus; title: string; amount: string | null; category: number | null; modality: "onsite" | "remote" | null; when: number | null; closedAt?: number | null };
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
  counterpartName: string | null;
  counterpartPhoto?: FileRef | null;
  counterpartVerified?: boolean;
  role: "owner" | "applicant";
  writable: boolean;
  waitingForOwner: boolean;
  lastSeq: number;
  lastSender: string | null;
  lastAt: number | null;
  // El último mensaje, todavía cifrado; el celular lo descifra. Vacío si era muy largo.
  lastNonce: string | null;
  lastBody: string | null;
  unread: boolean;
  unreadCount: number;
}

export interface PublicProfile {
  address: string;
  name: string;
  photo: FileRef | null;
  verified: boolean;
  categories?: number[];
  createdAt?: number;
  stats?: { doneAsPayee: number; doneAsPayer: number; disputed: number; abandoned?: number; rating: number | null; ratings: number };
  receiptsCount?: number;
}

// Comprobante intransferible de un trabajo cerrado: solo rubro y mes, sin datos personales.
export interface ReceiptItem {
  orderId: number;
  category: number;
  month: number;
  title: string;
  closedAt: number | null;
}

export interface Closing {
  ratings: { index: number | null; rating: number }[];
  receipt: { category: number; month: number } | null;
  smallDispute?: boolean;
  dispute?: { payeeShareBps: number; byDefault: boolean } | null;
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
