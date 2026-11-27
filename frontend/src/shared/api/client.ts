import { useAuth } from "@/shared/api/authStore";
import type { TokenPair } from "@/shared/types/auth";

/** REST base; the realtime socket lives under the same origin and prefix. */
export const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = res.statusText || "Something went wrong";
  try {
    const body = await res.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail)) message = "Please check the details you entered";
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, message);
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight token refresh; returns false (and clears the session) if it fails. */
function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const { refreshToken, setSession, clear } = useAuth.getState();
    if (!refreshToken) return false;
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clear();
      return false;
    }
    setSession((await res.json()) as TokenPair);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; blob?: boolean } = {}): Promise<T> {
  const { json, blob, headers, ...rest } = init;
  const send = () => {
    const token = useAuth.getState().accessToken;
    return fetch(`${BASE}${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  };

  let res = await send();
  if (res.status === 401 && !path.startsWith("/auth/") && (await refreshSession())) res = await send();
  if (!res.ok) throw await errorFrom(res);
  if (blob) return (await res.blob()) as T;
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/**
 * Multipart upload with progress (fetch can't report upload progress, so this uses XHR).
 * Same auth, single retry after a token refresh, and ApiError messages as `api()`.
 */
export async function apiUpload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  const send = () =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}${path}`);
      const token = useAuth.getState().accessToken;
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new ApiError(0, "Upload failed. Check your connection and try again."));
      xhr.send(form);
    });

  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (res.status < 200 || res.status >= 300) {
    throw await errorFrom(new Response(res.body || null, { status: res.status, headers: { "Content-Type": "application/json" } }));
  }
  onProgress?.(1);
  return (res.body ? JSON.parse(res.body) : undefined) as T;
}
