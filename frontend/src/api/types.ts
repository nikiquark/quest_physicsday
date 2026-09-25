export interface Station {
  id: number;
  name: string;
  number: number;
  description: string;
  x: number;
  y: number;
  is_finish: boolean;
  enabled?: boolean;
}

export interface StationProgress extends Station {
  visited: boolean;
  visited_at: string | null;
}

export interface ParticipantInfo {
  marker_id: number;
  name: string;
  display_name: string;
  kind: "phone" | "paper";
  activated: boolean;
  all_done: boolean;
  current_station_id: number | null;
  prize_at: string | null;
  prize_forced: boolean;
}

export interface ParticipantState {
  participant: ParticipantInfo;
  stations: StationProgress[];
}

export type StaffRole = "admin" | "station" | "prize" | "help";

export interface DashboardStats {
  registration_open: boolean;
  participants: {
    phone_total: number;
    paper_activated: number;
    all_done: number;
    at_finish: number;
    prize_total: number;
    prize_forced: number;
  };
  stations: {
    id: number;
    name: string;
    number: number;
    enabled: boolean;
    is_finish: boolean;
    active: number;
    visited_total: number;
  }[];
}

export interface ParticipantDetail {
  state: ParticipantState;
  token: string | null;
  created_at: string;
  activated_at: string | null;
  events: { kind: string; station: string | null; created_at: string }[];
}

export interface AdminSettings {
  registration_open: boolean;
  pins: Record<StaffRole, string>;
}

export type ScanStatus = "accepted" | "already" | "unknown" | "disabled";

export interface ActiveParticipant {
  marker_id: number;
  name: string;
  current_station: string | null;
  at_finish: boolean;
  passed: number;
  total: number;
  created_at: string;
}
