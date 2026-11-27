import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Bike, CreditCard, LogOut, MapPin, User } from "lucide-react";
import { z } from "zod";
import { signOut } from "@/app/layouts/shells";
import { useRegisterRider } from "@/modules/rider/api";
import { RiderSteps, RiderSplit } from "@/modules/rider/components/RiderSplit";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Spinner } from "@/shared/components/ui/states";
import { toast } from "@/shared/components/ui/toast";

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name"),
  base_area: z.string().trim().min(2, "Enter your base area"),
  vehicle_number: z.string().trim().regex(/^[A-Za-z]{2}[ -]?\d{1,2}[ -]?[A-Za-z]{0,3}[ -]?\d{1,4}$/, "Enter a valid registration number, e.g. TN09AB1234"),
  upi_id: z.string().trim().regex(/^[\w.-]{2,}@[A-Za-z]{2,}$/, "Enter a valid UPI ID, e.g. name@bank"),
});
type Form = z.infer<typeof schema>;

export function RiderOnboardingPage() {
  const reg = useRegisterRider();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", base_area: "", vehicle_number: "", upi_id: "" },
  });
  const field = (id: keyof Form, label: string, icon: typeof User, extra?: React.ComponentProps<typeof Input>) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} icon={icon} aria-invalid={!!errors[id]} {...extra} {...register(id)} />
      {errors[id] && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors[id]?.message}</p>}
    </div>
  );
  return (
    <RiderSplit
      headline="Become an UpLOAD delivery partner"
      sub="Pick up packed print orders from nearby shops and drop them at the college security cabin. Paid per run, straight to your UPI."
    >
      <RiderSteps current={0} />
      <div className="mb-6 mt-6">
        <h2 className="font-display text-2xl font-extrabold text-navy">About you</h2>
        <p className="mt-1 text-sm text-muted">Tell us about you and your two-wheeler. Next you'll upload your documents.</p>
      </div>
      <form
        className="space-y-4"
        noValidate
        onSubmit={handleSubmit((v) => reg.mutate(v, { onSuccess: () => toast.success("Details saved", { description: "Now upload your documents." }) }))}
      >
        {field("full_name", "Full name", User, { autoComplete: "name" })}
        {field("base_area", "Base area", MapPin, { placeholder: "e.g. Guindy" })}
        {field("vehicle_number", "Two-wheeler registration number", Bike, { autoCapitalize: "characters", placeholder: "TN09AB1234" })}
        {field("upi_id", "UPI ID for payouts", CreditCard, { placeholder: "name@bank", autoCapitalize: "none" })}
        {reg.error && <p role="alert" className="text-sm font-medium text-danger">{reg.error.message}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={reg.isPending}>
          {reg.isPending ? <Spinner className="text-white" /> : <>Continue <ArrowRight className="size-5" aria-hidden /></>}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={signOut}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </form>
    </RiderSplit>
  );
}
