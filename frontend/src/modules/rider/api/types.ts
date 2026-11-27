export type KycStatus = "pending" | "approved" | "rejected";
export type BatchStatus = "unassigned" | "offered" | "accepted" | "out_for_delivery" | "completed" | "cancelled";

export interface Rider {
  id: string;
  full_name: string;
  base_area: string;
  vehicle_number: string;
  upi_id: string;
  kyc_status: KycStatus;
  kyc_note: string | null;
  has_dl: boolean;
  has_rc: boolean;
  /** Batch offers are only sent while online; new riders start offline. */
  is_online: boolean;
}

export interface RiderRegistration {
  full_name: string;
  base_area: string;
  vehicle_number: string;
  upi_id: string;
}

export interface RunOrder {
  order_id: string;
  code: string;
  status: "pending" | "picked_up" | "skipped";
  packed: boolean;
  code_ready: boolean;
}

export interface RunShop {
  shop_id: string;
  shop_name: string;
  area: string;
  landmark: string | null;
  maps_url: string | null;
  latitude?: number | null;
  longitude?: number | null;
  arrived_at: string | null;
  not_ready_available_at: string | null;
  can_mark_not_ready: boolean;
  orders: RunOrder[];
}

export interface Run {
  id: string;
  code: string;
  mode: "consolidated" | "direct";
  status: BatchStatus;
  college: {
    name: string; security_cabin: string; drop_instructions: string | null; maps_url: string | null;
    latitude?: number | null; longitude?: number | null;
  };
  slot: { label: string; delivery_at: string };
  shop_count: number;
  packet_count: number;
  route_distance_km: string | null;
  guaranteed_payout: string;
  shops: RunShop[];
  can_depart: boolean;
  can_close_empty: boolean;
  shelf_photo_count: number;
}

export interface HistoryItem {
  id: string;
  code: string;
  completed_at: string | null;
  status: BatchStatus;
  packet_count: number;
  payout: string | null;
  shelf_photo_url: string | null;
  settled: boolean;
}

export interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  batch_count: number;
  amount: string;
  status: "pending" | "paid";
  upi_reference: string | null;
}

export interface Earnings {
  today: string;
  this_week: string;
  unsettled: string;
  last_trip: { base_fee: string | null; extra_shop_fees: string | null; packet_bonus: string | null; total: string | null } | null;
  payouts: Payout[];
}
