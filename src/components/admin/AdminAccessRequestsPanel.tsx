import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import {
  adminListOrphanedAccessRequests,
  adminApproveAccessRequest,
  adminRejectAccessRequest,
} from "@/lib/api/admin-clinical.functions";

// Plan 10, §4bis: pedidos de acceso dirigidos a un médico inactivo sin
// sucesor asignado. El admin es quien los resuelve acá.
export function AdminAccessRequestsPanel() {
  const { data: requests, refetch } = useQuery({
    queryKey: ["admin-orphaned-access-requests"],
    queryFn: () => adminListOrphanedAccessRequests(),
  });

  if (!requests || requests.length === 0) return null;

  const handleApprove = async (requestId: string) => {
    try {
      await adminApproveAccessRequest({ data: { requestId } });
      toast.success("Pedido aprobado");
      void refetch();
    } catch (err) {
      toastError(err, "No se pudo aprobar el pedido");
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await adminRejectAccessRequest({ data: { requestId } });
      toast.success("Pedido rechazado");
      void refetch();
    } catch (err) {
      toastError(err, "No se pudo rechazar el pedido");
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 text-sm font-medium">
        Pedidos de acceso sin médico responsable ({requests.length})
      </div>
      <div className="space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div>
                <span className="font-medium">
                  {r.requester?.user.firstName} {r.requester?.user.lastName}
                </span>{" "}
                pide leer las notas de{" "}
                <span className="font-medium">
                  {r.patient?.firstName} {r.patient?.lastName}
                </span>{" "}
                ({r.specialty?.name}), a cargo de{" "}
                <span className="font-medium">
                  {r.target?.user.firstName} {r.target?.user.lastName}
                </span>{" "}
                (inactivo, sin sucesor)
              </div>
              <div className="text-xs text-muted-foreground">Motivo: {r.reason}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={() => void handleReject(r.id)}>
                <X className="mr-1 h-3.5 w-3.5" /> Rechazar
              </Button>
              <Button size="sm" onClick={() => void handleApprove(r.id)}>
                <Check className="mr-1 h-3.5 w-3.5" /> Aprobar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
