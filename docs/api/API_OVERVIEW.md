# UpLOAD API Overview

Base URL `/api/v1`. JSON over HTTPS; `Authorization: Bearer <access token>` (30 min) obtained from `/auth/login` (or `/auth/register`), renewed with `/auth/refresh` (rotating refresh token). Interactive docs: `/docs` (Swagger) and `/openapi.json` when the API is running. Errors are `{"detail": "…"}` with 401 (not signed in), 403 (wrong role), 404 (not found or not yours), 409 (state conflict), 413/415/422 (validation).

Generated from the code by `backend/scripts/gen_api_docs.py`; regenerate after changing routes.

## Access by area

| Prefix | Who |
|---|---|
| `/api/v1/auth` | Public (register, login with mobile/email + password, refresh) · `/me` any signed-in user |
| `/api/v1/students` | Student |
| `/api/v1/orders` | Student (own orders only; others get 404) |
| `/api/v1/payments` | Student · `/webhook` = Razorpay (HMAC-verified) |
| `/api/v1/colleges` | Any signed-in user (college list for onboarding, open slots) |
| `/api/v1/notifications` | Any signed-in user (own notifications) |
| `/api/v1/shops` | Shop (own shop and assigned orders only) |
| `/api/v1/riders` | Delivery partner (own profile, runs, earnings) |
| `/api/v1/delivery` | Delivery partner on the batch · shop for direct delivery |
| `/api/v1/admin` | Admin |
| `/api/v1/ws` | WebSocket, any signed-in user (`?token=<access token>`) |
| `/api/v1/health` | Public |

## Realtime events

`/api/v1/ws` sends `{"type": "ready"}` then: `order.status` (order_id, status), `order.assigned` (order_id, shop_id), `order.custody` (order_id, batch_id, event), `batch.updated` (batch_id, status), `notification` (kind, order_id). Students receive their own orders, shops orders assigned to them, riders their batches, admins everything. Events are published only after the database commit.

## `/api/v1/admin`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/admin/audit` | Audit Log |
| GET | `/api/v1/admin/batches` | List Batches |
| POST | `/api/v1/admin/batches/{batch_id}/assign-rider` | Assign (or replace with) a specific rider, e.g. a backup rider. Only before the trip departs. |
| GET | `/api/v1/admin/colleges` | List Colleges |
| POST | `/api/v1/admin/colleges` | Create College |
| PUT | `/api/v1/admin/colleges/{college_id}` | Update College |
| POST | `/api/v1/admin/colleges/{college_id}/slots` | Create Slot |
| GET | `/api/v1/admin/complaints` | List Complaints |
| GET | `/api/v1/admin/complaints/{complaint_id}` | Everything needed to compare the student's evidence with the rider's shelf photo. |
| PATCH | `/api/v1/admin/complaints/{complaint_id}` | Update Complaint |
| POST | `/api/v1/admin/complaints/{complaint_id}/refund` | Approve a refund for a validated complaint (full or partial). |
| GET | `/api/v1/admin/config` | Get Config |
| PUT | `/api/v1/admin/config` | Put Config |
| PUT | `/api/v1/admin/config/binding` | Put Binding |
| GET | `/api/v1/admin/config/rates` | Get Rates |
| PUT | `/api/v1/admin/config/rates` | Upsert price-per-page rows. Existing orders keep their locked quotations. |
| GET | `/api/v1/admin/coupons` | List Coupons |
| PUT | `/api/v1/admin/coupons` | Upsert Coupon |
| GET | `/api/v1/admin/finance/ledger` | Ledger |
| GET | `/api/v1/admin/finance/summary` | Finance Summary |
| GET | `/api/v1/admin/me` | Me |
| GET | `/api/v1/admin/ops/custody` | Every in-flight order with who currently holds it. |
| GET | `/api/v1/admin/ops/summary` | Summary |
| GET | `/api/v1/admin/orders` | Search Orders |
| GET | `/api/v1/admin/orders/{order_id}` | Order Detail |
| POST | `/api/v1/admin/orders/{order_id}/assign-shop` | Assign or re-assign an order that hasn't been accepted yet. |
| GET | `/api/v1/admin/refunds` | List Refunds |
| POST | `/api/v1/admin/refunds/{refund_id}/approve` | Approve Refund |
| POST | `/api/v1/admin/refunds/{refund_id}/record` | Record the payment provider's reference once the money has actually been sent back. |
| POST | `/api/v1/admin/refunds/{refund_id}/reject` | Reject Refund |
| GET | `/api/v1/admin/riders` | List Riders |
| POST | `/api/v1/admin/riders/{rider_id}/approve` | Approve Rider |
| PUT | `/api/v1/admin/riders/{rider_id}/colleges` | Set Rider Colleges |
| GET | `/api/v1/admin/riders/{rider_id}/documents` | Rider Documents |
| GET | `/api/v1/admin/riders/{rider_id}/performance` | Rider Performance |
| POST | `/api/v1/admin/riders/{rider_id}/reject` | Reject Rider |
| GET | `/api/v1/admin/settlements/riders` | List Rider Settlements |
| GET | `/api/v1/admin/settlements/riders/export.csv` | Export Rider Payouts |
| POST | `/api/v1/admin/settlements/riders/generate` | Generate Rider Settlements |
| POST | `/api/v1/admin/settlements/riders/{settlement_id}/pay` | Pay Rider Settlement |
| GET | `/api/v1/admin/settlements/shops` | List Shop Settlements |
| GET | `/api/v1/admin/settlements/shops/export.csv` | Export Shop Payouts |
| POST | `/api/v1/admin/settlements/shops/generate` | Generate Shop Settlements |
| POST | `/api/v1/admin/settlements/shops/{settlement_id}/pay` | Pay Shop Settlement |
| GET | `/api/v1/admin/shops` | List Shops |
| POST | `/api/v1/admin/shops/{shop_id}/approve` | Approve |
| PUT | `/api/v1/admin/shops/{shop_id}/colleges` | Set Colleges |
| PUT | `/api/v1/admin/shops/{shop_id}/location` | Set Location |
| GET | `/api/v1/admin/shops/{shop_id}/performance` | Shop Performance |
| POST | `/api/v1/admin/shops/{shop_id}/reject` | Reject |
| POST | `/api/v1/admin/shops/{shop_id}/suspend` | Suspend |
| PUT | `/api/v1/admin/slots/{slot_id}` | Slots are deactivated rather than deleted, because existing orders reference them. |

