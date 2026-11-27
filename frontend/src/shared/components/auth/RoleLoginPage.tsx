import { useState, type ComponentType, type SVGProps } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BadgeIndianRupee, Bike, Building2, CheckCircle2, Eye, EyeOff, FileUp, FlaskConical, Gauge, KeyRound, Lock, Mail,
  MailCheck, MapPin, Phone, Scale, ShieldCheck, Store, Tag, User as UserIcon, Wallet, type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { fetchDemoAccounts, forgotPassword, login, register } from "@/shared/api/auth";
import { useAuth } from "@/shared/api/authStore";
import { PrinterArt, ScooterArt, ShieldArt, UploadHeroArt } from "@/shared/components/illustrations";
import { PortalSwitcher } from "@/shared/components/auth/PortalSwitcher";
import { Logo } from "@/shared/components/Logo";
import { Button } from "@/shared/components/ui/button";
import { Modal } from "@/shared/components/ui/dialog";
import { Segmented } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Spinner } from "@/shared/components/ui/states";
import { ROLE_LABEL, type Role, type TokenPair } from "@/shared/types/auth";
import { cn } from "@/shared/utils/cn";

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Method = "phone" | "email";
const signInSchema = z
  .object({ method: z.enum(["phone", "email"]), identifier: z.string().trim(), password: z.string().min(1, "Enter your password") })
  .superRefine((v, ctx) => {
    const ok = v.method === "phone" ? MOBILE.test(v.identifier) : EMAIL.test(v.identifier);
    if (!ok) {
      ctx.addIssue({
        code: "custom",
        path: ["identifier"],
        message: v.method === "phone" ? "Enter your 10-digit mobile number" : "Enter a valid email address",
      });
    }
  });
const signUpSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name").max(120),
    mobile: z.string().regex(MOBILE, "Enter a valid 10-digit mobile number"),
    email: z.string().trim().regex(EMAIL, "Enter a valid email address"),
    password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** Per-portal hero copy: describes what the product does (no invented numbers). */
const HERO: Record<Role, { bg: string; headline: string; sub: string; art: ComponentType<SVGProps<SVGSVGElement>>; points: { icon: LucideIcon; text: string }[] }> = {
  student: {
    bg: "bg-brand",
    headline: "Print anything. Pick it up at your campus gate.",
    sub: "Upload, choose how it's printed and bound, pay, and collect it from your security cabin.",
    art: UploadHeroArt,
    points: [
      { icon: FileUp, text: "PDF, Word and PowerPoint uploads" },
      { icon: Scale, text: "Compare prices across nearby shops" },
      { icon: MapPin, text: "Delivered in the slot you pick" },
    ],
  },
  rider: {
    bg: "bg-midnight",
    headline: "Ride. Deliver. Get paid for every run.",
    sub: "Pick up packed orders from nearby print shops and drop them at the college security cabin.",
    art: ScooterArt,
    points: [
      { icon: BadgeIndianRupee, text: "Payout shown before you accept" },
      { icon: Bike, text: "Batched pickups along one route" },
      { icon: Wallet, text: "Settlements straight to your UPI" },
    ],
  },
  shop: {
    bg: "bg-sunrise",
    headline: "Print-ready orders, straight to your counter.",
    sub: "Accept orders, print and bind, and hand them to a rider without the walk-in rush.",
    art: PrinterArt,
    points: [
      { icon: Store, text: "Orders arrive with every print setting" },
      { icon: Tag, text: "Set your own rate card" },
      { icon: Wallet, text: "Track earnings and settlements" },
    ],
  },
  admin: {
    bg: "bg-midnight",
    headline: "The UpLOAD operations centre.",
    sub: "Watch orders and deliveries live, approve partners and keep the money right.",
    art: ShieldArt,
    points: [
      { icon: Gauge, text: "Live orders, batches and riders" },
      { icon: ShieldCheck, text: "Approvals, complaints and refunds" },
      { icon: Building2, text: "Finance, settlements and audit" },
    ],
  },
};

