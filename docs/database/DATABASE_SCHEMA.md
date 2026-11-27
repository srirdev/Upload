# UpLOAD Database Schema

PostgreSQL (local: 19.0, `localhost:5432/upload_db`), SQLAlchemy 2.0 models, Alembic migrations.
See [ER_DIAGRAM.md](ER_DIAGRAM.md) for relationships, [DATA_DICTIONARY.md](DATA_DICTIONARY.md) for every column,
[MIGRATIONS.md](MIGRATIONS.md) for how the schema changes.

## Design rules

| Rule | How it is applied |
|---|---|
| Keys | UUID primary keys for entities; natural keys for reference data (`roles.name`, `services.code`, `binding_prices.binding`, `coupons.code`); composite PKs for pure link tables. |
| Money | `NUMERIC(12,2)` (prices `NUMERIC(10,2)`, percents `NUMERIC(5,2)`), Python `Decimal`. CHECK constraints keep amounts non-negative. |
| Time | Every timestamp is `TIMESTAMPTZ`. Slot dates are `DATE`, slot times `TIME` (IST). |
| Enums | Stored as `VARCHAR(30)` + a CHECK constraint listing allowed values (portable; new values = new migration). |
| Statuses | Independent per concern: `orders.status` (production), `orders.payment_status` (customer money), `payments.status` (gateway attempt), `delivery_batches.status` + `batch_orders.status` (delivery), `refunds.status`, `complaints.status`, settlement statuses. |
| Files | Documents and photos live in private object storage (MinIO/S3/R2; `local` in dev). PostgreSQL stores only metadata + `storage_key` (unique). Access is via short-lived signed URLs after an ownership check. |
| Immutability | `order_events`, `custody_events`, `ledger_entries`, `audit_logs` are append-only (the API never updates or deletes them). `ledger_entries.ref` is unique so a posting can never be double-counted. Quotations and the commission split are snapshots taken once. |
| Integrity | FKs on every reference, indexes on every FK, CHECKs on ranges/amounts, composite FKs where a key is deliberately repeated (below). |
| Transactions | One DB session per request (`get_db`); each API action commits once, so a failure rolls back the whole action. Payment capture, ledger posting and status changes commit together. |
| RBAC | `users.role` → `roles`; the API enforces access per role (`require_roles`) and per owner (404 on someone else's record). |

## Modules and tables (43)

| # | Module | Tables |
|---|---|---|
| 1 | Users & authentication | `roles`, `users`, `refresh_tokens`, `password_reset_tokens`, `login_audit_logs` |
| 2 | Profiles | `student_profiles`, `shop_profiles`, `rider_profiles`, `admin_profiles` |
| 3 | Colleges & delivery slots | `colleges`, `college_slots`, `shop_colleges`, `rider_colleges` |
| 4 | Shops, services & rate cards | `services`, `shop_services`, `shop_rate_cards`, `shop_binding_prices`, `rate_cards`, `binding_prices` |
| 5 | Documents, orders & print customisation | `orders`, `order_documents`, `print_rules`, `order_quotations`, `order_events`, `order_rejections` |
| 6 | Payments, coupons & refunds | `payments`, `webhook_events`, `coupons`, `refunds` |
| 7 | Delivery, pickup OTPs & custody | `delivery_batches`, `batch_orders`, `batch_shop_arrivals`, `batch_declines`, `handover_otps`, `custody_events` |
| 8 | Shelf photo proofs & collection | `shelf_photos` (+ `collected` in `order_events` / `custody_events`) |
| 9 | Complaints & resolutions | `complaints`, `complaint_attachments` (+ `refunds.complaint_id`) |
| 10 | Ledger & settlements | `ledger_entries`, `settlements` (shops), `rider_settlements` |
| 11 | Notifications | `notifications` |
| 12 | Admin settings & audit | `platform_config`, `audit_logs` |

Plus `alembic_version` (migration bookkeeping).

### 1. Users & authentication
- `roles` — RBAC catalogue (`student`, `rider`, `shop`, `admin`), seeded by migration 0006.
- `users` — login identity only: `mobile` (unique), optional `email` (unique, lower-case), `password_hash` (scrypt), failed-login lockout (`failed_logins`, `locked_until`), `role` → `roles.name`, `is_active`. One account per mobile.
- `refresh_tokens` — hashed, rotating refresh tokens; `revoked` on rotation/logout, and all revoked on password reset/change.
- `password_reset_tokens` — emailed reset links: HMAC of the token, 30-minute expiry, single use (`used_at`).
- `login_audit_logs` — every sign-in attempt (including unknown accounts) and password event, with IP and user agent; drives per-IP throttling.

### 2. Profiles (one per user, `user_id` unique)
- `student_profiles` — name, college, department, year (1–6), register number, referral code (unique). Feeds cover pages and labels.
- `shop_profiles` — shop/owner name, map location, area/landmark, UPI/bank details, terms acceptance, approval `status`, `is_open`.
- `rider_profiles` — name, base area, vehicle, UPI, licence/RC `*_key` (private storage), `kyc_status`, `is_online`.
- `admin_profiles` — name, email (unique). Created only by the bootstrap command (no default admin).

### 3. Colleges & slots
- `colleges` — name (unique), security cabin, drop/collection instructions, location.
- `college_slots` — recurring daily delivery slot: time, cut-off minutes, capacity.
- `shop_colleges`, `rider_colleges` — which shops/riders serve which college (`is_backup` for riders).

### 4. Shops, services & rate cards
- `services` — catalogue: `print_{a4|a3}_{bw|color}`, `binding_{spiral|calico|soft|hard}`.
- `shop_services` — what each shop can do; orders are only assigned to shops offering every service the order needs.
- `shop_rate_cards` — each shop's own customer price per page by paper size × GSM × colour × sides (unique per shop + combination). Students compare shops on these.
- `shop_binding_prices` — each shop's own price per bound copy.
- `rate_cards`, `binding_prices` — the admin's **standard** prices: used when a student doesn't pick a shop (order auto-assigned), and copied as a new shop's starting rate card.

### 5. Orders & print customisation
- `orders` — the student's order: college, slot + date, `status`, `payment_status`, binding, cover details, coupon; `chosen_shop_id` (shop picked after comparing prices; NULL = standard price), assigned shop and the commission split snapshotted at assignment (always computed from what the student paid).
- `order_documents` — uploaded file metadata (`storage_key`, size, pages, copies, paper size, `orientation` auto/portrait/landscape); DOCX/PPTX have `conversion_status` and a converted PDF `preview_key` (background worker).
- `print_rules` — page-range rules per document (colour, GSM, sides); validated to tile all pages.
- `order_quotations` — immutable price snapshot at checkout (`lines` JSONB breakdown); the payment amount comes from it.
- `order_events` — append-only history; status changes record `from_status` → `to_status`, actor and note.
- `order_rejections` — a shop declined an order (unique per order+shop: never re-offered).

### 6. Payments, coupons & refunds
- `payments` — one row per Razorpay order; `status` set only by verified signature/webhook; `is_current` marks the live attempt.
- `webhook_events` — processed webhook ids (idempotency).
- `coupons` — percent **or** flat discount (CHECK enforces exactly one).
- `refunds` — requested → approved/rejected → processed; optional `shop_deduction` recovered via the shop's settlement.

### 7. Delivery & custody
- `delivery_batches` — per college + slot + date; `consolidated` (rider) or `direct` (shop delivers; must have `shop_id`). Payout snapshot on completion.
- `batch_orders` — orders in a batch with pickup status (`pending`/`picked_up`/`skipped`/`removed`).
- `batch_shop_arrivals` — rider arrival at a shop (starts the no-wait timer).
- `batch_declines` — riders who declined a batch offer.
- `handover_otps` — hashed 4-digit shop→rider handover code per order.
- `custody_events` — append-only chain of custody: `accepted_by_shop`, `handover_verified`, `skipped_not_ready`, `departed`, `direct_dispatch`, `delivered`, `collected`.

### 8. Shelf photos & collection
- `shelf_photos` — security-cabin photo per batch (`storage_key`). Batch completion requires a stored photo.
- Collection: student taps "I have collected" → `orders.status = collected`, recorded in `order_events` and `custody_events` (no OTP by design).

### 9. Complaints
- `complaints` — category, description, `status`, admin response, `resolved_by`/`resolved_at`.
- `complaint_attachments` — evidence photos (private storage).
- Refunds raised from a complaint link back via `refunds.complaint_id`.

### 10. Finance
- `ledger_entries` — append-only postings (gross revenue, printing, delivery fee, discount, commission, shop entitlement, rider payout, gateway fee, refund, recovery). `ref` unique = idempotent. All finance dashboards aggregate this table.
- `settlements` — weekly shop payouts (unique per shop + period); orders/refunds link to the settlement that paid them.
- `rider_settlements` — twice-weekly rider payouts (unique per rider + period); batches link to them.

### 11. Notifications
- `notifications` — in-app messages per user (index on `user_id, read` for unread counts).

### 12. Settings & audit
- `platform_config` — single row (CHECK `id = 1`): delivery fee, cover fee, commission %, upload limit, rider payout rules, no-wait minutes, gateway fee %, late refund %.
- `audit_logs` — who changed what (admin mutations, financial actions), `data` JSONB.

## Deliberately repeated keys (and how they stay consistent)

| Column | Why it is stored | Guarantee |
|---|---|---|
| `complaints.student_id` | Fast "my complaints" listing | Composite FK `(order_id, student_id)` → `orders(id, student_id)` |
| `refunds.order_id` | Per-order refund queries | Composite FK `(payment_id, order_id)` → `payments(id, order_id)` |
| `orders.commission_*`, `shop_entitlement` | Snapshot at assignment; later config changes must not rewrite history | Written once per assignment (cleared on shop rejection) |
| `batch_orders.shop_id` | Pickup point at batching time | If the order moves, its old row is marked `removed` and a new row is added |
| `orders.payment_status` | Customer-facing money state across attempts and refunds (not the same as one gateway attempt's `payments.status`) | Changed only by payment/refund services |

## Business workflow → tables

Upload (`orders`, `order_documents`) → customise (`print_rules`) → compare shop prices (`shop_rate_cards`, `shop_binding_prices`, `orders.chosen_shop_id`) → quote (`order_quotations`, `coupons`) → pay (`payments`, `webhook_events`, `ledger_entries`) → assign shop (`shop_colleges`, `shop_services`, `orders.shop_id`) → print/bind/pack (`order_events`) → handover OTP (`handover_otps`, `custody_events`) → batch & pickup (`delivery_batches`, `batch_orders`, `batch_shop_arrivals`) → cabin delivery (`shelf_photos`, `notifications`) → collection (`order_events`) → complaint/refund (`complaints`, `complaint_attachments`, `refunds`) → settlement (`settlements`, `rider_settlements`, `ledger_entries`).
