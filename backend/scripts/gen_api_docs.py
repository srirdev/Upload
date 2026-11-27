"""Generates docs/api/API_OVERVIEW.md from the FastAPI OpenAPI schema. Run: python scripts/gen_api_docs.py"""
import pathlib
import sys
from collections import defaultdict

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from app.main import app  # noqa: E402

ACCESS = [
    ("/api/v1/auth", "Public (register, login with mobile/email + password, refresh) · `/me` any signed-in user"),
    ("/api/v1/students", "Student"),
    ("/api/v1/orders", "Student (own orders only; others get 404)"),
    ("/api/v1/payments", "Student · `/webhook` = Razorpay (HMAC-verified)"),
    ("/api/v1/colleges", "Any signed-in user (college list for onboarding, open slots)"),
    ("/api/v1/notifications", "Any signed-in user (own notifications)"),
    ("/api/v1/shops", "Shop (own shop and assigned orders only)"),
    ("/api/v1/riders", "Delivery partner (own profile, runs, earnings)"),
    ("/api/v1/delivery", "Delivery partner on the batch · shop for direct delivery"),
    ("/api/v1/admin", "Admin"),
    ("/api/v1/ws", "WebSocket, any signed-in user (`?token=<access token>`)"),
    ("/api/v1/health", "Public"),
]

spec = app.openapi()
groups: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
for path, ops in spec["paths"].items():
    prefix = "/".join(path.split("/")[:4])
    for method, op in ops.items():
        summary = (op.get("description") or op.get("summary") or "").strip().split("\n")[0]
        groups[prefix].append((method.upper(), path, summary))
groups["/api/v1/ws"].append(("WS", "/api/v1/ws?token=…", "Realtime events (ids only; refetch over REST)"))

md = ["# UpLOAD API Overview", "",
      "Base URL `/api/v1`. JSON over HTTPS; `Authorization: Bearer <access token>` (30 min) obtained from "
      "`/auth/login` (or `/auth/register`), renewed with `/auth/refresh` (rotating refresh token). Interactive docs: `/docs` (Swagger) "
      "and `/openapi.json` when the API is running. Errors are `{\"detail\": \"…\"}` with 401 (not signed in), "
      "403 (wrong role), 404 (not found or not yours), 409 (state conflict), 413/415/422 (validation).",
      "",
      "Generated from the code by `backend/scripts/gen_api_docs.py`; regenerate after changing routes.", "",
      "## Access by area", "", "| Prefix | Who |", "|---|---|", *[f"| `{p}` | {who} |" for p, who in ACCESS], "",
      "## Realtime events", "",
      "`/api/v1/ws` sends `{\"type\": \"ready\"}` then: `order.status` (order_id, status), `order.assigned` (order_id, shop_id), "
      "`order.custody` (order_id, batch_id, event), `batch.updated` (batch_id, status), `notification` (kind, order_id). "
      "Students receive their own orders, shops orders assigned to them, riders their batches, admins everything. "
      "Events are published only after the database commit.", ""]
for prefix in sorted(groups):
    md += [f"## `{prefix}`", "", "| Method | Path | Purpose |", "|---|---|---|"]
    for method, path, summary in sorted(groups[prefix], key=lambda r: (r[1], r[0])):
        md.append(f"| {method} | `{path}` | {summary.replace('|', '/')} |")
    md.append("")
out = BACKEND.parent / "docs" / "api" / "API_OVERVIEW.md"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join(md), encoding="utf-8")
print("written", sum(len(v) for v in groups.values()), "endpoints")
