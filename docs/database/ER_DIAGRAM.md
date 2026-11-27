# UpLOAD ER Diagram

Generated from the SQLAlchemy models (`backend/app/**/models.py`), which migration `0006` brings `upload_db` in line with.
Regenerate after schema changes (see [MIGRATIONS.md](MIGRATIONS.md)). Notation: `||` exactly one, `|o` zero or one, `o{` zero or many, `o|` zero or one on the child side (one-to-one). PK primary key, FK foreign key, UK unique.

## Overview (all 43 tables)

```mermaid
erDiagram
    college_slots |o--o{ orders : "slot_id"
    college_slots ||--o{ delivery_batches : "slot_id"
    colleges ||--o{ college_slots : "college_id"
    colleges ||--o{ delivery_batches : "college_id"
    colleges ||--o{ orders : "college_id"
    colleges ||--o{ rider_colleges : "college_id"
    colleges ||--o{ shop_colleges : "college_id"
    colleges ||--o{ student_profiles : "college_id"
    complaints |o--o{ refunds : "complaint_id"
    complaints ||--o{ complaint_attachments : "complaint_id"
    delivery_batches |o--o{ custody_events : "batch_id"
    delivery_batches |o--o{ ledger_entries : "batch_id"
    delivery_batches ||--o{ batch_declines : "batch_id"
    delivery_batches ||--o{ batch_orders : "batch_id"
    delivery_batches ||--o{ batch_shop_arrivals : "batch_id"
    delivery_batches ||--o{ shelf_photos : "batch_id"
    order_documents ||--o{ print_rules : "document_id"
    orders |o--o{ ledger_entries : "order_id"
    orders |o--o{ notifications : "order_id"
    orders ||--o{ batch_orders : "order_id"
    orders ||--o{ complaints : "order_id"
    orders ||--o{ complaints : "order_id, student_id"
    orders ||--o{ custody_events : "order_id"
    orders ||--o{ order_documents : "order_id"
    orders ||--o{ order_events : "order_id"
    orders ||--o{ order_rejections : "order_id"
    orders ||--o{ payments : "order_id"
    orders ||--o{ refunds : "order_id"
    orders ||--o| handover_otps : "order_id"
    orders ||--o| order_quotations : "order_id"
    payments ||--o{ refunds : "payment_id"
    payments ||--o{ refunds : "payment_id, order_id"
    rider_profiles |o--o{ delivery_batches : "rider_id"
    rider_profiles ||--o{ batch_declines : "rider_id"
    rider_profiles ||--o{ rider_colleges : "rider_id"
    rider_profiles ||--o{ rider_settlements : "rider_id"
    rider_settlements |o--o{ delivery_batches : "settlement_id"
    roles ||--o{ users : "role"
    services ||--o{ shop_services : "service_code"
    settlements |o--o{ orders : "settlement_id"
    settlements |o--o{ refunds : "shop_settlement_id"
    shop_profiles |o--o{ delivery_batches : "shop_id"
    shop_profiles |o--o{ orders : "chosen_shop_id"
    shop_profiles |o--o{ orders : "shop_id"
    shop_profiles ||--o{ batch_orders : "shop_id"
    shop_profiles ||--o{ batch_shop_arrivals : "shop_id"
    shop_profiles ||--o{ order_rejections : "shop_id"
    shop_profiles ||--o{ settlements : "shop_id"
    shop_profiles ||--o{ shop_binding_prices : "shop_id"
    shop_profiles ||--o{ shop_colleges : "shop_id"
    shop_profiles ||--o{ shop_rate_cards : "shop_id"
    shop_profiles ||--o{ shop_services : "shop_id"
    users |o--o{ audit_logs : "actor_id"
    users |o--o{ complaints : "resolved_by"
    users |o--o{ custody_events : "actor_id"
    users |o--o{ order_events : "actor_id"
    users |o--o{ refunds : "decided_by"
    users ||--o{ complaint_attachments : "uploaded_by"
    users ||--o{ complaints : "student_id"
    users ||--o{ notifications : "user_id"
    users ||--o{ orders : "student_id"
    users ||--o{ refresh_tokens : "user_id"
    users ||--o{ shelf_photos : "uploaded_by"
    users ||--o| admin_profiles : "user_id"
    users ||--o| rider_profiles : "user_id"
    users ||--o| shop_profiles : "user_id"
    users ||--o| student_profiles : "user_id"
```

