import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUpload } from "@/shared/api/client";
import type { Earnings, HistoryItem, Rider, RiderRegistration, Run } from "@/modules/rider/api/types";

const key = {
  rider: ["rider", "me"],
  run: ["rider", "run"],
  history: ["rider", "history"],
  earnings: ["rider", "earnings"],
};

/** Returns null (not an error) when the rider hasn't registered yet. */
export const useRider = () =>
  useQuery({
    queryKey: key.rider,
    queryFn: async () => {
      try {
        return await api<Rider>("/riders/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    refetchInterval: (q) => (q.state.data?.kyc_status === "pending" ? 20_000 : false),
  });

export const useRun = () =>
  useQuery({ queryKey: key.run, queryFn: () => api<Run | null>("/riders/me/run"), refetchInterval: 10_000 });

export const useHistory = () => useQuery({ queryKey: key.history, queryFn: () => api<HistoryItem[]>("/riders/me/history") });

export const useEarnings = () => useQuery({ queryKey: key.earnings, queryFn: () => api<Earnings>("/riders/me/earnings") });

export function useRegisterRider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RiderRegistration) => api<Rider>("/riders/me", { method: "POST", json: body }),
    onSuccess: (r) => qc.setQueryData(key.rider, r),
  });
}

export function useUploadKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, file, onProgress }: { kind: "dl" | "rc"; file: File; onProgress?: (f: number) => void }) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<Rider>(`/riders/me/documents/${kind}`, form, onProgress);
    },
    onSuccess: (r) => qc.setQueryData(key.rider, r),
  });
}

/** Go online/offline. The API refuses to go offline mid-run (409); offers may change, so the run is refetched. */
export function useSetAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (is_online: boolean) => api<Rider>("/riders/me/availability", { method: "PUT", json: { is_online } }),
    onSuccess: (r) => {
      qc.setQueryData(key.rider, r);
      qc.invalidateQueries({ queryKey: key.rider });
      qc.invalidateQueries({ queryKey: key.run });
    },
  });
}

/** Every run action returns the refreshed run; the cache is updated and dependent lists refreshed. */
export function useRunAction() {
  const qc = useQueryClient();
  const done = (run?: Run | null) => {
    if (run) qc.setQueryData(key.run, run);
    else qc.invalidateQueries({ queryKey: key.run });
    qc.invalidateQueries({ queryKey: key.history });
    qc.invalidateQueries({ queryKey: key.earnings });
  };
  const post = (path: string, json?: unknown) => api<Run>(path, { method: "POST", json });
  return {
    accept: useMutation({ mutationFn: (id: string) => post(`/delivery/batches/${id}/accept`), onSuccess: done }),
    decline: useMutation({
      mutationFn: (id: string) => api<void>(`/delivery/batches/${id}/decline`, { method: "POST" }),
      onSuccess: () => done(null),
    }),
    arrive: useMutation({
      mutationFn: (v: { id: string; shop_id: string }) => post(`/delivery/batches/${v.id}/arrive`, { shop_id: v.shop_id }),
      onSuccess: done,
    }),
    pickup: useMutation({
      mutationFn: (v: { id: string; order_id: string; code: string }) =>
        post(`/delivery/batches/${v.id}/pickup`, { order_id: v.order_id, code: v.code }),
      onSuccess: done,
    }),
    notReady: useMutation({
      mutationFn: (v: { id: string; shop_id: string }) =>
        api<{ skipped: string[] }>(`/delivery/batches/${v.id}/not-ready`, { method: "POST", json: { shop_id: v.shop_id } }),
      onSuccess: () => done(null),
    }),
    depart: useMutation({ mutationFn: (id: string) => post(`/delivery/batches/${id}/depart`), onSuccess: done }),
    closeEmpty: useMutation({ mutationFn: (id: string) => post(`/delivery/batches/${id}/close-empty`), onSuccess: () => done(null) }),
    photo: useMutation({
      mutationFn: ({ id, file, onProgress }: { id: string; file: File; onProgress?: (f: number) => void }) => {
        const form = new FormData();
        form.append("file", file);
        return apiUpload<Run>(`/delivery/batches/${id}/shelf-photo`, form, onProgress);
      },
      onSuccess: done,
    }),
    complete: useMutation({ mutationFn: (id: string) => post(`/delivery/batches/${id}/complete`), onSuccess: () => done(null) }),
  };
}
