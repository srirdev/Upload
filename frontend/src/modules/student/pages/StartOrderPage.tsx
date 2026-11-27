import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createOrder } from "@/modules/student/api";
import { UploadHeroArt } from "@/shared/components/illustrations";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/states";

/**
 * `/student/new`: the Upload button in the navigation lands here. Creates one draft order and
 * replaces itself with the wizard, so Back returns to where the student was.
 */
export function StartOrderPage() {
  const navigate = useNavigate();
  const started = useRef(false); // StrictMode runs effects twice in development; create only one draft
  const create = useMutation({
    mutationFn: createOrder,
    onSuccess: (o) => navigate(`/student/new/${o.id}`, { replace: true }),
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    create.mutate();
  }, [create]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
      <UploadHeroArt className="h-40 animate-float" />
      {create.isError ? (
        <>
          <p className="font-display text-xl font-bold text-navy">Couldn't start your order</p>
          <p role="alert" className="max-w-sm text-sm text-muted">{create.error.message}</p>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/student"><ArrowLeft className="size-4" aria-hidden /> Home</Link>
            </Button>
            <Button onClick={() => create.mutate()}><RefreshCw className="size-4" aria-hidden /> Try again</Button>
          </div>
        </>
      ) : (
        <>
          <p className="font-display text-xl font-bold text-navy">Starting a new order…</p>
          <Spinner className="size-7" />
        </>
      )}
    </div>
  );
}
