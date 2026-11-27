import type { Binding, ColorMode, Gsm, PaperSize, PrintRule, Sided } from "@/modules/student/api/types";

export type ShopStatus = "pending" | "approved" | "rejected" | "suspended";
export type NextAction = "accept" | "printing_done" | "packing_done" | "handover_otp" | "complete_delivery" | null;
export type Tab = "new" | "pending" | "finished";

export interface Shop {
  id: string;
  shop_name: string;
  owner_name: string;
  area: string;
  landmark: string | null;
  latitude: string;
  longitude: string;
  upi_id: string | null;
  status: ShopStatus;
  rejection_reason: string | null;
  is_open: boolean;
  /** Service codes offered, e.g. "print_a4_bw", "binding_spiral". */
  services: string[];
}

export interface ShopService {
  code: string;
  category: "print" | "binding";
  label: string;
}

export interface ShopRegistration {
  shop_name: string;
  owner_name: string;
  latitude: number;
  longitude: number;
  area: string;
  landmark?: string | null;
  upi_id?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  /** Omitted = all services. */
  services?: string[];
  accept_terms: boolean;
}

export type Orientation = "auto" | "portrait" | "landscape";
export type CoverTemplate = "classic" | "modern" | "minimal";
/** Palette keys chosen in the student's Print Preview Studio. */
export type CoverColor = "navy" | "maroon" | "forest" | "royal" | "charcoal" | "violet";

export interface ShopDoc {
  id: string;
  filename: string;
  page_count: number | null;
  copies: number;
  paper_size: PaperSize;
  rules: PrintRule[];
  /** Absent on older orders; "auto" = follow the document. */
  orientation?: Orientation;
}

export interface ShopOrder {
  id: string;
  code: string;
  status: string;
  college_name: string;
  delivery_at: string | null;
  documents: ShopDoc[];
  binding: Binding;
  cover_page: boolean;
  subject_name: string | null;
  subject_code: string | null;
  /** Cover design from the Print Preview Studio (absent on older orders). */
  cover_template?: CoverTemplate;
  cover_color?: CoverColor | string;
  cover_title?: string | null;
  entitlement: string | null;
  next_action: NextAction;
  can_direct_delivery: boolean;
  direct_batch_id: string | null;
  otp_generated: boolean;
  assigned_at: string | null;
}

export interface Dashboard {
  is_open: boolean;
  orders_today: number;
  new_orders: number;
  pending_orders: number;
  weekly_earnings: string;
  total_earnings: string;
}

export interface Settlement {
  id: string;
  period_start: string;
  period_end: string;
  order_count: number;
  gross_amount: string;
  refund_deductions: string;
  net_amount: string;
  status: "pending" | "paid";
  upi_reference: string | null;
}

export interface Accounting {
  unsettled_orders: number;
  unsettled_amount: string;
  settlements: Settlement[];
}

/** The shop's own prices; students compare shops on these. Amounts are decimal strings. */
export interface RateCard {
  rates: { paper_size: PaperSize; gsm: Gsm; color: ColorMode; sided: Sided; price_per_page: string }[];
  bindings: { binding: Exclude<Binding, "none">; price: string }[];
}

export const FINISHED_LABEL: Record<string, string> = {
  handover_verified: "Handed over",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  collected: "Collected",
};
