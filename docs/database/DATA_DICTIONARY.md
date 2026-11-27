# UpLOAD Data Dictionary

Generated from the live database catalogue (PostgreSQL 19.0, `upload_db`, Alembic revision `0007`).
Regenerate after every migration (see [MIGRATIONS.md](MIGRATIONS.md)). Design notes: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md); relationships: [ER_DIAGRAM.md](ER_DIAGRAM.md).

Key: **PK** primary key, **FK** foreign key, **UK** unique. `Null` = nullable. Defaults written as `now()` are set by PostgreSQL; other defaults (UUIDs, statuses) are applied by the application when inserting.

## 1. Users & authentication

### `roles`

RBAC role catalogue referenced by users.role (reference data).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `name` | varchar(20) | no |  | PK |
| `description` | text | no |  |  |

- Referenced by: users(role)

### `users`

Login identity: one account per mobile number (optional unique email) with exactly one role and a hashed password.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `mobile` | varchar(10) | no |  |  |
| `email` | varchar(254) | yes |  |  |
| `password_hash` | varchar(255) | yes |  |  |
| `failed_logins` | integer | no | `0` |  |
| `locked_until` | timestamptz | yes |  |  |
| `role` | varchar(20) | no |  | FK → `roles(name)` |
| `is_active` | boolean | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Index `ix_users_email`: btree (email)
- Index `ix_users_mobile`: btree (mobile)
- Index `ix_users_role`: btree (role)
- Referenced by: admin_profiles(user_id), audit_logs(actor_id), complaint_attachments(uploaded_by), complaints(resolved_by), complaints(student_id), custody_events(actor_id), notifications(user_id), order_events(actor_id), orders(student_id), refresh_tokens(user_id), refunds(decided_by), rider_profiles(user_id), shelf_photos(uploaded_by), shop_profiles(user_id), student_profiles(user_id)

### `refresh_tokens`

Hashed, rotating refresh tokens (revoked on rotation/logout).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `user_id` | uuid | no |  | FK → `users(id)` |
| `token_hash` | varchar(64) | no |  | UK |
| `expires_at` | timestamptz | no |  |  |
| `revoked` | boolean | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Index `ix_refresh_tokens_user_id`: btree (user_id)

## 2. Profiles

### `student_profiles`

Student details used on orders, cover pages and packet labels.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `user_id` | uuid | no |  | UK, FK → `users(id)` |
| `full_name` | varchar(120) | no |  |  |
| `college_id` | uuid | no |  | FK → `colleges(id)` |
| `department` | varchar(120) | no |  |  |
| `year` | integer | no |  |  |
| `register_number` | varchar(40) | no |  |  |
| `referral_code` | varchar(12) | no |  | UK |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Check `ck_student_profiles_year_range`: `(year >= 1) AND (year <= 6)`
- Index `ix_student_profiles_college_id`: btree (college_id)

### `shop_profiles`

Printing shop registration, location, payout details and approval/open state.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `user_id` | uuid | no |  | UK, FK → `users(id)` |
| `shop_name` | varchar(160) | no |  |  |
| `owner_name` | varchar(120) | no |  |  |
| `latitude` | numeric(9,6) | no |  |  |
| `longitude` | numeric(9,6) | no |  |  |
| `area` | varchar(160) | no |  |  |
| `landmark` | varchar(160) | yes |  |  |
| `upi_id` | varchar(80) | yes |  |  |
| `bank_account_name` | varchar(120) | yes |  |  |
| `bank_account_number` | varchar(30) | yes |  |  |
| `bank_ifsc` | varchar(11) | yes |  |  |
| `terms_accepted_at` | timestamptz | no |  |  |
| `status` | varchar(30) | no |  |  |
| `rejection_reason` | text | yes |  |  |
| `is_open` | boolean | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Check `ck_shop_profiles_coordinates`: `((latitude >= ('-90'::integer)::numeric) AND (latitude <= 90)) AND ((longitude >= ('-180'::integer)::numeric) AND (longitude <= 180))`
- Check `ck_shop_profiles_shopstatus`: `status IN ('pending', 'approved', 'rejected', 'suspended')`
- Referenced by: batch_orders(shop_id), batch_shop_arrivals(shop_id), delivery_batches(shop_id), order_rejections(shop_id), orders(chosen_shop_id), orders(shop_id), settlements(shop_id), shop_binding_prices(shop_id), shop_colleges(shop_id), shop_rate_cards(shop_id), shop_services(shop_id)

### `rider_profiles`

