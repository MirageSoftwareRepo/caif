import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import {
  listIncomingAccessRequests,
  listOutgoingAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  revokeAccessRequest,
} from "@/lib/api/record-access.functions";

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  revocado: "Revocado",
  vencido: "Vencido",
};

// Centro de aprobación de pedidos cross-especialidad (D4). Se aprueba o
// rechaza acá; la campana (D13) solo avisa que hay algo pendiente.
export function AccessRequestsPanel() {
  const queryClient = useQueryClient();

  const { data: incoming, refetch: refetchIncoming } = useQuery({
    queryKey: ["access-requests-incoming"],
    queryFn: () => listIncomingAccessRequests(),
  });
  const { data: outgoing, refetch: refetchOutgoing } = useQuery({
    queryKey: ["access-requests-outgoing"],
    queryFn: () => listOutgoingAccessRequests(),
  });

  const refreshAll = () => {
    void refetchIncoming();
    void refetchOutgoing();
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
  };

  const handleApprove = async (requestId: string) => {
    try {
      await approveAccessRequest({ data: { requestId } });
      toast.success("Pedido aprobado");
      refreshAll();
    } catch (err) {
      toastError(err, "No se pudo aprobar el pedido");
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectAccessRequest({ data: { requestId } });
      toast.success("Pedido rechazado");
      refreshAll();
    } catch (err) {
      toastError(err, "No se pudo rechazar el pedido");
    }
  };

  const handleRevoke = async (requestId: string) => {
    try {
      await revokeAccessRequest({ data: { requestId } });
      toast.success("Acceso revocado");
      refreshAll();
    } catch (err) {
      toastError(err, "No se pudo revocar el acceso");
    }
  };

  const hasIncoming = incoming && incoming.length > 0;
  const hasOutgoing = outgoing && outgoing.length > 0;
  if (!hasIncoming && !hasOutgoing) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      {hasIncoming && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Pedidos de acceso a mis notas
          </div>
          <div className="space-y-2">
            {incoming.map((r) => (
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
                    en {r.specialty?.name}
                  </div>
                  <div className="text-xs text-muted-foreground">Motivo: {r.reason}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.status === "pendiente" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void handleReject(r.id)}>
                        <X className="mr-1 h-3.5 w-3.5" /> Rechazar
                      </Button>
                      <Button size="sm" onClick={() => void handleApprove(r.id)}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Aprobar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant={r.status === "aprobado" ? "secondary" : "outline"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                      {r.status === "aprobado" && (
                        <Button size="sm" variant="ghost" onClick={() => void handleRevoke(r.id)}>
                          <Undo2 className="mr-1 h-3.5 w-3.5" /> Revocar
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasOutgoing && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Mis pedidos</div>
          <div className="space-y-2">
            {outgoing.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
              >
                <div>
                  {r.specialty?.name} — {r.target?.user.firstName} {r.target?.user.lastName}
                </div>
                <Badge variant={r.status === "aprobado" ? "secondary" : "outline"}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
