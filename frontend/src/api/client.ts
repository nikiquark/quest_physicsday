import type { StaffRole } from "./types";

const PARTICIPANT_KEY = "pq_token";
const STAFF_KEY = "pq_staff";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

// --- local storage (wrapped: may throw in private mode) --------------------------------

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export const participantToken = {
  get: () => storageGet(PARTICIPANT_KEY),
  set: (token: string | null) => storageSet(PARTICIPANT_KEY, token),
};

export interface StaffSession {
  role: StaffRole;
  token: string;
}

export const staffSession = {
  get(): StaffSession | null {
    const raw = storageGet(STAFF_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StaffSession;
    } catch {
      return null;
    }
  },
  set: (session: StaffSession | null) => storageSet(STAFF_KEY, session ? JSON.stringify(session) : null),
};

// --- fetch -------------------------------------------------------------------------------

type Auth = "participant" | "staff" | "none";

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: Auth; timeoutMs?: number } = {},
): Promise<T> {
  const { method = "GET", body, auth = "none", timeoutMs = 10000 } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth === "participant") {
    const token = participantToken.get();
    if (token) headers["X-Participant-Token"] = token;
  } else if (auth === "staff") {
    const session = staffSession.get();
    if (session) headers["Authorization"] = `Staff ${session.token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "network");
  } finally {
    clearTimeout(timer);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* empty body */
  }
  if (!response.ok) {
    const code = (data as { code?: string } | null)?.code ?? (response.status === 403 ? "forbidden" : "error");
    if (auth === "staff" && response.status === 403 && code === "forbidden") {
      staffSession.set(null);
      window.location.assign("/staff");
    }
    throw new ApiError(response.status, code);
  }
  return data as T;
}

export function wsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/${path}`;
}

export const ERROR_TEXT: Record<string, string> = {
  network: "Нет связи с сервером. Проверьте интернет.",
  registration_closed: "Регистрация закрыта. Подойдите к организаторам.",
  no_markers_left: "Коды закончились. Подойдите к организаторам за бумажным маркером.",
  empty_name: "Введите имя.",
  invalid_pin: "Неверный PIN.",
  too_many_attempts: "Слишком много попыток. Подождите минуту.",
  unknown_marker: "Маркер не найден.",
  pin_format: "PIN должен состоять из 4–8 цифр.",
  pin_not_unique: "PIN-коды ролей должны различаться.",
  not_complete: "Пройдены не все станции.",
  already_granted: "Приз уже выдан.",
};

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return ERROR_TEXT[err.code] ?? `Ошибка (${err.status || err.code})`;
  return "Что-то пошло не так.";
}