## 1. Users & authentication

```mermaid
erDiagram
    roles {
        varchar name PK
        text description
    }
    users {
        uuid id PK
        varchar mobile UK
        varchar email UK
        varchar password_hash
        integer failed_logins
        timestamptz locked_until
        varchar role FK
        boolean is_active
        timestamptz created_at
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        varchar token_hash UK
        timestamptz expires_at
        boolean revoked
        timestamptz created_at
    }
    roles ||--o{ users : "role"
    users ||--o{ refresh_tokens : "user_id"
```

Links to other modules: `audit_logs.actor_id` → `users`; `complaints.resolved_by` → `users`; `custody_events.actor_id` → `users`; `order_events.actor_id` → `users`; `refunds.decided_by` → `users`; `complaint_attachments.uploaded_by` → `users`; `complaints.student_id` → `users`; `notifications.user_id` → `users`; `orders.student_id` → `users`; `shelf_photos.uploaded_by` → `users`; `admin_profiles.user_id` → `users`; `rider_profiles.user_id` → `users`; `shop_profiles.user_id` → `users`; `student_profiles.user_id` → `users`

## 2. Profiles

```mermaid
erDiagram
    student_profiles {
        uuid id PK
        uuid user_id FK,UK
        varchar full_name
        uuid college_id FK
        varchar department
        integer year
        varchar register_number
        varchar referral_code UK
        timestamptz created_at
    }
    shop_profiles {
        uuid id PK
        uuid user_id FK,UK
        varchar shop_name
        varchar owner_name
        numeric latitude
        numeric longitude
        varchar area
        varchar landmark
        varchar upi_id
        varchar bank_account_name
        varchar bank_account_number
        varchar bank_ifsc
        timestamptz terms_accepted_at
        varchar status
        text rejection_reason
        boolean is_open
        timestamptz created_at
    }
    rider_profiles {
        uuid id PK
        uuid user_id FK,UK
        varchar full_name
        varchar base_area
        varchar vehicle_number
        varchar upi_id
        varchar dl_key
        varchar rc_key
        varchar kyc_status
        text kyc_note
        boolean is_online
        timestamptz created_at
    }
    admin_profiles {
        uuid id PK
        uuid user_id FK,UK
        varchar full_name
        varchar email UK
        timestamptz created_at
    }
```

Links to other modules: `student_profiles.college_id` → `colleges`; `delivery_batches.rider_id` → `rider_profiles`; `batch_declines.rider_id` → `rider_profiles`; `rider_colleges.rider_id` → `rider_profiles`; `rider_settlements.rider_id` → `rider_profiles`; `delivery_batches.shop_id` → `shop_profiles`; `orders.chosen_shop_id` → `shop_profiles`; `orders.shop_id` → `shop_profiles`; `batch_orders.shop_id` → `shop_profiles`; `batch_shop_arrivals.shop_id` → `shop_profiles`; `order_rejections.shop_id` → `shop_profiles`; `settlements.shop_id` → `shop_profiles`; `shop_binding_prices.shop_id` → `shop_profiles`; `shop_colleges.shop_id` → `shop_profiles`; `shop_rate_cards.shop_id` → `shop_profiles`; `shop_services.shop_id` → `shop_profiles`; `admin_profiles.user_id` → `users`; `rider_profiles.user_id` → `users`; `shop_profiles.user_id` → `users`; `student_profiles.user_id` → `users`

## 3. Colleges & delivery slots

