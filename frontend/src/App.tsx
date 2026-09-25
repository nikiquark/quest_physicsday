import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";

import { participantToken, storageSet } from "./api/client";
import ParticipantApp from "./participant/ParticipantApp";
import { RequireRole } from "./staff/RequireRole";

const StaffLogin = lazy(() => import("./staff/StaffLogin"));
const StationPage = lazy(() => import("./staff/station/StationPage"));
const PrizePage = lazy(() => import("./staff/prize/PrizePage"));
const HelpPage = lazy(() => import("./staff/help/HelpPage"));
const AdminPage = lazy(() => import("./staff/admin/AdminPage"));
const PrintPage = lazy(() => import("./staff/admin/PrintPage"));

function Restore() {
  const { token } = useParams();
  if (token) {
    participantToken.set(token);
    storageSet("pq_state", null);
  }
  return <Navigate to="/" replace />;
}

function Loading() {
  return <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>Загрузка…</div>;
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<ParticipantApp />} />
          <Route path="/restore/:token" element={<Restore />} />
          <Route path="/staff" element={<StaffLogin />} />
          <Route path="/staff/station" element={<RequireRole role="station"><StationPage /></RequireRole>} />
          <Route path="/staff/prize" element={<RequireRole role="prize"><PrizePage /></RequireRole>} />
          <Route path="/staff/help" element={<RequireRole role="help"><HelpPage /></RequireRole>} />
          <Route path="/staff/admin" element={<RequireRole role="admin"><AdminPage /></RequireRole>} />
          <Route path="/staff/admin/print" element={<RequireRole role="admin"><PrintPage /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