Delivery partner details, KYC documents (storage keys), KYC status and availability.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `user_id` | uuid | no |  | UK, FK → `users(id)` |
| `full_name` | varchar(120) | no |  |  |
| `base_area` | varchar(160) | no |  |  |
| `vehicle_number` | varchar(20) | no |  |  |
| `upi_id` | varchar(80) | no |  |  |
| `dl_key` | varchar(400) | yes |  |  |
| `rc_key` | varchar(400) | yes |  |  |
| `kyc_status` | varchar(30) | no |  |  |
| `kyc_note` | text | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |
| `is_online` | boolean | no | `false` |  |

- Check `ck_rider_profiles_kycstatus`: `kyc_status IN ('pending', 'approved', 'rejected')`
- Index `ix_rider_profiles_kyc_status`: btree (kyc_status)
- Referenced by: batch_declines(rider_id), delivery_batches(rider_id), rider_colleges(rider_id), rider_settlements(rider_id)

### `admin_profiles`

Administrator details (created only by the bootstrap command).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `user_id` | uuid | no |  | UK, FK → `users(id)` |
| `full_name` | varchar(120) | no |  |  |
| `email` | varchar(254) | yes |  | UK |
| `created_at` | timestamptz | no | `now()` |  |


## 3. Colleges & delivery slots

### `colleges`

Colleges served, with security-cabin drop and collection instructions.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `name` | varchar(200) | no |  | UK |
| `city` | varchar(100) | yes |  |  |
| `security_cabin` | varchar(200) | no |  |  |
| `drop_instructions` | text | yes |  |  |
| `collection_instructions` | text | yes |  |  |
| `active` | boolean | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |
| `latitude` | numeric(9,6) | yes |  |  |
| `longitude` | numeric(9,6) | yes |  |  |

- Check `ck_colleges_coordinates`: `((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= 90))) AND ((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= 180)))`
- Referenced by: college_slots(college_id), delivery_batches(college_id), orders(college_id), rider_colleges(college_id), shop_colleges(college_id), student_profiles(college_id)

### `college_slots`

Recurring daily delivery slots per college (time, cut-off, capacity).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `college_id` | uuid | no |  | FK → `colleges(id)` |
| `label` | varchar(60) | no |  |  |
| `delivery_time` | time without time zone | no |  |  |
| `cutoff_minutes` | integer | no |  |  |
| `capacity` | integer | no |  |  |
| `active` | boolean | no |  |  |

- Check `ck_college_slots_limits`: `(cutoff_minutes >= 0) AND (capacity >= 0)`
- Index `ix_college_slots_college_id`: btree (college_id)
- Referenced by: delivery_batches(slot_id), orders(slot_id)

### `shop_colleges`

Which colleges each shop serves (admin-assigned).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `shop_id` | uuid | no |  | PK, FK → `shop_profiles(id)` |
| `college_id` | uuid | no |  | PK, FK → `colleges(id)` |

- Index `ix_shop_colleges_college_id`: btree (college_id)

### `rider_colleges`

Which colleges each rider serves, as primary or backup.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `rider_id` | uuid | no |  | PK, FK → `rider_profiles(id)` |
| `college_id` | uuid | no |  | PK, FK → `colleges(id)` |
| `is_backup` | boolean | no |  |  |

- Index `ix_rider_colleges_college_id`: btree (college_id)

## 4. Shops, services & rate cards

### `services`

Catalogue of printing and binding services (reference data).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `code` | varchar(30) | no |  | PK |
| `category` | varchar(20) | no |  |  |
| `label` | varchar(80) | no |  |  |

- Check `ck_services_category`: `category IN ('print', 'binding')`
- Referenced by: shop_services(service_code)

### `shop_services`

Services each shop offers; used to match orders to capable shops.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `shop_id` | uuid | no |  | PK, FK → `shop_profiles(id)` |
| `service_code` | varchar(30) | no |  | PK, FK → `services(code)` |

- Index `ix_shop_services_service_code`: btree (service_code)

### `shop_rate_cards`

A shop's own customer price per printed page; students compare shops on these.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `shop_id` | uuid | no |  | FK → `shop_profiles(id)` |
| `paper_size` | varchar(30) | no |  |  |
| `gsm` | integer | no |  |  |
| `color` | varchar(30) | no |  |  |
| `sided` | varchar(30) | no |  |  |
| `price_per_page` | numeric(10,2) | no |  |  |

