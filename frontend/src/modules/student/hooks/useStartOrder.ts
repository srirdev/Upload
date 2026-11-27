import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createOrder } from "@/modules/student/api";
import { toastError } from "@/shared/components/ui/toast";

/**
 * Creates a draft order and opens the upload wizard. Every "Upload" / "Print now" entry point uses this,
 * so they all behave the same (and show the server's reason in a toast if it fails).
 */
export function useStartOrder() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: createOrder,
    onSuccess: (o) => navigate(`/student/new/${o.id}`),
    onError: toastError,
  });
}
