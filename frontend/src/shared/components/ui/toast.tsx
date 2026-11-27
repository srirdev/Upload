import { Toaster as Sonner, toast } from "sonner";

/** App-wide toasts. Use `toast.success("Saved")`, `toast.error(e.message)`, `toast("Heads up")`. */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border-border !bg-background !text-navy !shadow-lift !font-sans",
          description: "!text-muted",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}

/** Toast the message of a failed mutation (keeps call sites one-liners). */
export const toastError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

export { toast };
