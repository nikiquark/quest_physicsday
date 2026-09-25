import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { staffSession } from "../api/client";
import type { StaffRole } from "../api/types";

/** Admin may open every staff page; other roles only their own. */
export function RequireRole({ role, children }: { role: StaffRole; children: ReactNode }) {
  const session = staffSession.get();
  if (!session || (session.role !== role && session.role !== "admin")) return <Navigate to="/staff" replace />;
  return <>{children}</>;
}

export const ROLE_HOME: Record<StaffRole, string> = {
  admin: "/staff/admin",
  station: "/staff/station",
  prize: "/staff/prize",
  help: "/staff/help",
};

export function logoutStaff() {
  staffSession.set(null);
  window.location.assign("/staff");
}
