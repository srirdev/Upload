# UpLOAD project completion checklist

Statuses: **COMPLETE** = implemented and covered by passing automated tests · **PARTIAL** = implemented, something
still missing (stated) · **NOT STARTED** · **BLOCKED** = needs an external credential, account or an action on the
machine. Updated as work lands; the evidence column names the tests.

_Last audit: 2026-11-26._ Backend: 180 pytest tests passing (SQLite + in-memory fakes). Frontend: 94 Vitest tests
passing, TypeScript clean, production build passing.

## 0. Environment (this machine)

| Item | Status | Notes |
|---|---|---|
| PostgreSQL 19 service `postgresql-x64-19`, db `upload_db` | **BLOCKED** | Service is **stopped** and nothing listens on 5432; starting it needs an Administrator shell (`net start postgresql-x64-19`). Live-database verification (connect, migrate to `0009`, insert/read a dev record, restart, re-read) runs once it is up. |
| Alembic migrations `0001`–`0010` | PARTIAL | Migrations render valid PostgreSQL SQL offline (`alembic upgrade --sql`); not yet applied to `upload_db` (blocked above). |
| API server | PARTIAL | Running process predates the Print Preview Studio and auto-reload did not pick up changes: restart it after migrating. |
| Redis + ARQ worker | **BLOCKED** | No Redis on 6379 and no Docker. Jobs run on demand: `python -m app.workers.run <job|all>`. arq itself is POSIX-oriented (WSL/Docker on Windows). |
| Object storage | PARTIAL | `STORAGE_BACKEND=local` (dev only, private dir served through the API). S3/MinIO/R2 code path exists; needs MinIO running or R2 credentials. |
| Razorpay | **BLOCKED** | No `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`: checkout returns 503 by design (no fake success). Signature + webhook verification are tested with test secrets. |
| Email (SMTP) | **BLOCKED** | No SMTP settings: password-reset emails go to the dev outbox (labelled DEV MOCK) in development, 503 elsewhere. |

## 1. Architecture

| Item | Status | Evidence / notes |
|---|---|---|
| One FastAPI backend + one PostgreSQL schema for all four websites | COMPLETE | `backend/app/main.py`; 121 endpoints under `/api/v1` (`docs/api/API_OVERVIEW.md`) |
| One React app, four role portals (student, shop, rider, admin), code-split per portal | COMPLETE | `frontend/src/app/router` (`router.test.tsx`) |
| Mobile-ready API (no web-only coupling) | COMPLETE | Token auth, JSON, WebSocket events; no cookies or server-rendered pages |
| WebSocket live updates (orders, batches, notifications) | COMPLETE | `tests/test_realtime.py`, `shared/api/realtime.test.tsx` |

## 2. Authentication (no OTP login)

| Item | Status | Evidence / notes |
|---|---|---|
| OTP login removed (routes, table, SMS mock, screens) | COMPLETE | migration `0008`; `test_otp_and_dev_login_endpoints_are_gone` |
| Login with phone **or** email + password (explicit Phone / Email switch) | COMPLETE | `test_password_is_hashed_and_email_login_works`, `RoleLoginPage.test.tsx` |
| Registration: full name, phone, email (required), password + confirm, role | COMPLETE | `test_invalid_registration_rejected`, `RoleLoginPage.test.tsx` sign-up |
| Password hashing Argon2id (legacy scrypt upgraded on sign-in) | COMPLETE | `test_password_is_hashed_and_email_login_works`, `test_legacy_scrypt_hash_still_works_and_is_upgraded` |
| Access + rotating refresh tokens, logout revocation | COMPLETE | `test_refresh_rotates_and_logout_revokes` |
| Per-account lockout (5 wrong passwords → 15 min) | COMPLETE | `test_lockout_after_repeated_wrong_passwords` |
| Per-IP login throttling, `login_audit_logs` (every attempt, unknown accounts too) | COMPLETE | `test_login_audit_log_and_ip_throttling` |
| Forgot password: emailed single-use 30-min link, `password_reset_tokens` (hash only), rate limited, no account enumeration, sessions revoked | COMPLETE (code) / BLOCKED (real email needs SMTP_*) | `test_forgot_password_*`, `test_expired_reset_link_is_refused`, `test_reset_email_is_sent_over_smtp_when_configured`, `ResetPasswordPage` tests |
| Change password (all 4 portals) + revoke other sessions | COMPLETE | `test_change_password_signs_out_other_devices`, `ChangePasswordButton` test |
| Role-based access on every endpoint | COMPLETE | `test_every_admin_endpoint_rejects_other_roles`, `test_roles_are_isolated`, ownership 404 tests |
| Admin only via bootstrap CLI (asks for password) | COMPLETE | `test_admin_bootstrap_reads_env_and_creates_profile` |
| `user_roles` join table | Design decision | One account = one role (`users.role` → `roles`). A person with two roles uses two accounts; avoids cross-role data leaks. |
| Shop→rider 4-digit handover OTP kept (custody, not login) | COMPLETE | `test_pickup_otp_rules` |

