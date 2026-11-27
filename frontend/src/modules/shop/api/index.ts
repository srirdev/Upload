import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import type {
  Accounting, Dashboard, RateCard, Shop, ShopOrder, ShopRegistration, ShopService, Tab,
} from "@/modules/shop/api/types";

const key = {
  shop: ["shop", "me"],
  services: ["shop", "services"],
  dashboard: ["shop", "dashboard"],
  orders: (tab: Tab) => ["shop", "orders", tab],
  accounting: ["shop", "accounting"],
  rateCard: ["shop", "rate-card"],
};

/** Returns null (not an error) when the owner hasn't registered a shop yet. */
export const useShop = () =>
  useQuery({
    queryKey: key.shop,
    queryFn: async () => {
      try {
        return await api<Shop>("/shops/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    // Re-check while waiting for admin approval.
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 20_000 : false),
  });

export const useDashboard = () =>
  useQuery({ queryKey: key.dashboard, queryFn: () => api<Dashboard>("/shops/me/dashboard"), refetchInterval: 15_000 });

export const useShopOrders = (tab: Tab) =>
  useQuery({
    queryKey: key.orders(tab),
    queryFn: () => api<ShopOrder[]>(`/shops/me/orders?tab=${tab}`),
    refetchInterval: 15_000,
  });

export const useAccounting = () => useQuery({ queryKey: key.accounting, queryFn: () => api<Accounting>("/shops/me/accounting") });

export const useRateCard = () => useQuery({ queryKey: key.rateCard, queryFn: () => api<RateCard>("/shops/me/rate-card") });

/** Replaces the whole rate card; the server validates ranges and duplicates (422 with a reason). */
export function useSaveRateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (card: RateCard) => api<RateCard>("/shops/me/rate-card", { method: "PUT", json: card }),
    onSuccess: (c) => qc.setQueryData(key.rateCard, c),
  });
}

/** Catalogue of services a shop can offer (static, so cached for the session). */
export const useServiceCatalogue = () =>
  useQuery({ queryKey: key.services, queryFn: () => api<ShopService[]>("/shops/services"), staleTime: Infinity });

export function useSetServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (services: string[]) => api<Shop>("/shops/me/services", { method: "PUT", json: { services } }),
    onSuccess: (s) => qc.setQueryData(key.shop, s),
  });
}

export function useRegisterShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ShopRegistration) => api<Shop>("/shops/me", { method: "POST", json: body }),
    onSuccess: (s) => qc.setQueryData(key.shop, s),
  });
}

export function useSetOpen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (is_open: boolean) => api<Shop>("/shops/me/open", { method: "PUT", json: { is_open } }),
    onSuccess: (s) => {
      qc.setQueryData(key.shop, s);
      qc.invalidateQueries({ queryKey: ["shop"] });
    },
  });
}

type Action = "accept" | "printing-done" | "packing-done";

/** Order workflow actions; every success refreshes the lists and counters. */
export function useOrderAction() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["shop"] });
  return {
    advance: useMutation({
      mutationFn: ({ id, action }: { id: string; action: Action }) =>
        api<ShopOrder>(`/shops/me/orders/${id}/${action}`, { method: "POST" }),
      onSuccess: refresh,
    }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        api<void>(`/shops/me/orders/${id}/reject`, { method: "POST", json: { reason } }),
      onSuccess: refresh,
    }),
    direct: useMutation({
      mutationFn: (id: string) => api<{ batch_id: string }>(`/shops/me/orders/${id}/direct-delivery`, { method: "POST" }),
      onSuccess: refresh,
    }),
    photo: useMutation({
      mutationFn: ({ batchId, file }: { batchId: string; file: File }) => {
        const form = new FormData();
        form.append("file", file);
        return api<unknown>(`/delivery/batches/${batchId}/shelf-photo`, { method: "POST", body: form });
      },
    }),
    complete: useMutation({
      mutationFn: (batchId: string) => api<unknown>(`/delivery/batches/${batchId}/complete`, { method: "POST" }),
      onSuccess: refresh,
    }),
    otp: useMutation({
      mutationFn: (id: string) => api<{ code: string }>(`/shops/me/orders/${id}/handover-otp`, { method: "POST" }),
      onSuccess: refresh,
    }),
  };
}

/** Opens a signed file URL in a new tab. */
export async function openDocument(orderId: string, docId: string) {
  const w = window.open("", "_blank"); // open synchronously so popup blockers allow it
  try {
    const { url } = await api<{ url: string }>(`/shops/me/orders/${orderId}/documents/${docId}/url`);
    if (w) w.location.href = url;
  } catch (e) {
    w?.close();
    throw e;
  }
}

/** Fetches a generated PDF with auth and opens it in a new tab. */
export async function openPdf(path: string) {
  const w = window.open("", "_blank");
  try {
    const blob = await api<Blob>(path, { blob: true });
    if (w) w.location.href = URL.createObjectURL(blob);
  } catch (e) {
    w?.close();
    throw e;
  }
}