- Check `ck_shop_rate_cards_colormode`: `color IN ('bw', 'color')`
- Check `ck_shop_rate_cards_gsm_allowed`: `gsm = ANY (ARRAY[70, 80, 100])`
- Check `ck_shop_rate_cards_papersize`: `paper_size IN ('A4', 'A3')`
- Check `ck_shop_rate_cards_price_non_negative`: `price_per_page >= 0`
- Check `ck_shop_rate_cards_sided`: `sided IN ('single', 'double')`
- Unique `uq_shop_rate_cards_shop_item`: (shop_id, paper_size, gsm, color, sided)
- Index `ix_shop_rate_cards_shop_id`: btree (shop_id)

### `shop_binding_prices`

A shop's own customer price per bound copy.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `shop_id` | uuid | no |  | PK, FK → `shop_profiles(id)` |
| `binding` | varchar(30) | no |  | PK |
| `price` | numeric(10,2) | no |  |  |

- Check `ck_shop_binding_prices_binding`: `binding IN ('none', 'spiral', 'calico', 'soft', 'hard')`
- Check `ck_shop_binding_prices_binding_not_none`: `(binding)::text <> 'none'::text`
- Check `ck_shop_binding_prices_price_non_negative`: `price >= 0`

### `rate_cards`

Standard customer price per printed page (admin-set): used when a student does not pick a shop, and as the starting rate card for new shops.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `paper_size` | varchar(30) | no |  |  |
| `gsm` | integer | no |  |  |
| `color` | varchar(30) | no |  |  |
| `sided` | varchar(30) | no |  |  |
| `price_per_page` | numeric(10,2) | no |  |  |

- Check `ck_rate_cards_colormode`: `color IN ('bw', 'color')`
- Check `ck_rate_cards_gsm_allowed`: `gsm = ANY (ARRAY[70, 80, 100])`
- Check `ck_rate_cards_papersize`: `paper_size IN ('A4', 'A3')`
- Check `ck_rate_cards_price_non_negative`: `price_per_page >= 0`
- Check `ck_rate_cards_sided`: `sided IN ('single', 'double')`
- Unique `uq_rate_cards_paper_size`: (paper_size, gsm, color, sided)

### `binding_prices`

Standard customer price per bound copy (admin-set); starting binding prices for new shops.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `binding` | varchar(30) | no |  | PK |
| `price` | numeric(10,2) | no |  |  |

- Check `ck_binding_prices_binding`: `binding IN ('none', 'spiral', 'calico', 'soft', 'hard')`
- Check `ck_binding_prices_price_non_negative`: `price >= 0`

## 5. Documents, orders & print customisation

### `orders`

A student's print order: production status, payment status, delivery slot, shop and commission split.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `code` | varchar(12) | no |  | UK |
| `student_id` | uuid | no |  | FK → `users(id)` |
| `college_id` | uuid | no |  | FK → `colleges(id)` |
| `slot_id` | uuid | yes |  | FK → `college_slots(id)` |
| `slot_date` | date | yes |  |  |
| `status` | varchar(30) | no |  |  |
| `payment_status` | varchar(30) | no |  |  |
| `binding` | varchar(30) | no |  |  |
| `cover_page` | boolean | no |  |  |
| `subject_name` | varchar(120) | yes |  |  |
| `subject_code` | varchar(40) | yes |  |  |
| `cover_template` | varchar(30) | no | `'classic'::character varying` |  |
| `cover_color` | varchar(30) | no | `'navy'::character varying` |  |
| `cover_title` | varchar(160) | yes |  |  |
| `coupon_code` | varchar(40) | yes |  |  |
| `checkout_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |
| `shop_id` | uuid | yes |  | FK → `shop_profiles(id)` |
| `shop_assigned_at` | timestamptz | yes |  |  |
| `commission_percent` | numeric(5,2) | yes |  |  |
| `commission_amount` | numeric(12,2) | yes |  |  |
| `shop_entitlement` | numeric(12,2) | yes |  |  |
| `packed_at` | timestamptz | yes |  |  |
| `settlement_id` | uuid | yes |  | FK → `settlements(id)` |
| `chosen_shop_id` | uuid | yes |  | FK → `shop_profiles(id)` |

- Check `ck_orders_binding`: `binding IN ('none', 'spiral', 'calico', 'soft', 'hard')`
- Check `ck_orders_covercolor`: `cover_color IN ('navy', 'maroon', 'forest', 'royal', 'charcoal', 'violet')`
- Check `ck_orders_covertemplate`: `cover_template IN ('classic', 'modern', 'minimal')`
- Check `ck_orders_commission_percent_range`: `(commission_percent >= 0) AND (commission_percent <= 100)`
- Check `ck_orders_orderstatus`: `status IN ('draft', 'awaiting_payment', 'placed', 'accepted', 'printing', 'packing', 'handover_verified', 'out_for_delivery', 'delivered', 'collected', 'cancelled', 'rejected')`
- Check `ck_orders_paymentstatus`: `payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refund_pending', 'refunded')`
- Check `ck_orders_split_non_negative`: `(commission_amount >= 0) AND (shop_entitlement >= 0)`
- Unique `uq_orders_id_student_id`: (id, student_id)
- Index `ix_orders_chosen_shop_id`: btree (chosen_shop_id)
- Index `ix_orders_college_id`: btree (college_id)
- Index `ix_orders_payment_status`: btree (payment_status)
- Index `ix_orders_settlement_id`: btree (settlement_id)
- Index `ix_orders_shop_id`: btree (shop_id)
- Index `ix_orders_slot_id`: btree (slot_id)
- Index `ix_orders_status`: btree (status)
- Index `ix_orders_student_id`: btree (student_id)
- Referenced by: batch_orders(order_id), complaints(order_id), complaints(order_id, student_id), custody_events(order_id), handover_otps(order_id), ledger_entries(order_id), notifications(order_id), order_documents(order_id), order_events(order_id), order_quotations(order_id), order_rejections(order_id), payments(order_id), refunds(order_id)