```mermaid
erDiagram
    colleges {
        uuid id PK
        varchar name UK
        varchar city
        varchar security_cabin
        text drop_instructions
        text collection_instructions
        numeric latitude
        numeric longitude
        boolean active
        timestamptz created_at
    }
    college_slots {
        uuid id PK
        uuid college_id FK
        varchar label
        time_without_time_zone delivery_time
        integer cutoff_minutes
        integer capacity
        boolean active
    }
    shop_colleges {
        uuid shop_id PK,FK
        uuid college_id PK,FK
    }
    rider_colleges {
        uuid rider_id PK,FK
        uuid college_id PK,FK
        boolean is_backup
    }
    colleges ||--o{ college_slots : "college_id"
    colleges ||--o{ rider_colleges : "college_id"
    colleges ||--o{ shop_colleges : "college_id"
```

Links to other modules: `orders.slot_id` → `college_slots`; `delivery_batches.slot_id` → `college_slots`; `delivery_batches.college_id` → `colleges`; `orders.college_id` → `colleges`; `student_profiles.college_id` → `colleges`; `rider_colleges.rider_id` → `rider_profiles`; `shop_colleges.shop_id` → `shop_profiles`

## 4. Shops, services & rate cards

```mermaid
erDiagram
    services {
        varchar code PK
        varchar category
        varchar label
    }
    shop_services {
        uuid shop_id PK,FK
        varchar service_code PK,FK
    }
    shop_rate_cards {
        uuid id PK
        uuid shop_id FK
        varchar paper_size
        integer gsm
        varchar color
        varchar sided
        numeric price_per_page
    }
    shop_binding_prices {
        uuid shop_id PK,FK
        varchar binding PK
        numeric price
    }
    rate_cards {
        uuid id PK
        varchar paper_size
        integer gsm
        varchar color
        varchar sided
        numeric price_per_page
    }
    binding_prices {
        varchar binding PK
        numeric price
    }
    services ||--o{ shop_services : "service_code"
```

Links to other modules: `shop_binding_prices.shop_id` → `shop_profiles`; `shop_rate_cards.shop_id` → `shop_profiles`; `shop_services.shop_id` → `shop_profiles`

## 5. Documents, orders & print customisation

```mermaid
erDiagram
    orders {
        uuid id PK
        varchar code UK
        uuid student_id FK
        uuid college_id FK
        uuid slot_id FK
        date slot_date
        varchar status
        varchar payment_status
        varchar binding
        boolean cover_page
        varchar subject_name
        varchar subject_code
        varchar cover_template
        varchar cover_color
        varchar cover_title
        varchar coupon_code
        uuid chosen_shop_id FK
        timestamptz checkout_at
        uuid shop_id FK
        timestamptz shop_assigned_at
        numeric commission_percent
        numeric commission_amount
        numeric shop_entitlement
        timestamptz packed_at
        uuid settlement_id FK
        timestamptz created_at
    }
    order_documents {
        uuid id PK
        uuid order_id FK
        integer position
        varchar filename
        varchar content_type
        integer size_bytes
        varchar storage_key UK
        integer page_count
        boolean page_count_auto
        integer copies
        varchar paper_size
        varchar orientation
        varchar conversion_status
        varchar preview_key UK
    }
    print_rules {
        uuid id PK
        uuid document_id FK
        integer page_from
        integer page_to
        varchar color
        integer gsm
        varchar sided
    }
    order_quotations {
        uuid id PK
        uuid order_id FK,UK
        numeric printing_amount
        numeric binding_amount
        numeric cover_amount
        numeric delivery_fee
        numeric discount
        numeric total
        jsonb lines
        timestamptz created_at
    }
    order_events {
        uuid id PK
        uuid order_id FK
        varchar type
        varchar from_status
        varchar to_status
        uuid actor_id FK
        text note
        timestamptz created_at
    }
    order_rejections {
        uuid id PK
        uuid order_id FK
        uuid shop_id FK
        text reason
        timestamptz created_at
    }
    order_documents ||--o{ print_rules : "document_id"
    orders ||--o{ order_documents : "order_id"
    orders ||--o{ order_events : "order_id"
    orders ||--o{ order_rejections : "order_id"
    orders ||--o| order_quotations : "order_id"
```