## 3. Student website

| Item | Status | Evidence / notes |
|---|---|---|
| Profile + academic info (college, department, year, register no.) | COMPLETE | `test_profile_required_and_one_time`, `StudentPortal.test.tsx` |
| Multi-file upload PDF/DOCX/PPTX/JPG/PNG, validation, real upload progress | COMPLETE | `test_orders.py` upload tests, `StudentPortal.test.tsx` (progress) |
| Page count (PDF auto; DOCX/PPTX via background conversion; manual fallback) | COMPLETE | conversion tests in `test_orders.py`; LibreOffice required for conversion |
| Print Preview Studio: real pages (PDF.js), page flip, zoom, thumbnails, scroll, A4/A3, orientation, GSM, B/W–colour, duplex, copies, stack | COMPLETE | `Studio.test.tsx` (16 tests), `test_studio.py` |
| Page-specific print rules | COMPLETE | `test_pricing.py`, Studio rule editor |
| Binding none/spiral/calico/soft/hard with 3D preview | COMPLETE | `Studio.test.tsx` (each binding) |
| Cover designer (3 templates, 6 colours, profile auto-fill) = printed cover PDF | COMPLETE | `test_shop_sees_exact_specs_and_cover_pdf_matches` (A4/A3 × 3 templates) |
| Live price (unsaved settings, server-priced, nothing written) | COMPLETE | `test_quote_preview_prices_unsaved_settings_without_saving` |
| Shop price comparison, slot selection, security cabin, coupons, itemised bill | COMPLETE | `test_orders.py`, `ComparePrices.test.tsx` |
| Razorpay payment | BLOCKED (keys) | Code, payment-signature and webhook verification COMPLETE (`test_orders.py` payment tests, `test_integration.py`) |
| Order history, live tracking, shelf photo, collection confirmation | COMPLETE | `test_delivery.py`, `test_integration.py` |
| Help Corner: complaints with photos, status, refund tracking | COMPLETE | `HelpPage.test.tsx`, complaint tests in `test_admin.py` |
| Notifications, referral code | COMPLETE | notification assertions in `test_delivery.py`, `test_jobs.py`; `StudentPortal.test.tsx` |

## 4. Printing shop website

