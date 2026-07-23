// Client-side mirror of the API's domain shapes (only the fields the UI reads).

export type Role = "owner" | "collaborator";
export type EventMode = "in_person" | "virtual" | "hybrid";
export type ParticipantSource = "manual" | "csv" | "self";
export type CheckinOutcome = "success" | "duplicate" | "not_found" | "wrong_event";

export interface Me {
  role: Role;
  email: string;
  org: {
    id: string;
    name: string;
    email: string;
    gmailUser: string;
    verified: boolean;
    createdAt: string;
  };
}

export interface EventDoc {
  id: string;
  orgId: string;
  name: string;
  description: string;
  location: string;
  mode: EventMode;
  date: string;
  quota: number | null;
  clonedFrom: string | null;
  createdAt: string;
}

export interface Participant {
  hash: string;
  name: string;
  email: string;
  country: string;
  phone: string;
  createdBy: string;
  qrSentAt: string | null;
  registered: boolean;
  registeredAt: string | null;
  source: ParticipantSource;
  createdAt: string;
}

export interface Collaborator {
  email: string;
  name: string;
  addedAt: string;
}

export interface SelfRegLink {
  id: string;
  active: boolean;
  createdAt: string;
  url: string;
}

export interface EventStats {
  total: number;
  checkedIn: number;
  pending: number;
  rate: number;
  quota: number | null;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
}

export interface CheckinResult {
  outcome: CheckinOutcome;
  participant: { name: string; email: string; country: string } | null;
  registeredAt: string | null;
  message: string;
}

export const MODE_LABELS: Record<EventMode, string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid",
};
