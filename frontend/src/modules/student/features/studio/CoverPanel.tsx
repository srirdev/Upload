import { Check, GraduationCap, Hash, IdCard, School, User } from "lucide-react";
import { Link } from "react-router-dom";
import type { CoverColor, Profile } from "@/modules/student/api/types";
import { COVER_COLORS, COVER_TEMPLATES, coverHex, type CoverDraft } from "@/modules/student/features/studio/config";
import { CoverArt, type CoverText } from "@/modules/student/features/studio/CoverArt";
import { Switch } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/utils/cn";
import { rupees } from "@/shared/utils/format";

/**
 * Cover page designer. Profile details fill in automatically (never re-typed); the student adds the subject,
 * an optional project title, a template and a colour. The shop prints exactly this design.
 */
export function CoverPanel({
  cover, onChange, profile, text, fee, showErrors,
}: {
  cover: CoverDraft;
  onChange: (p: Partial<CoverDraft>) => void;
  profile: Profile;
  text: CoverText;
  fee?: string | null;
  showErrors?: boolean;
}) {
  const missingName = showErrors && cover.enabled && !cover.subjectName.trim();
  const missingCode = showErrors && cover.enabled && !cover.subjectCode.trim();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-3xl bg-surface p-4">
        <div>
          <p className="font-bold text-navy">Add a cover page</p>
          <p className="text-xs text-muted">Printed on the same paper as your document{fee ? ` · ${rupees(fee)} per document` : ""}</p>
        </div>
        <Switch checked={cover.enabled} onChange={(v) => onChange({ enabled: v })} label="Add a cover page" />
      </div>

      {cover.enabled && (
        <>
          <div>
            <p className="mb-2 text-sm font-bold text-navy">Template</p>
            <div role="radiogroup" aria-label="Cover template" className="grid grid-cols-3 gap-2">
              {COVER_TEMPLATES.map((t) => {
                const on = t.value === cover.template;
                return (
                  <button key={t.value} type="button" role="radio" aria-checked={on} onClick={() => onChange({ template: t.value })}
                    className={cn("rounded-2xl p-1.5 text-left ring-1 transition-all", on ? "bg-primary-soft ring-2 ring-primary" : "bg-background ring-border hover:ring-primary/40")}>
                    <div className="overflow-hidden rounded-xl shadow-soft ring-1 ring-black/5">
                      <CoverArt text={text} template={t.value} color={cover.color} footer={false} />
                    </div>
                    <span className="mt-1.5 block px-1 text-xs font-bold text-navy">{t.label}</span>
                    <span className="block px-1 pb-1 text-[10px] leading-tight text-muted">{t.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-navy">Colour</p>
            <div role="radiogroup" aria-label="Cover colour" className="flex flex-wrap gap-2.5">
              {(Object.keys(COVER_COLORS) as CoverColor[]).map((c) => {
                const on = c === cover.color;
                return (
                  <button key={c} type="button" role="radio" aria-checked={on} aria-label={COVER_COLORS[c].label} title={COVER_COLORS[c].label}
                    onClick={() => onChange({ color: c })}
                    className={cn("flex size-10 items-center justify-center rounded-full ring-offset-2 transition-transform hover:scale-105", on && "ring-2 ring-primary")}
                    style={{ background: coverHex(c) }}>
                    {on && <Check className="size-4 text-white" strokeWidth={3} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="cover-subject">Subject name</Label>
              <Input id="cover-subject" value={cover.subjectName} maxLength={120} placeholder="e.g. Data Structures"
                aria-invalid={missingName || undefined} onChange={(e) => onChange({ subjectName: e.target.value })} />
              {missingName && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">Enter the subject name</p>}
            </div>
            <div>
              <Label htmlFor="cover-code">Subject code</Label>
              <Input id="cover-code" value={cover.subjectCode} maxLength={40} placeholder="e.g. CS3301"
                aria-invalid={missingCode || undefined} onChange={(e) => onChange({ subjectCode: e.target.value })} />
              {missingCode && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">Enter the subject code</p>}
            </div>
            <div>
              <Label htmlFor="cover-title">Project or assignment title <span className="font-normal text-muted">(optional)</span></Label>
              <Input id="cover-title" value={cover.title} maxLength={160} placeholder="e.g. Implementation of Hash Tables"
                onChange={(e) => onChange({ title: e.target.value })} />
              <p className="mt-1.5 text-xs text-muted">With a title, it becomes the heading and the subject moves underneath.</p>
            </div>
          </div>

          <div className="rounded-3xl bg-background p-4 ring-1 ring-border">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-navy">From your profile</p>
              <Link to="/student/profile" className="text-xs font-semibold text-primary hover:underline">Edit profile</Link>
            </div>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <Fact icon={User} label="Name" value={profile.full_name} />
              <Fact icon={IdCard} label="Register no." value={profile.register_number} />
              <Fact icon={School} label="College" value={profile.college_name} />
              <Fact icon={GraduationCap} label="Department" value={profile.department} />
              <Fact icon={Hash} label="Year" value={`Year ${profile.year}`} />
            </dl>
          </div>
        </>
      )}
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="truncate text-ink-2">{value}</dd>
    </div>
  );
}
