import { AuditPanel } from "@/modules/admin/components/CouponsAudit";
import { PageHeader } from "@/shared/components/ui/card";

export function AuditPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Accountability" title="Audit history" subtitle="Who approved, rejected, paid or changed what, and when." />
      <AuditPanel />
    </div>
  );
}
