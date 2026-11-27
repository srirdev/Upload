import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

/** All admin endpoints live under /admin. */
export const adminGet = <T,>(path: string) => api<T>(`/admin${path}`);
export const adminSend = <T,>(method: "POST" | "PUT" | "PATCH", path: string, json?: unknown) =>
  api<T>(`/admin${path}`, { method, json });

/** `path` null disables the query (e.g. nothing selected yet). */
export function useAdminGet<T>(path: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ["admin", path],
    queryFn: () => adminGet<T>(path!),
    enabled: path !== null,
    refetchInterval: opts.refetchInterval,
  });
}

/** Any admin mutation refreshes every admin query, so lists and counters never go stale. */
export function useAdminMutation<TIn, TOut = unknown>(fn: (v: TIn) => Promise<TOut>, onDone?: (r: TOut) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      onDone?.(r);
    },
  });
}

export const qs = (params: Record<string, string | number | null | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== null && v !== undefined && v !== "" && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Downloads an authenticated CSV via the API client. */
export async function downloadCsv(path: string, filename: string) {
  const blob = await api<Blob>(`/admin${path}`, { blob: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
