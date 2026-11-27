import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState, type ComponentType, type SVGProps } from "react";
import { useStartOrder } from "@/modules/student/hooks/useStartOrder";
import { A3Art, BoundBookArt, BwPrintArt, ColorPrintArt, CoverPageArt, SpiralArt } from "@/shared/components/illustrations";
import { Button } from "@/shared/components/ui/button";
import { Modal } from "@/shared/components/ui/dialog";
import { Spinner } from "@/shared/components/ui/states";
import { cn } from "@/shared/utils/cn";

interface Category {
  id: string;
  name: string;
  short: string;
  art: ComponentType<SVGProps<SVGSVGElement>>;
  tile: string;
  /** What the student can actually choose for this service (matches the order wizard). */
  options: string[];
  where: string;
}

/** Every option listed here exists in the order flow; prices come from the shops at checkout. */
export const CATEGORIES: Category[] = [
  {
    id: "bw", name: "B&W prints", short: "Notes & records", art: BwPrintArt, tile: "bg-primary-soft",
    options: ["70, 80 or 100 GSM paper", "Single or double sided", "A4 or A3"],
    where: "Choose black & white when you set up your print.",
  },
  {
    id: "color", name: "Colour prints", short: "Charts & slides", art: ColorPrintArt, tile: "bg-orange-soft",
    options: ["Full-colour pages", "Mix colour and B&W page ranges in one document", "70, 80 or 100 GSM paper"],
    where: "Choose colour when you set up your print, for all pages or just some.",
  },
  {
    id: "spiral", name: "Spiral binding", short: "Lies flat", art: SpiralArt, tile: "bg-sun-soft",
    options: ["Opens flat on the desk", "Easy to flip through", "Great for lab manuals"],
    where: "Choose spiral when you pick a binding.",
  },
  {
    id: "book", name: "Book binding", short: "Soft, hard, calico", art: BoundBookArt, tile: "bg-mint-soft",
    options: ["Soft binding: glued paper cover", "Hard binding: rigid cover for theses", "Calico: cloth-taped spine"],
    where: "Choose the binding type when you set up your order.",
  },
  {
    id: "a3", name: "A3 prints", short: "Big drawings", art: A3Art, tile: "bg-surface",
    options: ["Double-size sheets", "Engineering drawings and posters", "Colour or B&W"],
    where: "Switch the paper size to A3 when you set up your print.",
  },
  {
    id: "cover", name: "Cover pages", short: "Auto-filled", art: CoverPageArt, tile: "bg-[#ffe1ec]",
    options: ["Your name, register number and department", "Subject name and code", "Generated for each document"],
    where: "Add a cover page when you set up your order.",
  },
];

/** Illustrated service grid. Each tile opens a sheet explaining the option, with a button that starts an order. */
export function ServiceCategories() {
  const [open, setOpen] = useState<Category | null>(null);
  const start = useStartOrder();

  return (
    <>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpen(c)}
              className="group flex w-full flex-col items-center gap-2 rounded-3xl p-1 text-center focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className={cn("flex aspect-square w-full items-center justify-center rounded-3xl transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-95", c.tile)}>
                <c.art className="h-3/5 w-3/5 drop-shadow-[0_6px_10px_rgb(20_15_60/0.15)]" />
              </span>
              <span className="text-[13px] font-bold leading-tight text-navy">{c.name}</span>
              <span className="-mt-1.5 text-[11px] text-muted">{c.short}</span>
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.name ?? ""}
        description={open?.where}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? <Spinner className="text-white" /> : <>Start an order <ArrowRight className="size-4" aria-hidden /></>}
            </Button>
          </>
        }
      >
        {open && (
          <div className="flex items-center gap-5">
            <span className={cn("flex size-24 shrink-0 items-center justify-center rounded-3xl", open.tile)}>
              <open.art className="size-16" />
            </span>
            <ul className="space-y-2">
              {open.options.map((o) => (
                <li key={o} className="flex items-start gap-2 text-sm text-ink-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {o}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </>
  );
}
