import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api, participantToken, storageGet, storageSet, wsUrl } from "../api/client";
import type { ParticipantState, Station } from "../api/types";
import { LiveSocket, type SocketStatus } from "../lib/socket";

const STATE_KEY = "pq_state";

type Phase = "loading" | "register" | "ready" | "offline";

interface MeResponse {
  token: string;
  state: ParticipantState;
}

function cachedState(): ParticipantState | null {
  const raw = storageGet(STATE_KEY);
  if (!raw || !participantToken.get()) return null;
  try {
    return JSON.parse(raw) as ParticipantState;
  } catch {
    return null;
  }
}

/**
 * Participant session: restores from cache instantly (the marker must show even offline),
 * then syncs with the server and keeps a live socket for station confirmations.
 */
export function useParticipant() {
  const [state, setStateRaw] = useState<ParticipantState | null>(cachedState);
  const [phase, setPhase] = useState<Phase>(state ? "ready" : "loading");
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const socketRef = useRef<LiveSocket | null>(null);

  const setState = useCallback((next: ParticipantState | null) => {
    setStateRaw(next);
    storageSet(STATE_KEY, next ? JSON.stringify(next) : null);
  }, []);

  const logout = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    participantToken.set(null);
    setState(null);
    setPhase("register");
  }, [setState]);

  const openSocket = useCallback(
    (token: string) => {
      socketRef.current?.close();
      socketRef.current = new LiveSocket(wsUrl(`participant/?token=${encodeURIComponent(token)}`), {
        onStatus: setStatus,
        onInvalid: logout,
        onMessage: (msg) => {
          if (msg.type === "state") setState(msg.state);
          else if (msg.type === "station_patch") {
            const patch = msg.station as Station;
            setStateRaw((prev) => {
              if (!prev) return prev;
              const next = {
                ...prev,
                stations: prev.stations.map((s) => (s.id === patch.id ? { ...s, ...patch } : s)),
              };
              storageSet(STATE_KEY, JSON.stringify(next));
              return next;
            });
          } else if (msg.type === "reset") logout();
        },
      });
    },
    [logout, setState],
  );

  const load = useCallback(async () => {
    try {
      const me = await api<MeResponse>("participants/me", { auth: "participant" });
      participantToken.set(me.token);
      setState(me.state);
      setPhase("ready");
      openSocket(me.token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      // Network trouble: keep showing the cached state and retry.
      setPhase((prev) => (prev === "ready" ? "ready" : "offline"));
      window.setTimeout(load, 3000);
    }
  }, [logout, openSocket, setState]);

  useEffect(() => {
    load();
    return () => socketRef.current?.close();
  }, [load]);

  const registered = useCallback(
    (me: MeResponse) => {
      participantToken.set(me.token);
      setState(me.state);
      setPhase("ready");
      openSocket(me.token);
    },
    [openSocket, setState],
  );

  return { phase, state, status, registered };
}
