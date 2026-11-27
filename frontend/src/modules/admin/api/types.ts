/** Money values are decimal strings from the API; the UI never does money arithmetic. */
export interface Summary {
  orders_today: number;
  active_batches: number;
  pending_pickups: number;
  completed_deliveries: number;
  net_margin_today: string;
  net_margin_total: string;
  unassigned_orders: number;
  unassigned_batches: number;
  open_complaints: number;
  refunds_to_review: number;
}

export type Stage = "awaiting_shop" | "production" | "pickup" | "in_transit" | "at_cabin";

export interface CustodyRow {
  order_id: string;
  code: string;
  status: string;
  stage: Stage;
  college: string;
  shop: string | null;
  rider: string | null;
  batch_id: string | null;
  batch_code: string | null;
  batch_mode: string | null;
  batch_status: string | null;
  delivery_at: string | null;
  packed: boolean;
  needs_attention: boolean;
  shelf_photo_url: string | null;
}

export interface OrderRow {
  id: string;
  code: string;
  status: string;
  payment_status: string;
  student_name: string | null;
  student_mobile: string;
  college: string;
  shop: string | null;
  slot_date: string | null;
  created_at: string;
  total: string | null;
}

export interface AdminOrder {
  id: string;
  code: string;
  status: string;
  payment_status: string;
  created_at: string;
  college: string;
  binding: string;
  cover_page: boolean;
  subject_name: string | null;
  subject_code: string | null;
  /** Optional cover design fields (absent on older API versions). */
  cover_template?: string | null;
  cover_color?: string | null;
  cover_title?: string | null;
  coupon_code: string | null;
  quotation: {
    printing_amount: string;
    binding_amount: string;
    cover_amount: string;
    delivery_fee: string;
    discount: string;
    total: string;
  } | null;
  shelf_photo_url: string | null;
  slot: { label: string; date: string; delivery_at: string } | null;
  student: { name: string | null; mobile: string; register_number: string | null; department: string | null };
  shop: { id: string; name: string } | null;
  commission_amount: string | null;
  shop_entitlement: string | null;
  documents: {
    filename: string;
    page_count: number | null;
    copies: number;
    paper_size: string;
    orientation?: "auto" | "portrait" | "landscape" | null;
    rules: { page_from: number; page_to: number; color: string; gsm: number; sided: string }[];
  }[];
  payments: { id: string; provider_order_id: string; provider_payment_id: string | null; amount: string; status: string; is_current: boolean }[];
  refunds: { id: string; amount: string; status: string; reason: string | null; provider_ref: string | null }[];
  complaints: { id: string; category: string; status: string }[];
  events: { type: string; note: string | null; at: string }[];
  custody: { type: string; note: string | null; at: string; batch_id: string | null }[];
}

export interface ComplaintRow {
  id: string;
  order_id: string;
  order_code: string;
  student_name: string | null;
  category: string;
  status: string;
  created_at: string;
}

export interface ComplaintDetail {
  id: string;
  category: string;
  description: string;
  status: string;
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
  evidence_photo_urls: string[];
  shelf_photo_urls: string[];
  order: { id: string; code: string; status: string; payment_status: string; total: string | null };
  student: { name: string | null };
  custody: { type: string; at: string; note: string | null }[];
  refunds: { id: string; amount: string; status: string; reason: string | null; provider_ref: string | null }[];
  late_refund_percent: string;
}

export interface RefundRow {
  id: string;
  order_id: string;
  order_code: string;
  amount: string;
  status: string;
  reason: string | null;
  shop_deduction: string;
  provider_ref: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface Slot {
  id: string;
  label: string;
  delivery_time: string;
  cutoff_minutes: number;
  capacity: number;
  active: boolean;
}

export interface College {
  id: string;
  name: string;
  city: string | null;
  security_cabin: string;
  drop_instructions: string | null;
  collection_instructions: string | null;
  latitude: string | null;
  longitude: string | null;
  active: boolean;
  slots: Slot[];
}

export interface AdminShop {
  id: string;
  shop_name: string;
  owner_name: string;
  area: string;
  landmark: string | null;
  latitude: string;
  longitude: string;
  upi_id: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
  rejection_reason: string | null;
  is_open: boolean;
  colleges: string[];
  services: string[];
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  created_at: string;
}

export interface ShopPerformance {
  orders_assigned: number;
  orders_completed: number;
  rejections: number;
  not_ready_skips: number;
  rejection_rate: number;
  total_entitlement: string;
}

export interface AdminRider {
  id: string;
  full_name: string;
  base_area: string;
  vehicle_number: string;
  upi_id: string;
  kyc_status: "pending" | "approved" | "rejected";
  kyc_note: string | null;
  has_dl: boolean;
  has_rc: boolean;
  is_online: boolean;
  primary_colleges: string[];
  backup_colleges: string[];
}

export interface RiderPerformance {
  runs_completed: number;
  packets_delivered: number;
  packets_skipped: number;
  total_payout: string;
}

export interface Batch {
  id: string;
  code: string;
  mode: string;
  status: string;
  college: string;
  slot_date: string;
  rider: string | null;
  rider_id: string | null;
  packets: number;
  payout_total: string | null;
  shelf_photo_url: string | null;
}

/** Normalised settlement row: shops and riders share one table. */
export interface Settlement {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  count: number;
  gross: string | null;
  deductions: string | null;
  net: string;
  status: "pending" | "paid";
  upi_reference: string | null;
  payout_to: string;
}

export interface GenerateResult {
  created: string[];
  skipped_existing: string[];
}

export type LedgerSummary = Record<
  | "gross_revenue"
  | "printing_charges"
  | "delivery_fee"
  | "discount"
  | "shop_entitlement"
  | "platform_commission"
  | "rider_payout"
  | "gateway_fee"
  | "refund"
  | "shop_refund_recovery"
  | "net_platform_margin",
  string
>;

export interface LedgerEntry {
  id: string;
  type: string;
  amount: string;
  order_id: string | null;
  batch_id: string | null;
  note: string | null;
  created_at: string;
}

export interface Config {
  delivery_fee: string;
  cover_page_fee: string;
  commission_percent: string;
  max_upload_mb: number;
  slot_hold_minutes: number;
  rider_base_fee: string;
  rider_extra_shop_fee: string;
  rider_packet_bonus: string;
  rider_min_guarantee: string;
  no_wait_minutes: number;
  gateway_fee_percent: string;
  late_refund_percent: string;
}

export interface Rate {
  paper_size: "A4" | "A3";
  gsm: number;
  color: "bw" | "color";
  sided: "single" | "double";
  price_per_page: string;
}

export interface BindingPrice {
  binding: string;
  price: string;
}

export interface Coupon {
  code: string;
  percent_off: string | null;
  flat_off: string | null;
  active: boolean;
  valid_until: string | null;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminMe {
  mobile: string;
  full_name: string | null;
  email: string | null;
}

export const STAGE_LABEL: Record<Stage, string> = {
  awaiting_shop: "Waiting for shop",
  production: "In production",
  pickup: "Ready for pickup",
  in_transit: "In transit",
  at_cabin: "At security cabin",
};
