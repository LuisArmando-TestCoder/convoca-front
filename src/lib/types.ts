// Client-side mirror of the API's domain shapes (only the fields the UI reads).

export type Role = "owner" | "collaborator";
export type EventMode = "in_person" | "virtual" | "hybrid";
export type ParticipantSource = "manual" | "csv" | "self";
export type CheckinOutcome = "success" | "duplicate" | "not_found" | "wrong_event";

/** A team-defined participant field (beyond the built-in name + email). */
export interface EventField {
  key: string;
  label: string;
  required: boolean;
}


export interface Me {
  role: Role;
  email: string;
  /** Event scope for collaborators (undefined = full org access). */
  eventIds?: string[];
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
  /** Team-defined participant fields (beyond name + email). */
  fields?: EventField[];
  clonedFrom: string | null;
  createdAt: string;
}

export type ApplicationStatus = "pending" | "accepted" | "rejected";

export interface Participant {
  hash: string;
  name: string;
  email: string;
  /** Team-defined field values, keyed by EventField.key. */
  fields?: Record<string, string>;
  /** Legacy built-ins on pre-existing participants (optional). */
  country?: string;
  phone?: string;
  createdBy: string;
  qrSentAt: string | null;
  registered: boolean;
  registeredAt: string | null;
  source: ParticipantSource;
  createdAt: string;
  /** True when this participant came in via an application-type link (awaiting review). */
  application?: boolean;
  /** Review state for application-origin participants. */
  applicationStatus?: ApplicationStatus;
  /** When true, the participant is moved to the hidden tab (declutters the list). */
  hidden?: boolean;
}


export interface Collaborator {
  email: string;
  name: string;
  /** Events this collaborator can access (undefined = all events). */
  eventIds?: string[];
  addedAt: string;
}

export interface SelfRegLink {
  id: string;
  active: boolean;
  /** Display name shown on the registration page (WYSIWYG). */
  name: string;
  /** This link's own field schema (defaults to the event's fields). */
  fields?: EventField[];
  /** When true, this link is an application source: registrants are held for review. */
  application?: boolean;
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