### `order_documents`

Uploaded document metadata; the file is in private object storage.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | FK → `orders(id)` |
| `position` | integer | no |  |  |
| `filename` | varchar(255) | no |  |  |
| `content_type` | varchar(120) | no |  |  |
| `size_bytes` | integer | no |  |  |
| `storage_key` | varchar(400) | no |  | UK |
| `page_count` | integer | yes |  |  |
| `page_count_auto` | boolean | no |  |  |
| `copies` | integer | no |  |  |
| `paper_size` | varchar(30) | no |  |  |
| `orientation` | varchar(30) | no | `'auto'::character varying` |  |
| `conversion_status` | varchar(30) | no | `'not_needed'::character varying` |  |
| `preview_key` | varchar(400) | yes |  | UK |

- Check `ck_order_documents_conversionstatus`: `conversion_status IN ('not_needed', 'pending', 'done', 'failed')`
- Check `ck_order_documents_copies_positive`: `copies >= 1`
- Check `ck_order_documents_page_count_positive`: `(page_count IS NULL) OR (page_count >= 1)`
- Check `ck_order_documents_orientation`: `orientation IN ('auto', 'portrait', 'landscape')`
- Check `ck_order_documents_papersize`: `paper_size IN ('A4', 'A3')`
- Check `ck_order_documents_size_positive`: `size_bytes > 0`
- Index `ix_order_documents_order_id`: btree (order_id)
- Referenced by: print_rules(document_id)

### `print_rules`

Page-range print settings (colour, GSM, sides) for a document.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `document_id` | uuid | no |  | FK → `order_documents(id)` |
| `page_from` | integer | no |  |  |
| `page_to` | integer | no |  |  |
| `color` | varchar(30) | no |  |  |
| `gsm` | integer | no |  |  |
| `sided` | varchar(30) | no |  |  |

- Check `ck_print_rules_colormode`: `color IN ('bw', 'color')`
- Check `ck_print_rules_gsm_allowed`: `gsm = ANY (ARRAY[70, 80, 100])`
- Check `ck_print_rules_page_range`: `(page_from >= 1) AND (page_to >= page_from)`
- Check `ck_print_rules_sided`: `sided IN ('single', 'double')`
- Index `ix_print_rules_document_id`: btree (document_id)

### `order_quotations`

Immutable price snapshot taken at checkout; the payment amount derives from it.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | UK, FK → `orders(id)` |
| `printing_amount` | numeric(12,2) | no |  |  |
| `binding_amount` | numeric(12,2) | no |  |  |
| `cover_amount` | numeric(12,2) | no |  |  |
| `delivery_fee` | numeric(12,2) | no |  |  |
| `discount` | numeric(12,2) | no |  |  |
| `total` | numeric(12,2) | no |  |  |
| `lines` | jsonb | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Check `ck_order_quotations_amounts_non_negative`: `(printing_amount >= 0) AND (binding_amount >= 0) AND (cover_amount >= 0) AND (delivery_fee >= 0) AND (discount >= 0) AND (total >= 0)`

### `order_events`

