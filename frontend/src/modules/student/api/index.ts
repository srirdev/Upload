import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import type {
  AppNotification, Binding, Checkout, College, Complaint, ComplaintCategory, OrderDetail, OrderDocument,
  OrderSummary, PaperSize, PrintRule, Profile, Quotation, ShopOption, Slot, Orientation, CoverTemplate, CoverColor,
} from "@/modules/student/api/types";

const key = {
  profile: ["student", "profile"],
  orders: ["student", "orders"],
  order: (id: string) => ["student", "order", id],
  quote: (id: string) => ["student", "quote", id],
  shopOptions: (id: string) => ["student", "shop-options", id],
  notifications: ["student", "notifications"],
  complaints: ["student", "complaints"],
};

/** Returns null (not an error) when the student hasn't completed onboarding yet. */
export const useProfile = () =>
  useQuery({
    queryKey: key.profile,
    queryFn: async () => {
      try {
        return await api<Profile>("/students/me/profile");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });

export const useColleges = () => useQuery({ queryKey: ["colleges"], queryFn: () => api<College[]>("/colleges") });

export const useSlots = (collegeId?: string, days = 3) =>
  useQuery({
    queryKey: ["slots", collegeId, days],
    queryFn: () => api<Slot[]>(`/colleges/${collegeId}/slots?days=${days}`),
    enabled: !!collegeId,
    refetchInterval: 60_000,
  });

export const useOrders = () => useQuery({ queryKey: key.orders, queryFn: () => api<OrderSummary[]>("/orders") });

/** Polls while a DOCX/PPTX is still being converted, so its preview status updates on its own. */
export const useOrder = (id?: string) =>
  useQuery({
    queryKey: key.order(id ?? ""),
    queryFn: () => api<OrderDetail>(`/orders/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.documents.some((d) => d.conversion_status === "pending") ? 5_000 : false),
  });

export const useQuotation = (id: string, enabled: boolean, version: unknown) =>
  useQuery({
    queryKey: [...key.quote(id), version],
    queryFn: () => api<Quotation>(`/orders/${id}/quotation`),
    enabled,
    retry: false,
  });

/** Price comparison across shops, cheapest first. 422 (with a reason) while the order is incomplete. */
export const useShopOptions = (id: string, enabled: boolean, version: unknown) =>
  useQuery({
    queryKey: [...key.shopOptions(id), version],
    queryFn: () => api<ShopOption[]>(`/orders/${id}/shop-options`),
    enabled,
    retry: false,
  });

export const useNotifications = () =>
  useQuery({
    queryKey: key.notifications,
    queryFn: () => api<{ unread_count: number; items: AppNotification[] }>("/notifications"),
    refetchInterval: 30_000,
  });

export const useComplaints = () =>
  useQuery({ queryKey: key.complaints, queryFn: () => api<Complaint[]>("/students/complaints") });

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Profile, "college_name" | "referral_code">) =>
      api<Profile>("/students/me/profile", { method: "POST", json: body }),
    onSuccess: (p) => qc.setQueryData(key.profile, p),
  });
}

export const createOrder = () => api<OrderDetail>("/orders", { method: "POST" });

export const uploadDocument = (orderId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api<OrderDocument>(`/orders/${orderId}/documents`, { method: "POST", body: form });
};

export const deleteDocument = (orderId: string, docId: string) =>
  api<void>(`/orders/${orderId}/documents/${docId}`, { method: "DELETE" });

/** `preview` = the PDF converted from a DOCX/PPTX (404 until it's ready). */
export const documentUrl = (orderId: string, docId: string, preview = false) =>
  api<{ url: string }>(`/orders/${orderId}/documents/${docId}/url${preview ? "?preview=true" : ""}`);

/** Opens a signed document URL in a new tab (opened synchronously so popup blockers allow it). */
export async function openDocument(orderId: string, docId: string, preview = false) {
  const w = window.open("", "_blank");
  try {
    const { url } = await documentUrl(orderId, docId, preview);
    if (w) w.location.href = url;
  } catch (e) {
    w?.close();
    throw e;
  }
}

export const configureDocument = (
  orderId: string,
  docId: string,
  body: { copies: number; paper_size: PaperSize; orientation?: Orientation; page_count?: number | null; rules: PrintRule[] },
) => api<OrderDocument>(`/orders/${orderId}/documents/${docId}/config`, { method: "PUT", json: body });

export const setBinding = (
  orderId: string,
  body: {
    binding: Binding; cover_page: boolean; subject_name?: string | null; subject_code?: string | null;
    cover_template?: CoverTemplate; cover_color?: CoverColor; cover_title?: string | null;
  },
) => api<OrderDetail>(`/orders/${orderId}/binding`, { method: "PUT", json: body });

export const setDelivery = (orderId: string, body: { slot_id: string; slot_date: string; coupon_code?: string | null }) =>
  api<OrderDetail>(`/orders/${orderId}/delivery`, { method: "PUT", json: body });

/** `shop_id` null = any available shop at the standard price. */
export const chooseShop = (orderId: string, shop_id: string | null) =>
  api<OrderDetail>(`/orders/${orderId}/shop`, { method: "PUT", json: { shop_id } });

export const checkout = (orderId: string) => api<Checkout>(`/orders/${orderId}/checkout`, { method: "POST" });

export const verifyPayment = (body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
  api<OrderDetail>("/payments/verify", { method: "POST", json: body });

export function useOrderAction(action: "cancel" | "collect") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<OrderDetail>(`/orders/${id}/${action}`, { method: "POST" }),
    onSuccess: (o) => {
      qc.setQueryData(key.order(o.id), o);
      qc.invalidateQueries({ queryKey: key.orders });
    },
  });
}

export function useCreateComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { order_id: string; category: ComplaintCategory; description: string; photos?: File[] }) => {
      const form = new FormData();
      form.append("order_id", v.order_id);
      form.append("category", v.category);
      form.append("description", v.description);
      v.photos?.forEach((p) => form.append("photos", p)); // repeatable field, 0-3 files
      return api<Complaint>("/students/complaints", { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key.complaints }),
  });
}

export const markAllRead = () => api<void>("/notifications/read-all", { method: "POST" });
export const queryKeys = key;

import { apiUpload } from "@/shared/api/client";

/* ---- Student portal additions (redesign) ----------------------------------------------------- */

/** Same endpoint as `uploadDocument`, with upload progress (0–1) via XHR. */
export const uploadDocumentWithProgress = (orderId: string, file: File, onProgress: (fraction: number) => void) => {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<OrderDocument>(`/orders/${orderId}/documents`, form, onProgress);
};

/** Only the name can be changed after onboarding (college, register number etc. are fixed). */
export function useRenameProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (full_name: string) => api<Profile>("/students/me/profile", { method: "PATCH", json: { full_name } }),
    onSuccess: (p) => qc.setQueryData(key.profile, p),
  });
}

export const markRead = (id: string) => api<void>(`/notifications/${id}/read`, { method: "POST" });
