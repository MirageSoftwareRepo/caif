import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import {
  getOtherSpecialtiesForPatient,
  requestRecordAccess,
} from "@/lib/api/record-access.functions";

// Descubrimiento cross-especialidad (D3): se ve especialidad + nombre del
// profesional, nunca contenido ni conteo. Alcanza para ir a hablarle en
// persona o para pedir acceso por el sistema (D4).
export function OtherSpecialtiesPanel({ patientId }: { patientId: string }) {
  const { data: others } = useQuery({
    queryKey: ["other-specialties", patientId],
    queryFn: () => getOtherSpecialtiesForPatient({ data: { patientId } }),
  });

  const [target, setTarget] = useState<{
    doctorId: string;
    specialtyId: string;
    specialtyName: string;
    doctorName: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const handleRequest = async () => {
    if (!target || !reason.trim()) return;
    setSending(true);
    try {
      await requestRecordAccess({
        data: {
          targetDoctorId: target.doctorId,
          patientId,
          specialtyId: target.specialtyId,
          reason: reason.trim(),
        },
      });
      toast.success("Pedido enviado");
      setTarget(null);
      setReason("");
    } catch (err) {
      toastError(err, "No se pudo enviar el pedido");
    }
    setSending(false);
  };

  if (!others || others.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Otras especialidades con registros de este paciente
      </div>
      <div className="space-y-1.5">
        {others.map((o) => (
          <div
            key={`${o.specialtyId}:${o.doctorId}`}
            className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              {o.specialtyName} — {o.doctorName}
            </span>
            <Button size="sm" variant="outline" onClick={() => setTarget(o)}>
              Pedir acceso
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir acceso</DialogTitle>
            <DialogDescription>
              {target && `${target.specialtyName} — ${target.doctorName}`}. El motivo es
              obligatorio y queda auditado.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo del pedido..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={sending}>
              Cancelar
            </Button>
            <Button onClick={() => void handleRequest()} disabled={sending || !reason.trim()}>
              {sending ? "Enviando..." : "Enviar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