Append-only order history with from/to status, actor and note.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | FK → `orders(id)` |
| `type` | varchar(40) | no |  |  |
| `actor_id` | uuid | yes |  | FK → `users(id)` |
| `note` | text | yes |  |  |
| `created_at` | timestamptz | no |  |  |
| `from_status` | varchar(30) | yes |  |  |
| `to_status` | varchar(30) | yes |  |  |

- Check `ck_order_events_from_status`: `from_status IN ('draft', 'awaiting_payment', 'placed', 'accepted', 'printing', 'packing', 'handover_verified', 'out_for_delivery', 'delivered', 'collected', 'cancelled', 'rejected')`
- Check `ck_order_events_to_status`: `to_status IN ('draft', 'awaiting_payment', 'placed', 'accepted', 'printing', 'packing', 'handover_verified', 'out_for_delivery', 'delivered', 'collected', 'cancelled', 'rejected')`
- Index `ix_order_events_actor_id`: btree (actor_id)
- Index `ix_order_events_order_id`: btree (order_id)

### `order_rejections`

Shops that declined an order (never re-offered to them).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | FK → `orders(id)` |
| `shop_id` | uuid | no |  | FK → `shop_profiles(id)` |
| `reason` | text | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Unique `uq_order_rejections_order_id_shop_id`: (order_id, shop_id)
- Index `ix_order_rejections_order_id`: btree (order_id)
- Index `ix_order_rejections_shop_id`: btree (shop_id)

## 6. Payments, coupons & refunds

### `payments`

Razorpay payment attempts; captured only after signature/webhook verification.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | FK → `orders(id)` |
| `provider_order_id` | varchar(80) | no |  | UK |
| `provider_payment_id` | varchar(80) | yes |  |  |
| `amount` | numeric(12,2) | no |  |  |
| `currency` | varchar(3) | no |  |  |
| `is_current` | boolean | no |  |  |
| `status` | varchar(30) | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |
| `captured_at` | timestamptz | yes |  |  |

- Check `ck_payments_amount_positive`: `amount > 0`
- Check `ck_payments_gatewaystatus`: `status IN ('created', 'captured', 'failed')`
- Unique `uq_payments_id_order_id`: (id, order_id)
- Index `ix_payments_order_id`: btree (order_id)
- Index `ix_payments_status`: btree (status)
- Referenced by: refunds(order_id, payment_id), refunds(payment_id)

### `webhook_events`

