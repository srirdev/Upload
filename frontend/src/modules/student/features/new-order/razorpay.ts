import type { Checkout } from "@/modules/student/api/types";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (r: { error: { description: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window. Check your connection."));
    document.body.appendChild(s);
  });
}

export class PaymentDismissed extends Error {
  constructor() {
    super("Payment was cancelled");
  }
}

/** Opens Razorpay Checkout. The result must still be verified by the backend. */
export async function openRazorpay(c: Checkout, prefill?: { name?: string; contact?: string }): Promise<RazorpayResponse> {
  await loadScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: c.razorpay_key_id,
      order_id: c.razorpay_order_id,
      amount: c.amount_paise,
      currency: c.currency,
      name: "UpLOAD",
      description: "Print order",
      prefill,
      theme: { color: "#2563EB" },
      handler: resolve,
      modal: { ondismiss: () => reject(new PaymentDismissed()) },
    });
    rzp.on("payment.failed", (r) => reject(new Error(r.error.description || "Payment failed")));
    rzp.open();
  });
}
