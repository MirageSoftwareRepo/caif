import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { createTimeBlock } from "@/lib/api/time-blocks.functions";

export function BlockSlotDialog({
  open,
  onOpenChange,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate?: string;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(defaultDate ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toLocalIso = (d: string, t: string) => {
    const [y, mo, dy] = d.split("-").map(Number);
    const [h, mi] = t.split(":").map(Number);
    return new Date(y, mo - 1, dy, h, mi, 0, 0).toISOString();
  };

  const handleSubmit = async () => {
    if (!date) return;
    setSubmitting(true);
    try {
      await createTimeBlock({
        data: {
          startAt: toLocalIso(date, startTime),
          endAt: toLocalIso(date, endTime),
          reason: reason.trim() || undefined,
        },
      });
      toast.success("Horario bloqueado");
      onOpenChange(false);
      setReason("");
      onCreated();
    } catch (e) {
      toastError(e, "No se pudo bloquear el horario");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloquear horario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="block-date">Fecha</Label>
            <Input
              id="block-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-[44px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="block-start">Desde</Label>
              <Input
                id="block-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-end">Hasta</Label>
              <Input
                id="block-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Motivo (opcional)</Label>
            <Input
              id="block-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Paciente particular, reunión, etc."
              maxLength={200}
              className="min-h-[44px]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            El horario deja de ofrecerse a pacientes y a recepción. Si después querés registrar la
            atención, agregá el paciente desde la agenda.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !date}>
            {submitting ? "Bloqueando…" : "Bloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
