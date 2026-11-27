import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, BookOpen, GraduationCap, Hash, User } from "lucide-react";
import { z } from "zod";
import { useColleges, useCreateProfile } from "@/modules/student/api";
import { UploadHeroArt } from "@/shared/components/illustrations";
import { Logo } from "@/shared/components/Logo";
import { Button } from "@/shared/components/ui/button";
import { Select } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { FadeIn } from "@/shared/components/ui/motion";
import { ErrorState, PageLoader, Spinner } from "@/shared/components/ui/states";

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name"),
  college_id: z.string().min(1, "Choose your college"),
  department: z.string().trim().min(2, "Enter your department"),
  year: z.coerce.number().int().min(1).max(6),
  register_number: z.string().trim().min(3, "Enter your register number"),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

/** One-time academic setup; the data feeds cover pages and packet labels. */
export function OnboardingPage() {
  const colleges = useColleges();
  const create = useCreateProfile();
  const { register, handleSubmit, formState: { errors } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", college_id: "", department: "", year: 1, register_number: "" },
  });

  if (colleges.isLoading) return <PageLoader />;
  if (colleges.isError) return <ErrorState message={colleges.error.message} onRetry={() => colleges.refetch()} />;

  return (
    <div className="min-h-dvh bg-canvas">
      <section className="relative overflow-hidden bg-brand px-6 pb-24 pt-8 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative mx-auto flex max-w-xl items-end justify-between gap-4">
          <div>
            <Logo inverted />
            <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight">Set up your profile</h1>
            <p className="mt-2 max-w-sm text-sm text-white/85">One time only. We print this on your cover pages and packet labels so your prints find you.</p>
          </div>
          <UploadHeroArt className="hidden h-32 shrink-0 animate-float sm:block" />
        </div>
      </section>

      <FadeIn className="relative mx-auto -mt-14 max-w-xl px-4 pb-10">
        <form
          className="space-y-4 rounded-4xl bg-background p-6 shadow-lift ring-1 ring-border/60 sm:p-8"
          onSubmit={handleSubmit((v) => create.mutate(v))}
          noValidate
        >
          <Field id="full_name" label="Full name" error={errors.full_name?.message}>
            <Input id="full_name" icon={User} autoComplete="name" aria-invalid={!!errors.full_name} {...register("full_name")} />
          </Field>
          <Field id="college_id" label="College" error={errors.college_id?.message}>
            <Select id="college_id" aria-invalid={!!errors.college_id} {...register("college_id")}>
              <option value="">Select your college</option>
              {colleges.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? `, ${c.city}` : ""}</option>)}
            </Select>
          </Field>
          <Field id="department" label="Department" error={errors.department?.message}>
            <Input id="department" icon={BookOpen} placeholder="e.g. Computer Science" aria-invalid={!!errors.department} {...register("department")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="year" label="Year" error={errors.year?.message}>
              <Select id="year" {...register("year")}>
                {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </Select>
            </Field>
            <Field id="register_number" label="Register number" error={errors.register_number?.message}>
              <Input id="register_number" icon={Hash} aria-invalid={!!errors.register_number} {...register("register_number")} />
            </Field>
          </div>
          {create.error && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-medium text-danger">{create.error.message}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={create.isPending}>
            {create.isPending ? <Spinner className="text-white" /> : <>Continue <ArrowRight className="size-5" aria-hidden /></>}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <GraduationCap className="size-3.5" aria-hidden /> Your college decides where your prints are delivered.
          </p>
        </form>
      </FadeIn>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