Processed payment webhook ids (idempotency).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `event_id` | varchar(80) | no |  | PK |
| `received_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |


### `coupons`

Discount codes: a percentage or a flat amount, never both.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `code` | varchar(40) | no |  | PK |
| `percent_off` | numeric(5,2) | yes |  |  |
| `flat_off` | numeric(10,2) | yes |  |  |
| `active` | boolean | no |  |  |
| `valid_until` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Check `ck_coupons_flat_positive`: `(flat_off IS NULL) OR (flat_off > 0)`
- Check `ck_coupons_one_discount_kind`: `(percent_off IS NULL) <> (flat_off IS NULL)`
- Check `ck_coupons_percent_range`: `(percent_off IS NULL) OR ((percent_off > 0) AND (percent_off <= 100))`

### `refunds`

Refund requests and decisions, optionally recovering an amount from the shop.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | FK → `orders(id)` |
| `payment_id` | uuid | no |  | FK → `payments(id)` |
| `amount` | numeric(12,2) | no |  |  |
| `status` | varchar(30) | no |  |  |
| `reason` | text | yes |  |  |
| `provider_ref` | varchar(80) | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |
| `complaint_id` | uuid | yes |  | FK → `complaints(id)` |
| `shop_deduction` | numeric(12,2) | no |  |  |
| `shop_settlement_id` | uuid | yes |  | FK → `settlements(id)` |
| `decided_by` | uuid | yes |  | FK → `users(id)` |
| `decision_note` | text | yes |  |  |

- Check `ck_refunds_amount_positive`: `amount > 0`
- Check `ck_refunds_refundstatus`: `status IN ('requested', 'approved', 'rejected', 'processed')`
- Check `ck_refunds_shop_deduction_range`: `(shop_deduction >= 0) AND (shop_deduction <= amount)`
- Composite FK `fk_refunds_payment_order`: FOREIGN KEY (payment_id, order_id) REFERENCES payments(id, order_id)
- Index `ix_refunds_complaint_id`: btree (complaint_id)
- Index `ix_refunds_decided_by`: btree (decided_by)
- Index `ix_refunds_order_id`: btree (order_id)
- Index `ix_refunds_payment_id`: btree (payment_id)
- Index `ix_refunds_shop_settlement_id`: btree (shop_settlement_id)
- Index `ix_refunds_status`: btree (status)

## 7. Delivery batches, pickup OTPs & custody

### `delivery_batches`

A delivery run per college, slot and date (rider-consolidated or shop-direct).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `code` | varchar(12) | no |  | UK |
| `mode` | varchar(30) | no |  |  |
| `college_id` | uuid | no |  | FK → `colleges(id)` |
| `slot_id` | uuid | no |  | FK → `college_slots(id)` |
| `slot_date` | date | no |  |  |
| `rider_id` | uuid | yes |  | FK → `rider_profiles(id)` |
| `shop_id` | uuid | yes |  | FK → `shop_profiles(id)` |
| `status` | varchar(30) | no |  |  |
| `offered_at` | timestamptz | yes |  |  |
| `accepted_at` | timestamptz | yes |  |  |
| `departed_at` | timestamptz | yes |  |  |
| `completed_at` | timestamptz | yes |  |  |
| `payout_base` | numeric(12,2) | yes |  |  |
| `payout_extra_shops` | numeric(12,2) | yes |  |  |
| `payout_packet_bonus` | numeric(12,2) | yes |  |  |
| `payout_total` | numeric(12,2) | yes |  |  |
| `settlement_id` | uuid | yes |  | FK → `rider_settlements(id)` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Check `ck_delivery_batches_batchmode`: `mode IN ('consolidated', 'direct')`
- Check `ck_delivery_batches_batchstatus`: `status IN ('unassigned', 'offered', 'accepted', 'out_for_delivery', 'completed', 'cancelled')`
- Check `ck_delivery_batches_direct_has_shop`: `((mode)::text = 'consolidated'::text) OR (shop_id IS NOT NULL)`
- Check `ck_delivery_batches_payout_non_negative`: `(payout_total IS NULL) OR (payout_total >= 0)`
- Index `ix_delivery_batches_college_id`: btree (college_id)
- Index `ix_delivery_batches_rider_id`: btree (rider_id)
- Index `ix_delivery_batches_settlement_id`: btree (settlement_id)
- Index `ix_delivery_batches_shop_id`: btree (shop_id)
- Index `ix_delivery_batches_slot_id`: btree (slot_id)
- Index `ix_delivery_batches_status`: btree (status)
- Referenced by: batch_declines(batch_id), batch_orders(batch_id), batch_shop_arrivals(batch_id), custody_events(batch_id), ledger_entries(batch_id), shelf_photos(batch_id)

### `batch_orders`

Orders in a batch with their pickup status.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `batch_id` | uuid | no |  | FK → `delivery_batches(id)` |
| `order_id` | uuid | no |  | FK → `orders(id)` |
| `shop_id` | uuid | no |  | FK → `shop_profiles(id)` |
| `status` | varchar(30) | no |  |  |
| `picked_up_at` | timestamptz | yes |  |  |
| `note` | text | yes |  |  |

- Check `ck_batch_orders_batchorderstatus`: `status IN ('pending', 'picked_up', 'skipped', 'removed')`
- Unique `uq_batch_orders_batch_id`: (batch_id, order_id)
- Index `ix_batch_orders_batch_id`: btree (batch_id)
- Index `ix_batch_orders_order_id`: btree (order_id)
- Index `ix_batch_orders_shop_id`: btree (shop_id)

### `batch_shop_arrivals`

When the rider arrived at each shop (starts the no-wait timer).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `batch_id` | uuid | no |  | PK, FK → `delivery_batches(id)` |
| `shop_id` | uuid | no |  | PK, FK → `shop_profiles(id)` |
| `arrived_at` | timestamptz | no |  |  |

- Index `ix_batch_shop_arrivals_shop_id`: btree (shop_id)

### `batch_declines`

Riders who declined a batch offer.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `batch_id` | uuid | no |  | PK, FK → `delivery_batches(id)` |
| `rider_id` | uuid | no |  | PK, FK → `rider_profiles(id)` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Index `ix_batch_declines_rider_id`: btree (rider_id)

### `handover_otps`

Hashed 4-digit shop-to-rider handover code per order.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | UK, FK → `orders(id)` |
| `code_hash` | varchar(64) | no |  |  |
| `attempts` | integer | no |  |  |
| `used` | boolean | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |


### `custody_events`

Append-only chain of custody for each packet.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | FK → `orders(id)` |
| `batch_id` | uuid | yes |  | FK → `delivery_batches(id)` |
| `type` | varchar(40) | no |  |  |
| `actor_id` | uuid | yes |  | FK → `users(id)` |
| `note` | text | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Index `ix_custody_events_actor_id`: btree (actor_id)
- Index `ix_custody_events_batch_id`: btree (batch_id)
- Index `ix_custody_events_order_id`: btree (order_id)

## 8. Shelf photo proofs & collection

### `shelf_photos`

Security-cabin shelf photo proofs (storage keys) per batch.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `batch_id` | uuid | no |  | FK → `delivery_batches(id)` |
| `storage_key` | varchar(400) | no |  | UK |
| `uploaded_by` | uuid | no |  | FK → `users(id)` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Index `ix_shelf_photos_batch_id`: btree (batch_id)
- Index `ix_shelf_photos_uploaded_by`: btree (uploaded_by)

## 9. Complaints & resolutions

### `complaints`

Student complaints, admin response and resolution.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `order_id` | uuid | no |  | FK → `orders(id)` |
| `student_id` | uuid | no |  | FK → `users(id)` |
| `category` | varchar(30) | no |  |  |
| `description` | text | no |  |  |
| `status` | varchar(30) | no |  |  |
| `admin_response` | text | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |
| `resolved_by` | uuid | yes |  | FK → `users(id)` |
| `resolved_at` | timestamptz | yes |  |  |

- Check `ck_complaints_complaintcategory`: `category IN ('damaged_binding', 'missing_pages', 'not_on_shelf', 'late_delivery')`
- Check `ck_complaints_complaintstatus`: `status IN ('open', 'in_review', 'resolved', 'rejected')`
- Composite FK `fk_complaints_order_owner`: FOREIGN KEY (order_id, student_id) REFERENCES orders(id, student_id)
- Index `ix_complaints_order_id`: btree (order_id)
- Index `ix_complaints_resolved_by`: btree (resolved_by)
- Index `ix_complaints_status`: btree (status)
- Index `ix_complaints_student_id`: btree (student_id)
- Referenced by: complaint_attachments(complaint_id), refunds(complaint_id)

### `complaint_attachments`

Complaint evidence photo metadata; files are in private object storage.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `complaint_id` | uuid | no |  | FK → `complaints(id)` |
| `storage_key` | varchar(400) | no |  | UK |
| `content_type` | varchar(60) | no |  |  |
| `size_bytes` | integer | yes |  |  |
| `uploaded_by` | uuid | no |  | FK → `users(id)` |
| `created_at` | timestamptz | no | `now()` |  |

- Check `ck_complaint_attachments_size_positive`: `(size_bytes IS NULL) OR (size_bytes > 0)`
- Index `ix_complaint_attachments_complaint_id`: btree (complaint_id)
- Index `ix_complaint_attachments_uploaded_by`: btree (uploaded_by)

## 10. Ledger & settlements

### `ledger_entries`

Append-only financial ledger; `ref` makes every posting idempotent.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `ref` | varchar(120) | no |  | UK |
| `type` | varchar(30) | no |  |  |
| `amount` | numeric(12,2) | no |  |  |
| `order_id` | uuid | yes |  | FK → `orders(id)` |
| `batch_id` | uuid | yes |  | FK → `delivery_batches(id)` |
| `note` | text | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Check `ck_ledger_entries_amount_non_negative`: `amount >= 0`
- Check `ck_ledger_entries_ledgertype`: `type IN ('gross_revenue', 'printing_charges', 'delivery_fee', 'discount', 'shop_entitlement', 'rider_payout', 'gateway_fee', 'refund', 'shop_refund_recovery', 'platform_commission')`
- Index `ix_ledger_entries_batch_id`: btree (batch_id)
- Index `ix_ledger_entries_created_at`: btree (created_at)
- Index `ix_ledger_entries_order_id`: btree (order_id)
- Index `ix_ledger_entries_type`: btree (type)

### `settlements`

Weekly shop payouts.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `shop_id` | uuid | no |  | FK → `shop_profiles(id)` |
| `period_start` | date | no |  |  |
| `period_end` | date | no |  |  |
| `order_count` | integer | no |  |  |
| `gross_amount` | numeric(12,2) | no |  |  |
| `refund_deductions` | numeric(12,2) | no |  |  |
| `net_amount` | numeric(12,2) | no |  |  |
| `status` | varchar(30) | no |  |  |
| `upi_reference` | varchar(80) | yes |  |  |
| `paid_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Check `ck_settlements_amounts_non_negative`: `(order_count >= 0) AND (gross_amount >= 0) AND (refund_deductions >= 0)`
- Check `ck_settlements_period`: `period_end >= period_start`
- Check `ck_settlements_settlementstatus`: `status IN ('pending', 'paid')`
- Unique `uq_settlements_shop_id`: (shop_id, period_start, period_end)
- Index `ix_settlements_shop_id`: btree (shop_id)
- Referenced by: orders(settlement_id), refunds(shop_settlement_id)