| Item | Status | Evidence / notes |
|---|---|---|
| Registration, location, UPI, services, own rate card, admin approval gate | COMPLETE | `test_shops.py`, `ShopServices.test.tsx`, `ShopPricesPage.test.tsx` |
| Open/closed, dashboard counters, new-order alerts | COMPLETE | shop portal tests (16) |
| New / Pending / Finished tabs, accept/reject with reason | COMPLETE | `test_reject_reassigns_to_another_shop_and_never_back` |
| Secure document access, cover PDF (student's design), packet label | COMPLETE | `test_pdfs_for_cover_and_label`, `test_studio.py` |
| Printing → packing → 4-digit handover OTP; direct delivery | COMPLETE | `test_shops.py`, `test_direct_shop_delivery` |
| Weekly settlements, deductions, UTR reference | COMPLETE | `test_shop_and_rider_settlements_never_pay_twice` |
| Separate "binding completed" step | PARTIAL | Binding is part of the packing step today |

## 5. Delivery partner website

| Item | Status | Evidence / notes |
|---|---|---|
| Registration, DL/RC upload, UPI, KYC approval gate | COMPLETE | `test_rider_registration_kyc_and_approval` |
| Online/offline, batch offers (payout, shops, packets, distance), accept/decline | COMPLETE | `test_decline_goes_to_next_rider_and_backup_is_last_resort`, `ActiveRunPage.test.tsx` |
| Route map, multi-stop navigation links, packet checklist, handover OTP | COMPLETE | `test_pickup_otp_rules` |
| 4-minute no-wait rule, skip + roll to next slot | COMPLETE | `test_four_minute_no_wait_rule_skips_and_rolls_over` |
| Shelf photo (camera), completion only after storage | COMPLETE | `test_full_delivery_with_photo_payout_history_and_collect` |
| Earnings (base, extra shop, per packet, minimum), payouts, history | COMPLETE | `test_multi_shop_run_pays_extra_shop_fee_and_bonus`, `EarningsHistory.test.tsx` |

## 6. Admin operations centre

| Item | Status | Evidence / notes |
|---|---|---|
| Live ops (real metrics), delivery map, custody board | PARTIAL | Backend COMPLETE (`test_custody_board_and_attention_flags`); redesigned UI lacks page-level tests |
| Orders search/detail, reassignment, backup rider | PARTIAL | Backend COMPLETE (`test_order_search_and_detail`, reassignment tests); UI tests pending |
| Complaints, refunds (approve/reject/partial), shop deductions | PARTIAL | Backend COMPLETE; UI test only for complaints tab |
| Shop & rider management, KYC docs, performance, college assignment | PARTIAL | Backend COMPLETE; UI tests pending |
| Colleges, slots, cutoffs, capacity | PARTIAL | Backend COMPLETE (`test_colleges_and_slots_management`); UI tests pending |
| Finance & ledger, settlements, CSV export, audit history, coupons, config | PARTIAL | Backend COMPLETE (ledger reconciliation tests); UI tests pending |

## 7. Business rules & statuses

| Item | Status | Evidence / notes |
|---|---|---|
| End-to-end journey upload → … → collection (API level) | COMPLETE | `test_integration.py` |
| End-to-end in a real browser across 4 portals (Playwright) | NOT STARTED | |
| Prepaid only, ledger keeps shop/rider/gateway/platform separate | COMPLETE | `test_ledger_reconciles_across_the_whole_lifecycle` |
| Manual settlements (no claim of Razorpay Route splits) | COMPLETE | Route needs account eligibility (BLOCKED) |
| Independent order / production / delivery / payment / refund statuses | PARTIAL | Single validated order state machine + separate payment and refund statuses with actor/time history; production/delivery views not exposed separately |

## 8. Quality

| Item | Status | Evidence / notes |
|---|---|---|
| Backend pytest | COMPLETE | 180 passing |
| Frontend unit/component tests | COMPLETE | 94 passing |
| TypeScript | COMPLETE | `npm run typecheck` clean |
| ESLint | NOT STARTED | No config yet |
| Production build | COMPLETE | `vite build` passes |
| Playwright E2E | NOT STARTED | |

## Table mapping (directive name → existing table)

Existing tables already cover most of the directive's list under different names; they are not renamed (renaming
live tables risks data and gains nothing).

| Directive | Existing | | Directive | Existing |
|---|---|---|---|---|
| user_sessions | refresh_tokens | | order_status_history | order_events |
| college_delivery_slots | college_slots | | order_quotes | order_quotations |
| shop_college_assignments | shop_colleges | | page_print_rules | print_rules |
| shop_rate_card_items | shop_rate_cards + shop_binding_prices | | order_bindings, order_print_options | columns on orders / order_documents |
| delivery_batch_orders | batch_orders | | delivery_pickups | batch_shop_arrivals + batch_orders |
| shelf_photo_proofs | shelf_photos | | delivery_otp_verifications | handover_otps |
| financial_ledger | ledger_entries | | payment_webhook_events | webhook_events |
| shop_settlements | settlements | | commission_rules, system_settings | platform_config |
| complaint_resolutions | refunds + complaints.resolved_* | | file_access_logs | audit_logs (document access) — PARTIAL |
