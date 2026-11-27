import { useAdminGet } from "@/modules/admin/api";
import type { AdminMe } from "@/modules/admin/api/types";
import { ChangePasswordButton } from "@/shared/components/auth/ChangePassword";
import { Avatar } from "@/shared/components/ui/badge";

/** Signed-in admin for the sidebar footer (white on midnight); renders nothing until loaded. */
export function AdminAccount() {
  const me = useAdminGet<AdminMe>("/me");
  if (!me.data) return null;
  const name = me.data.full_name || me.data.mobile;
  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl bg-white/8 px-3 py-2.5" title={me.data.email ?? undefined}>
        <Avatar name={me.data.full_name ?? "Admin"} className="size-9 ring-white/20" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="truncate text-xs text-white/60">{me.data.email ?? "Administrator"}</p>
        </div>
      </div>
      <ChangePasswordButton variant="ghost" className="mt-1 h-10 w-full justify-start rounded-2xl px-3.5 text-white/65 hover:bg-white/8 hover:text-white" />
    </div>
  );
}
