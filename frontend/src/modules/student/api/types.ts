export type PaperSize = "A4" | "A3";
export type ColorMode = "bw" | "color";
export type Sided = "single" | "double";
export type Gsm = 70 | 80 | 100;
export type Binding = "none" | "spiral" | "calico" | "soft" | "hard";
export type Orientation = "auto" | "portrait" | "landscape";
export type CoverTemplate = "classic" | "modern" | "minimal";
export type CoverColor = "navy" | "maroon" | "forest" | "royal" | "charcoal" | "violet";

export type OrderStatus =
  | "draft" | "awaiting_payment" | "placed" | "accepted" | "printing" | "packing"
  | "handover_verified" | "out_for_delivery" | "delivered" | "collected" | "cancelled" | "rejected";

export interface College {
  id: string;
  name: string;
  city: string | null;
  security_cabin: string;
  collection_instructions: string | null;
}

export interface Profile {
  full_name: string;
  college_id: string;
  college_name: string;
  department: string;
  year: number;
  register_number: string;
  referral_code: string;
}

export interface PrintRule {
  page_from: number;
  page_to: number;
  color: ColorMode;
  gsm: Gsm;
  sided: Sided;
}

/** DOCX/PPTX are converted to PDF in the background; other types are "not_needed". */
export type ConversionStatus = "not_needed" | "pending" | "done" | "failed";

export interface OrderDocument {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  page_count: number | null;
  page_count_auto: boolean;
  conversion_status: ConversionStatus;
  has_preview: boolean;
  copies: number;
  paper_size: PaperSize;
  orientation?: Orientation;
  rules: PrintRule[];
}

export interface Slot {
  slot_id: string;
  label: string;
  date: string;
  delivery_at: string;
  cutoff_at: string;
  remaining: number;
  is_open: boolean;
}

export interface Quotation {
  printing_amount: string;
  binding_amount: string;
  cover_amount: string;
  delivery_fee: string;
  discount: string;
  total: string;
  lines: { label: string; amount: string }[];
}

/** One row of the price comparison; `shop_id` null = any available shop at the standard price. */
export interface ShopOption {
  shop_id: string | null;
  shop_name: string;
  area: string | null;
  distance_km: string | null;
  printing_amount: string;
  binding_amount: string;
  total: string;
  chosen: boolean;
}

export interface TimelineStep {
  key: string;
  label: string;
  done: boolean;
  at: string | null;
}

export interface OrderDetail {
  id: string;
  code: string;
  status: OrderStatus;
  payment_status: string;
  created_at: string;
  college: Pick<College, "id" | "name" | "security_cabin" | "collection_instructions">;
  slot: Slot | null;
  binding: Binding;
  cover_page: boolean;
  subject_name: string | null;
  subject_code: string | null;
  cover_template?: CoverTemplate;
  cover_color?: CoverColor;
  cover_title?: string | null;
  coupon_code: string | null;
  documents: OrderDocument[];
  quotation: Quotation | null;
  /** null = standard price, shop auto-assigned. */
  chosen_shop: { id: string; shop_name: string; area: string } | null;
  timeline: TimelineStep[];
  can_cancel: boolean;
  can_collect: boolean;
  shelf_photo_url: string | null;
}

export interface OrderSummary {
  id: string;
  code: string;
  status: OrderStatus;
  payment_status: string;
  created_at: string;
  slot_date: string | null;
  document_count: number;
  total: string | null;
}

export interface Checkout {
  razorpay_key_id: string;
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  order_id: string | null;
  read: boolean;
  created_at: string;
}

export type ComplaintCategory = "damaged_binding" | "missing_pages" | "not_on_shelf" | "late_delivery";

export interface Complaint {
  id: string;
  order_id: string;
  order_code: string;
  category: ComplaintCategory;
  description: string;
  photo_urls: string[];
  status: string;
  admin_response: string | null;
  refund_status: string | null;
  created_at: string;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting payment",
  placed: "Order placed",
  accepted: "Order placed",
  printing: "Printing",
  packing: "Binding and packing",
  handover_verified: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  delivered: "At security cabin",
  collected: "Collected",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  damaged_binding: "Damaged binding",
  missing_pages: "Missing pages",
  not_on_shelf: "Not on shelf",
  late_delivery: "Late delivery",
};

export const ACTIVE_STATUSES: OrderStatus[] = [
  "awaiting_payment", "placed", "accepted", "printing", "packing", "handover_verified", "out_for_delivery", "delivered",
];