## `/api/v1/auth`

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Me |
| POST | `/api/v1/auth/password/change` | Signed-in password change; other devices are signed out and this one gets fresh tokens. |
| POST | `/api/v1/auth/password/forgot` | Emails a single-use reset link. Same answer whether or not the email is registered. |
| POST | `/api/v1/auth/password/reset` | Sets a new password from a reset link, then signs the account out everywhere. |
| POST | `/api/v1/auth/refresh` | Refresh |
| POST | `/api/v1/auth/register` | Register |

## `/api/v1/colleges`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/colleges` | List Colleges |
| GET | `/api/v1/colleges/{college_id}/slots` | College Slots |

## `/api/v1/delivery`

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/delivery/batches/{batch_id}/accept` | Accept |
| POST | `/api/v1/delivery/batches/{batch_id}/arrive` | Arrive |
| POST | `/api/v1/delivery/batches/{batch_id}/close-empty` | Close Empty |
| POST | `/api/v1/delivery/batches/{batch_id}/complete` | Complete |
| POST | `/api/v1/delivery/batches/{batch_id}/decline` | Decline |
| POST | `/api/v1/delivery/batches/{batch_id}/depart` | Depart |
| POST | `/api/v1/delivery/batches/{batch_id}/not-ready` | Not Ready |
| POST | `/api/v1/delivery/batches/{batch_id}/pickup` | Pickup |
| POST | `/api/v1/delivery/batches/{batch_id}/shelf-photo` | Shelf Photo |

## `/api/v1/health`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Health |
| GET | `/api/v1/health/db` | Health Db |

## `/api/v1/notifications`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/notifications` | List Notifications |
| POST | `/api/v1/notifications/read-all` | Read All |
| POST | `/api/v1/notifications/{notification_id}/read` | Read One |

