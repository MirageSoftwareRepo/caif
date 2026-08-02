import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { promoteBlockToAppointment } from "@/lib/api/time-blocks.functions";
import { getAllSpecialties } from "@/lib/api/specialties.functions";

type Specialty = { id: string; name: string };

export function QuickPatientDialog({
  blockId,
  onOpenChange,
  onPromoted,
}: {
  blockId: string | null;
  onOpenChange: (v: boolean) => void;
  onPromoted: () => void;
}) {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyId, setSpecialtyId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAllSpecialties()
      .then((s) => {
        setSpecialties(s);
        if (s.length === 1) setSpecialtyId(s[0].id);
      })
      .catch(console.error);
  }, []);

  const reset = () => {
    setFirstName("");
    setLastName("");
    setDocumentNumber("");
    setPhone("");
  };

  const valid =
    firstName.trim() &&
    lastName.trim() &&
    /^\d{6,15}$/.test(documentNumber) &&
    phone.trim() &&
    specialtyId;

  const handleSubmit = async () => {
    if (!blockId || !valid) return;
    setSubmitting(true);
    try {
      await promoteBlockToAppointment({
        data: {
          blockId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          documentNumber,
          phone: phone.trim(),
          specialtyId,
        },
      });
      toast.success("Paciente agregado y turno registrado");
      onOpenChange(false);
      reset();
      onPromoted();
    } catch (e) {
      toastError(e, "No se pudo agregar el paciente");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={blockId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar paciente</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Se va a crear una cuenta de paciente con estos datos y el bloqueo pasa a ser un turno
          atendido. Recién entonces vas a poder escribir la ficha.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qp-first">Nombre</Label>
              <Input
                id="qp-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={80}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qp-last">Apellido</Label>
              <Input
                id="qp-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={80}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qp-dni">DNI</Label>
            <Input
              id="qp-dni"
              inputMode="numeric"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value.replace(/\D/g, ""))}
              maxLength={15}
              className="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">
              Si el DNI ya existe en el sistema, se usa esa cuenta en vez de crear una nueva.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qp-phone">Teléfono</Label>
            <Input
              id="qp-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qp-specialty">Especialidad</Label>
            <Select value={specialtyId} onValueChange={setSpecialtyId}>
              <SelectTrigger id="qp-specialty" className="min-h-[44px]">
                <SelectValue placeholder="Elegí una especialidad" />
              </SelectTrigger>
              <SelectContent>
                {specialties.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !valid}>
            {submitting ? "Guardando…" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