Links to other modules: `orders.slot_id` → `college_slots`; `orders.college_id` → `colleges`; `ledger_entries.order_id` → `orders`; `notifications.order_id` → `orders`; `batch_orders.order_id` → `orders`; `complaints.order_id` → `orders`; `complaints.order_id, student_id` → `orders`; `custody_events.order_id` → `orders`; `payments.order_id` → `orders`; `refunds.order_id` → `orders`; `handover_otps.order_id` → `orders`; `orders.settlement_id` → `settlements`; `orders.chosen_shop_id` → `shop_profiles`; `orders.shop_id` → `shop_profiles`; `order_rejections.shop_id` → `shop_profiles`; `order_events.actor_id` → `users`; `orders.student_id` → `users`

## 6. Payments, coupons & refunds

```mermaid
erDiagram
    payments {
        uuid id PK
        uuid order_id FK
        varchar provider_order_id UK
        varchar provider_payment_id
        numeric amount
        varchar currency
        boolean is_current
        varchar status
        timestamptz created_at
        timestamptz captured_at
    }
    webhook_events {
        varchar event_id PK
        timestamptz received_at
    }
    coupons {
        varchar code PK
        numeric percent_off
        numeric flat_off
        boolean active
        timestamptz valid_until
        timestamptz created_at
    }
    refunds {
        uuid id PK
        uuid order_id FK
        uuid payment_id FK
        numeric amount
        varchar status
        text reason
        varchar provider_ref
        uuid complaint_id FK
        numeric shop_deduction
        uuid shop_settlement_id FK
        uuid decided_by FK
        text decision_note
        timestamptz created_at
    }
    payments ||--o{ refunds : "payment_id"
    payments ||--o{ refunds : "payment_id, order_id"
```

Links to other modules: `refunds.complaint_id` → `complaints`; `payments.order_id` → `orders`; `refunds.order_id` → `orders`; `refunds.shop_settlement_id` → `settlements`; `refunds.decided_by` → `users`

## 7. Delivery batches, pickup OTPs & custody

```mermaid
erDiagram
    delivery_batches {
        uuid id PK
        varchar code UK
        varchar mode
        uuid college_id FK
        uuid slot_id FK
        date slot_date
        uuid rider_id FK
        uuid shop_id FK
        varchar status
        timestamptz offered_at
        timestamptz accepted_at
        timestamptz departed_at
        timestamptz completed_at
        numeric payout_base
        numeric payout_extra_shops
        numeric payout_packet_bonus
        numeric payout_total
        uuid settlement_id FK
        timestamptz created_at
    }
    batch_orders {
        uuid id PK
        uuid batch_id FK
        uuid order_id FK
        uuid shop_id FK
        varchar status
        timestamptz picked_up_at
        text note
    }
    batch_shop_arrivals {
        uuid batch_id PK,FK
        uuid shop_id PK,FK
        timestamptz arrived_at
    }
    batch_declines {
        uuid batch_id PK,FK
        uuid rider_id PK,FK
        timestamptz created_at
    }
    handover_otps {
        uuid id PK
        uuid order_id FK,UK
        varchar code_hash
        integer attempts
        boolean used
        timestamptz created_at
    }
    custody_events {
        uuid id PK
        uuid order_id FK
        uuid batch_id FK
        varchar type
        uuid actor_id FK
        text note
        timestamptz created_at
    }
    delivery_batches |o--o{ custody_events : "batch_id"
    delivery_batches ||--o{ batch_declines : "batch_id"
    delivery_batches ||--o{ batch_orders : "batch_id"
    delivery_batches ||--o{ batch_shop_arrivals : "batch_id"
```