### `rider_settlements`

Twice-weekly rider payouts.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `rider_id` | uuid | no |  | FK → `rider_profiles(id)` |
| `period_start` | date | no |  |  |
| `period_end` | date | no |  |  |
| `batch_count` | integer | no |  |  |
| `amount` | numeric(12,2) | no |  |  |
| `status` | varchar(30) | no |  |  |
| `upi_reference` | varchar(80) | yes |  |  |
| `paid_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Check `ck_rider_settlements_amounts_non_negative`: `(batch_count >= 0) AND (amount >= 0)`
- Check `ck_rider_settlements_period`: `period_end >= period_start`
- Check `ck_rider_settlements_ridersettlementstatus`: `status IN ('pending', 'paid')`
- Unique `uq_rider_settlements_rider_id`: (rider_id, period_start, period_end)
- Index `ix_rider_settlements_rider_id`: btree (rider_id)
- Referenced by: delivery_batches(settlement_id)

## 11. Notifications

### `notifications`

In-app notifications per user.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `user_id` | uuid | no |  | FK → `users(id)` |
| `kind` | varchar(40) | no |  |  |
| `title` | varchar(160) | no |  |  |
| `body` | text | yes |  |  |
| `order_id` | uuid | yes |  | FK → `orders(id)` |
| `read` | boolean | no |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Index `ix_notifications_order_id`: btree (order_id)
- Index `ix_notifications_user_id`: btree (user_id)
- Index `ix_notifications_user_unread`: btree (user_id, read)

## 12. Admin settings & audit

### `platform_config`

Single-row admin settings: fees, commission, limits and payout rules.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | integer | no | `nextval('platform_config_id_seq'::regclass)` | PK |
| `delivery_fee` | numeric(10,2) | no |  |  |
| `cover_page_fee` | numeric(10,2) | no |  |  |
| `commission_percent` | numeric(5,2) | no |  |  |
| `max_upload_mb` | integer | no |  |  |
| `slot_hold_minutes` | integer | no |  |  |
| `rider_base_fee` | numeric(10,2) | no | `'0'::numeric` |  |
| `rider_extra_shop_fee` | numeric(10,2) | no | `'0'::numeric` |  |
| `rider_packet_bonus` | numeric(10,2) | no | `'0'::numeric` |  |
| `rider_min_guarantee` | numeric(10,2) | no | `'0'::numeric` |  |
| `no_wait_minutes` | integer | no | `4` |  |
| `gateway_fee_percent` | numeric(5,2) | no | `'0'::numeric` |  |
| `late_refund_percent` | numeric(5,2) | no | `'0'::numeric` |  |

- Check `ck_platform_config_fees_non_negative`: `(delivery_fee >= 0) AND (cover_page_fee >= 0) AND (rider_base_fee >= 0) AND (rider_extra_shop_fee >= 0) AND (rider_packet_bonus >= 0) AND (rider_min_guarantee >= 0)`
- Check `ck_platform_config_limits`: `(max_upload_mb > 0) AND (slot_hold_minutes > 0) AND (no_wait_minutes >= 0)`
- Check `ck_platform_config_percents`: `((commission_percent >= 0) AND (commission_percent <= 100)) AND ((gateway_fee_percent >= 0) AND (gateway_fee_percent <= 100)) AND ((late_refund_percent >= 0) AND (late_refund_percent <= 100))`
- Check `ck_platform_config_single_row`: `id = 1`

### `audit_logs`

Who changed what, for admin and financial actions.

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `id` | uuid | no |  | PK |
| `actor_id` | uuid | yes |  | FK → `users(id)` |
| `action` | varchar(60) | no |  |  |
| `entity` | varchar(40) | no |  |  |
| `entity_id` | varchar(60) | yes |  |  |
| `data` | jsonb | yes |  |  |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |  |

- Index `ix_audit_logs_action`: btree (action)
- Index `ix_audit_logs_actor_id`: btree (actor_id)
- Index `ix_audit_logs_created_at`: btree (created_at)
- Index `ix_audit_logs_entity`: btree (entity)

## Migration bookkeeping

### `alembic_version`

Alembic migration bookkeeping (current revision).

| Column | Type | Null | Default | Keys |
|---|---|---|---|---|
| `version_num` | varchar(32) | no |  | PK |