export function RoleLoginPage({ role }: { role: Role }) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.sessions[role]?.user ?? null); // this portal's own sign-in
  const setSession = useAuth((s) => s.setSession);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPw, setShowPw] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const canSignUp = role !== "admin"; // admin accounts are created by operators (auth CLI)
  const hero = HERO[role];

  const signInForm = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { method: "phone" as Method, identifier: "", password: "" },
  });
  const signUpForm = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { full_name: "", mobile: "", email: "", password: "", confirm: "" },
  });
  const method = signInForm.watch("method");

  const onSignedIn = (tokens: TokenPair) => {
    setSession(tokens);
    navigate(`/${role}`, { replace: true });
  };
  const signIn = useMutation({
    mutationFn: (v: z.infer<typeof signInSchema>) => login(v.identifier, v.password, role),
    onSuccess: onSignedIn,
  });
  // DEVELOPMENT ONLY: the API returns the demo accounts only when APP_ENV=development and DEMO_PASSWORD is set.
  const demos = useQuery({ queryKey: ["auth", "demo-accounts"], queryFn: fetchDemoAccounts, retry: false, staleTime: Infinity });
  const demo = demos.data?.find((d) => d.role === role);
  const signUp = useMutation({
    mutationFn: (v: z.infer<typeof signUpSchema>) =>
      register({ full_name: v.full_name, mobile: v.mobile, email: v.email, password: v.password, role: role as Exclude<Role, "admin"> }),
    onSuccess: onSignedIn,
  });

  if (user?.role === role) return <Navigate to={`/${role}`} replace />;

  const switchTo = (next: "signin" | "signup") => {
    setMode(next);
    setShowPw(false);
    signIn.reset();
    signUp.reset();
  };

  const pwToggle = (
    <button
      type="button"
      onClick={() => setShowPw((s) => !s)}
      aria-label={showPw ? "Hide password" : "Show password"}
      className="flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-navy"
    >
      {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Hero: full panel on desktop, compact header on phones */}
      <section className={cn(hero.bg, "relative overflow-hidden px-6 pb-24 pt-8 text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12")}>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-sun/20 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <Logo inverted />
          <PortalSwitcher dark />
        </div>
        <div className="relative mt-8 lg:mt-0">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ring-1 ring-white/25">
            {ROLE_LABEL[role]}
          </p>
          <h1 className="max-w-xl font-display text-3xl font-extrabold leading-[1.05] sm:text-4xl lg:text-[3.25rem]">{hero.headline}</h1>
          <p className="mt-4 hidden max-w-md text-base text-white/85 lg:block">{hero.sub}</p>
          <ul className="mt-8 hidden space-y-3 lg:block">
            {hero.points.map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.1 }}
                className="flex items-center gap-3 text-sm font-semibold"
              >
                <span className="glass-dark flex size-10 items-center justify-center rounded-2xl ring-1 ring-white/25">
                  <Icon className="size-5" aria-hidden />
                </span>
                {text}
              </motion.li>
            ))}
          </ul>
        </div>
        <hero.art className="pointer-events-none absolute -bottom-2 right-2 h-28 w-auto opacity-95 sm:h-36 lg:static lg:mt-6 lg:h-56 lg:animate-float lg:self-end" />
      </section>

      {/* Form */}
      <main className="relative -mt-16 px-4 pb-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="mx-auto w-full max-w-md rounded-4xl bg-background p-6 shadow-lift ring-1 ring-border/60 sm:p-8"
        >
          <div className="mb-6">
            <h2 className="font-display text-2xl font-extrabold text-navy">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
            <p className="mt-1 text-sm text-muted">
              {ROLE_LABEL[role]} {mode === "signin" ? "sign in" : "sign up"}
            </p>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {mode === "signin" ? (
              <motion.form
                key="signin"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
                onSubmit={signInForm.handleSubmit((v) => signIn.mutate(v))}
                noValidate
              >
                <Segmented<Method>
                  label="Sign in with"
                  value={method}
                  onChange={(m) => {
                    signInForm.setValue("method", m);
                    signInForm.setValue("identifier", "");
                    signInForm.clearErrors("identifier");
                  }}
                  options={[{ value: "phone", label: "Phone number" }, { value: "email", label: "Email" }]}
                />
                <div>
                  <Label htmlFor="identifier">{method === "phone" ? "Mobile number" : "Email address"}</Label>
                  <Input
                    key={method}
                    id="identifier"
                    icon={method === "phone" ? Phone : Mail}
                    type={method === "phone" ? "tel" : "email"}
                    inputMode={method === "phone" ? "numeric" : "email"}
                    maxLength={method === "phone" ? 10 : 254}
                    autoComplete={method === "phone" ? "tel-national" : "email"}
                    placeholder={method === "phone" ? "9876543210" : "you@college.edu"}
                    aria-invalid={!!signInForm.formState.errors.identifier}
                    {...signInForm.register("identifier")}
                  />
                  <FieldError message={signInForm.formState.errors.identifier?.message} />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button type="button" onClick={() => setForgotOpen(true)} className="mb-1.5 text-xs font-semibold text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    icon={Lock}
                    trailing={pwToggle}
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={!!signInForm.formState.errors.password}
                    {...signInForm.register("password")}
                  />
                  <FieldError message={signInForm.formState.errors.password?.message ?? signIn.error?.message} />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={signIn.isPending}>
                  {signIn.isPending ? <Spinner className="text-white" /> : <>Sign in <ArrowRight className="size-5" aria-hidden /></>}
                </Button>
                {demo && (
                  <button
                    type="button"
                    disabled={signIn.isPending}
                    onClick={() => signIn.mutate({ method: "phone", identifier: demo.mobile, password: demo.password })}
                    className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-sun bg-sun-soft px-4 py-3 text-left transition-colors hover:bg-sun/30"
                  >
                    <FlaskConical className="size-5 shrink-0 text-sun-ink" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-navy">Use demo account</span>
                      <span className="block truncate text-xs text-sun-ink">Development only · {demo.name} · {demo.mobile}</span>
                    </span>
                  </button>
                )}
                {canSignUp ? (
                  <Button type="button" variant="ghost" className="w-full text-primary" onClick={() => switchTo("signup")}>
                    New here? Create an account
                  </Button>
                ) : (
                  <p className="flex items-center justify-center gap-2 rounded-2xl bg-surface px-4 py-3 text-center text-xs text-muted">
                    <KeyRound className="size-4 shrink-0" aria-hidden />
                    Admin accounts are created by the operations team.
                  </p>
                )}
              </motion.form>
            ) : (
              <motion.form
                key="signup"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
                onSubmit={signUpForm.handleSubmit((v) => signUp.mutate(v))}
                noValidate
              >
                <div>
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    id="full_name"
                    icon={UserIcon}
                    autoComplete="name"
                    placeholder="Your full name"
                    aria-invalid={!!signUpForm.formState.errors.full_name}
                    {...signUpForm.register("full_name")}
                  />
                  <FieldError message={signUpForm.formState.errors.full_name?.message} />
                </div>
                <div>
                  <Label htmlFor="mobile">Mobile number</Label>
                  <Input
                    id="mobile"
                    icon={Phone}
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    autoComplete="tel-national"
                    placeholder="9876543210"
                    aria-invalid={!!signUpForm.formState.errors.mobile}
                    {...signUpForm.register("mobile")}
                  />
                  <FieldError message={signUpForm.formState.errors.mobile?.message} />
                </div>
                <div>
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    icon={Mail}
                    type="email"
                    autoComplete="email"
                    placeholder="you@college.edu"
                    aria-invalid={!!signUpForm.formState.errors.email}
                    {...signUpForm.register("email")}
                  />
                  <FieldError message={signUpForm.formState.errors.email?.message} />
                </div>
                <div>
                  <Label htmlFor="new-password">Password</Label>
                  <Input
                    id="new-password"
                    icon={Lock}
                    trailing={pwToggle}
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={!!signUpForm.formState.errors.password}
                    {...signUpForm.register("password")}
                  />
                  <FieldError message={signUpForm.formState.errors.password?.message} />
                  {!signUpForm.formState.errors.password && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                      <CheckCircle2 className="size-3.5" aria-hidden /> At least 8 characters
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    icon={Lock}
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={!!signUpForm.formState.errors.confirm}
                    {...signUpForm.register("confirm")}
                  />
                  <FieldError message={signUpForm.formState.errors.confirm?.message ?? signUp.error?.message} />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={signUp.isPending}>
                  {signUp.isPending ? <Spinner className="text-white" /> : <>Create account <ArrowRight className="size-5" aria-hidden /></>}
                </Button>
                <Button type="button" variant="ghost" className="w-full text-primary" onClick={() => switchTo("signin")}>
                  Already have an account? Sign in
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  );
}

/** Requests an emailed reset link. Same response whether or not the email is registered. */
function ForgotPasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const form = useForm({
    resolver: zodResolver(z.object({ email: z.string().trim().regex(EMAIL, "Enter a valid email address") })),
    defaultValues: { email: "" },
  });
  const send = useMutation({ mutationFn: (email: string) => forgotPassword(email) });
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      send.reset();
      form.reset();
    }
  };
  return (
    <Modal open={open} onOpenChange={close} title="Reset your password"
      description="We'll email you a link to set a new password. It works once and expires in 30 minutes.">
      {send.data ? (
        <div className="space-y-4 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-mint-soft text-success"><MailCheck className="size-7" aria-hidden /></span>
          <p className="text-sm text-ink-2">{send.data.message}</p>
          {send.data.dev_reset_url && (
            <div className="rounded-2xl bg-sun-soft p-3 text-left text-xs text-sun-ink">
              <p className="font-bold">Development mode: no email server is configured.</p>
              <a href={send.data.dev_reset_url} className="mt-1 inline-block font-semibold underline">Open the reset link</a>
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={() => close(false)}>Done</Button>
        </div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => send.mutate(v.email))}>
          <div>
            <Label htmlFor="forgot-email">Email address</Label>
            <Input id="forgot-email" icon={Mail} type="email" autoComplete="email" placeholder="you@college.edu"
              aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
            <FieldError message={form.formState.errors.email?.message ?? send.error?.message} />
          </div>
          <Button type="submit" className="w-full" disabled={send.isPending}>
            {send.isPending ? <Spinner className="text-white" /> : "Email me a reset link"}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
      {message}
    </p>
  ) : null;
}