## `/api/v1/orders`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/orders` | List Orders |
| POST | `/api/v1/orders` | Create Order |
| GET | `/api/v1/orders/{order_id}` | Get Order |
| PUT | `/api/v1/orders/{order_id}/binding` | Set Binding |
| POST | `/api/v1/orders/{order_id}/cancel` | Cancel Order |
| POST | `/api/v1/orders/{order_id}/checkout` | Checkout |
| POST | `/api/v1/orders/{order_id}/collect` | Collect Order |
| PUT | `/api/v1/orders/{order_id}/delivery` | Set Delivery |
| POST | `/api/v1/orders/{order_id}/documents` | Upload Document |
| DELETE | `/api/v1/orders/{order_id}/documents/{doc_id}` | Delete Document |
| PUT | `/api/v1/orders/{order_id}/documents/{doc_id}/config` | Configure Document |
| GET | `/api/v1/orders/{order_id}/documents/{doc_id}/file` | The document's bytes through the API (same origin), for the in-browser Print Preview Studio renderer. |
| GET | `/api/v1/orders/{order_id}/documents/{doc_id}/url` | Short-lived signed URL for the original, or (preview=true) the PDF converted from a DOCX/PPTX. |
| GET | `/api/v1/orders/{order_id}/quotation` | Get Quotation |
| POST | `/api/v1/orders/{order_id}/quotation/preview` | Prices unsaved studio settings so the total updates live. Read-only: the order is never changed here. |
| PUT | `/api/v1/orders/{order_id}/shop` | Choose Shop |
| GET | `/api/v1/orders/{order_id}/shop-options` | Compare prices: each eligible shop's quote on its own rate card, plus the standard price. |

## `/api/v1/payments`

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payments/verify` | Verify |
| POST | `/api/v1/payments/webhook` | Webhook |

## `/api/v1/riders`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/riders/me` | Me |
| POST | `/api/v1/riders/me` | Register |
| PUT | `/api/v1/riders/me/availability` | Availability |
| POST | `/api/v1/riders/me/documents/{kind}` | Upload Kyc |
| GET | `/api/v1/riders/me/earnings` | Earnings |
| GET | `/api/v1/riders/me/history` | History |
| GET | `/api/v1/riders/me/run` | Active Run |

## `/api/v1/shops`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/shops/me` | Me |
| POST | `/api/v1/shops/me` | Register |
| GET | `/api/v1/shops/me/accounting` | Accounting |
| GET | `/api/v1/shops/me/dashboard` | Dashboard |
| PUT | `/api/v1/shops/me/open` | Set Open |
| GET | `/api/v1/shops/me/orders` | List Orders |
| POST | `/api/v1/shops/me/orders/{order_id}/accept` | Accept |
| GET | `/api/v1/shops/me/orders/{order_id}/cover.pdf` | Cover |
| POST | `/api/v1/shops/me/orders/{order_id}/direct-delivery` | Deliver this packed order to the college cabin yourself. Finish with the shelf-photo + complete calls. |
| GET | `/api/v1/shops/me/orders/{order_id}/documents/{doc_id}/url` | Document Url |
| POST | `/api/v1/shops/me/orders/{order_id}/handover-otp` | Handover Otp |
| GET | `/api/v1/shops/me/orders/{order_id}/label.pdf` | Label |
| POST | `/api/v1/shops/me/orders/{order_id}/packing-done` | Packing Done |
| POST | `/api/v1/shops/me/orders/{order_id}/printing-done` | Printing Done |
| POST | `/api/v1/shops/me/orders/{order_id}/reject` | Reject |
| GET | `/api/v1/shops/me/rate-card` | The shop's own customer prices (students compare shops on these). |
| PUT | `/api/v1/shops/me/rate-card` | Set Rate Card |
| PUT | `/api/v1/shops/me/services` | Set Services |
| GET | `/api/v1/shops/services` | Catalogue of services a shop can offer. |

## `/api/v1/students`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/students/complaints` | List Complaints |
| POST | `/api/v1/students/complaints` | Create Complaint |
| GET | `/api/v1/students/me/profile` | Get Profile |
| PATCH | `/api/v1/students/me/profile` | Rename |
| POST | `/api/v1/students/me/profile` | One-time academic setup. Academic fields are locked afterwards (admin can correct them). |

## `/api/v1/ws`

| Method | Path | Purpose |
|---|---|---|
| WS | `/api/v1/ws?token=…` | Realtime events (ids only; refetch over REST) |
