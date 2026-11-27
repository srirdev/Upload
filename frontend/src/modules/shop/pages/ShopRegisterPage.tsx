import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, ExternalLink, Landmark, LocateFixed, MapPin, Store, User, Wallet, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { signOut } from "@/app/layouts/shells";
import { useRegisterShop, useServiceCatalogue } from "@/modules/shop/api";
import { hasPrint, NEEDS_PRINT, ROUTING_NOTE, ServicePicker } from "@/modules/shop/components/ShopServices";
import { PrinterArt } from "@/shared/components/illustrations";
import { Logo } from "@/shared/components/Logo";
import { coords, MapView } from "@/shared/components/map";
import { IconTile } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { FadeIn } from "@/shared/components/ui/motion";
import { Skeleton, Spinner } from "@/shared/components/ui/states";
import { toast } from "@/shared/components/ui/toast";

const schema = z
  .object({
    shop_name: z.string().trim().min(2, "Enter the shop name"),
    owner_name: z.string().trim().min(2, "Enter the owner's name"),
    area: z.string().trim().min(2, "Enter the area"),
    landmark: z.string().trim().optional(),
    latitude: z.coerce.number({ error: "Enter a latitude" }).min(-90, "Latitude is between -90 and 90").max(90, "Latitude is between -90 and 90"),
    longitude: z.coerce.number({ error: "Enter a longitude" }).min(-180, "Longitude is between -180 and 180").max(180, "Longitude is between -180 and 180"),
    upi_id: z.string().trim().optional(),
    bank_account_name: z.string().trim().optional(),
    bank_account_number: z.string().trim().optional(),
    bank_ifsc: z.string().trim().toUpperCase().optional(),
    accept_terms: z.literal(true, { error: "Please accept the terms to continue" }),
  })
  .superRefine((v, ctx) => {
    const bank = v.bank_account_name && v.bank_account_number && v.bank_ifsc;
    if (!v.upi_id && !bank)
      ctx.addIssue({ code: "custom", path: ["upi_id"], message: "Enter a UPI ID or your bank details" });
  });
type In = z.input<typeof schema>;
type Out = z.output<typeof schema>;

const blankToUndefined = (s?: string) => (s && s.length ? s : undefined);