Links to other modules: `delivery_batches.slot_id` → `college_slots`; `delivery_batches.college_id` → `colleges`; `ledger_entries.batch_id` → `delivery_batches`; `shelf_photos.batch_id` → `delivery_batches`; `batch_orders.order_id` → `orders`; `custody_events.order_id` → `orders`; `handover_otps.order_id` → `orders`; `delivery_batches.rider_id` → `rider_profiles`; `batch_declines.rider_id` → `rider_profiles`; `delivery_batches.settlement_id` → `rider_settlements`; `delivery_batches.shop_id` → `shop_profiles`; `batch_orders.shop_id` → `shop_profiles`; `batch_shop_arrivals.shop_id` → `shop_profiles`; `custody_events.actor_id` → `users`

## 8. Shelf photo proofs & collection

```mermaid
erDiagram
    shelf_photos {
        uuid id PK
        uuid batch_id FK
        varchar storage_key UK
        uuid uploaded_by FK
        timestamptz created_at
    }
```

Links to other modules: `shelf_photos.batch_id` → `delivery_batches`; `shelf_photos.uploaded_by` → `users`

## 9. Complaints & resolutions

```mermaid
erDiagram
    complaints {
        uuid id PK
        uuid order_id FK
        uuid student_id FK
        varchar category
        text description
        varchar status
        text admin_response
        uuid resolved_by FK
        timestamptz resolved_at
        timestamptz created_at
    }
    complaint_attachments {
        uuid id PK
        uuid complaint_id FK
        varchar storage_key UK
        varchar content_type
        integer size_bytes
        uuid uploaded_by FK
        timestamptz created_at
    }
    complaints ||--o{ complaint_attachments : "complaint_id"
```

Links to other modules: `refunds.complaint_id` → `complaints`; `complaints.order_id` → `orders`; `complaints.order_id, student_id` → `orders`; `complaints.resolved_by` → `users`; `complaint_attachments.uploaded_by` → `users`; `complaints.student_id` → `users`

## 10. Ledger & settlements

```mermaid
erDiagram
    ledger_entries {
        uuid id PK
        varchar ref UK
        varchar type
        numeric amount
        uuid order_id FK
        uuid batch_id FK
        text note
        timestamptz created_at
    }
    settlements {
        uuid id PK
        uuid shop_id FK
        date period_start
        date period_end
        integer order_count
        numeric gross_amount
        numeric refund_deductions
        numeric net_amount
        varchar status
        varchar upi_reference
        timestamptz paid_at
        timestamptz created_at
    }
    rider_settlements {
        uuid id PK
        uuid rider_id FK
        date period_start
        date period_end
        integer batch_count
        numeric amount
        varchar status
        varchar upi_reference
        timestamptz paid_at
        timestamptz created_at
    }
```

Links to other modules: `ledger_entries.batch_id` → `delivery_batches`; `ledger_entries.order_id` → `orders`; `rider_settlements.rider_id` → `rider_profiles`; `delivery_batches.settlement_id` → `rider_settlements`; `orders.settlement_id` → `settlements`; `refunds.shop_settlement_id` → `settlements`; `settlements.shop_id` → `shop_profiles`

## 11. Notifications

```mermaid
erDiagram
    notifications {
        uuid id PK
        uuid user_id FK
        varchar kind
        varchar title
        text body
        uuid order_id FK
        boolean read
        timestamptz created_at
    }
```

Links to other modules: `notifications.order_id` → `orders`; `notifications.user_id` → `users`

## 12. Admin settings & audit

```mermaid
erDiagram
    platform_config {
        integer id PK
        numeric delivery_fee
        numeric cover_page_fee
        numeric commission_percent
        integer max_upload_mb
        integer slot_hold_minutes
        numeric rider_base_fee
        numeric rider_extra_shop_fee
        numeric rider_packet_bonus
        numeric rider_min_guarantee
        integer no_wait_minutes
        numeric gateway_fee_percent
        numeric late_refund_percent
    }
    audit_logs {
        uuid id PK
        uuid actor_id FK
        varchar action
        varchar entity
        varchar entity_id
        jsonb data
        timestamptz created_at
    }
```

Links to other modules: `audit_logs.actor_id` → `users`