export function ShopRegisterPage() {
  const reg = useRegisterShop();
  const catalogue = useServiceCatalogue();
  const [services, setServices] = useState<string[] | null>(null);
  const selected = services ?? catalogue.data?.map((s) => s.code) ?? []; // all checked by default
  const [bank, setBank] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<In, unknown, Out>({
    resolver: zodResolver(schema),
    defaultValues: { shop_name: "", owner_name: "", area: "", landmark: "", latitude: "", longitude: "", upi_id: "" },
  });
  const [lat, lng, name] = [watch("latitude"), watch("longitude"), watch("shop_name")];
  const point = coords(lat, lng);
  const validPoint = point && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 ? point : null;

  function locate() {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError("Location isn't available in this browser. Enter the coordinates manually.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setValue("latitude", p.coords.latitude.toFixed(6), { shouldValidate: true });
        setValue("longitude", p.coords.longitude.toFixed(6), { shouldValidate: true });
      },
      () => { setLocating(false); setGeoError("Couldn't get your location. Enter the coordinates manually."); },
    );
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-sunrise relative overflow-hidden px-4 pb-24 pt-6 text-white md:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/15 blur-3xl" />
        <div className="relative mx-auto flex max-w-5xl items-center justify-between">
          <Logo inverted />
          <Button variant="glass" size="sm" onClick={signOut}>Sign out</Button>
        </div>
        <div className="relative mx-auto mt-8 flex max-w-5xl items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">Partner registration</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight md:text-4xl">Register your shop</h1>
            <p className="mt-2 text-sm text-white/90 md:text-base">We review every shop before it can receive live orders. It takes a few minutes to fill in.</p>
          </div>
          <PrinterArt className="hidden h-32 w-auto shrink-0 animate-float md:block" />
        </div>
      </header>

      <main className="relative mx-auto -mt-16 max-w-5xl px-4 pb-16 md:px-8">
        <form
          className="space-y-5"
          noValidate
          onSubmit={handleSubmit((v) => {
            if (catalogue.data && !hasPrint(selected)) return;
            reg.mutate({
              shop_name: v.shop_name, owner_name: v.owner_name, area: v.area, landmark: blankToUndefined(v.landmark),
              latitude: v.latitude, longitude: v.longitude, accept_terms: true,
              upi_id: blankToUndefined(v.upi_id),
              bank_account_name: blankToUndefined(v.bank_account_name),
              bank_account_number: blankToUndefined(v.bank_account_number),
              bank_ifsc: blankToUndefined(v.bank_ifsc),
              services: catalogue.data ? selected : undefined, // omitted = all services
            }, { onSuccess: () => toast.success("Shop submitted for approval") });
          })}
        >
          <Section icon={Store} step={1} title="Shop details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="shop_name" label="Shop name" error={errors.shop_name?.message}><Input id="shop_name" icon={Building2} {...register("shop_name")} /></Field>
              <Field id="owner_name" label="Owner name" error={errors.owner_name?.message}><Input id="owner_name" icon={User} {...register("owner_name")} /></Field>
              <Field id="area" label="Area" error={errors.area?.message}><Input id="area" icon={MapPin} {...register("area")} /></Field>
              <Field id="landmark" label="Landmark (optional)"><Input id="landmark" icon={Landmark} {...register("landmark")} /></Field>
            </div>
          </Section>

          <Section icon={MapPin} step={2} title="Map location" subtitle="Delivery partners navigate here to collect packets.">
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <div className="space-y-4">
                <Button type="button" variant="soft" className="w-full" onClick={locate} disabled={locating}>
                  {locating ? <Spinner /> : <LocateFixed className="size-4" />} Use my current location
                </Button>
                {geoError && <p role="alert" className="text-sm font-medium text-danger">{geoError}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <Field id="latitude" label="Latitude" error={errors.latitude?.message}><Input id="latitude" inputMode="decimal" {...register("latitude")} /></Field>
                  <Field id="longitude" label="Longitude" error={errors.longitude?.message}><Input id="longitude" inputMode="decimal" {...register("longitude")} /></Field>
                </div>
                {validPoint && (
                  <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps?q=${validPoint.lat},${validPoint.lng}`}>
                    Check on Google Maps <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>
              <MapView
                className="h-64"
                points={validPoint ? [{ id: "shop", kind: "shop", label: name || "Your shop", ...validPoint }] : []}
                emptyHint="Use your current location or enter coordinates to see your pin."
              />
            </div>
          </Section>

          <Section icon={Store} step={3} title="Services" subtitle={`${ROUTING_NOTE} You can change these later.`}>
            {catalogue.isLoading ? <Skeleton className="h-40" /> : catalogue.isError ? (
              <p className="text-sm text-muted">Couldn't load the service list, so all services will be offered. You can change this later.</p>
            ) : (
              <ServicePicker catalogue={catalogue.data!} value={selected} onChange={setServices} />
            )}
            {catalogue.data && !hasPrint(selected) && <p role="alert" className="mt-3 text-sm font-medium text-danger">{NEEDS_PRINT}</p>}
          </Section>

          <Section icon={Wallet} step={4} title="Payouts" subtitle="Weekly settlements are paid here.">
            <div className="space-y-4">
              <Field id="upi_id" label="UPI ID" error={errors.upi_id?.message}><Input id="upi_id" placeholder="name@bank" {...register("upi_id")} /></Field>
              {bank ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field id="bank_account_name" label="Account holder"><Input id="bank_account_name" {...register("bank_account_name")} /></Field>
                  <Field id="bank_account_number" label="Account number"><Input id="bank_account_number" inputMode="numeric" {...register("bank_account_number")} /></Field>
                  <Field id="bank_ifsc" label="IFSC"><Input id="bank_ifsc" {...register("bank_ifsc")} /></Field>
                </div>
              ) : (
                <button type="button" onClick={() => setBank(true)} className="text-sm font-semibold text-primary hover:underline">Use bank account instead</button>
              )}
            </div>
          </Section>

          <FadeIn>
            <Card pad="lg" className="space-y-4">
              <label className="flex items-start gap-3 text-sm text-ink-2">
                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" {...register("accept_terms")} />
                <span>I accept the UpLOAD partner terms, including weekly settlements and refund deductions for validated defects.</span>
              </label>
              {errors.accept_terms && <p role="alert" className="text-sm font-medium text-danger">{errors.accept_terms.message}</p>}
              {reg.error && <p role="alert" className="text-sm font-medium text-danger">{reg.error.message}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={reg.isPending}>
                {reg.isPending ? <Spinner className="text-white" /> : "Submit for approval"}
              </Button>
            </Card>
          </FadeIn>
        </form>
      </main>
    </div>
  );
}

function Section({ icon, step, title, subtitle, children }: { icon: LucideIcon; step: number; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <FadeIn>
      <Card pad="lg">
        <fieldset>
          <legend className="sr-only">{title}</legend>
          <div className="mb-5 flex items-center gap-3">
            <IconTile icon={icon} tone={step % 2 ? "orange" : "violet"} />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Step {step}</p>
              <h2 className="font-display text-lg font-bold text-navy">{title}</h2>
              {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          {children}
        </fieldset>
      </Card>
    </FadeIn>
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
