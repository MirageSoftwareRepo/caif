import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { signNote } from "@/lib/api/clinical-notes.functions";

export function SignDialog({
  open,
  onOpenChange,
  noteId,
  onBeforeSign,
  onSigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  onBeforeSign: () => Promise<void>;
  onSigned: () => void;
}) {
  const [visibility, setVisibility] = useState<"visible" | "en_consulta">("visible");
  const [signing, setSigning] = useState(false);

  const handleSign = async () => {
    setSigning(true);
    try {
      await onBeforeSign();
      await signNote({ data: { noteId, patientVisibility: visibility } });
      toast.success("Nota firmada. Queda inmutable a partir de ahora.");
      onOpenChange(false);
      onSigned();
    } catch (err) {
      toastError(err, "No se pudo firmar la nota");
    }
    setSigning(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Firmar nota</DialogTitle>
          <DialogDescription>
            Una vez firmada, la nota queda bloqueada: no se puede editar ni borrar. Cualquier
            corrección posterior se agrega como addendum, con su propia fecha y autor.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
          <div className="flex items-start gap-2 rounded-lg border border-border p-3">
            <RadioGroupItem value="visible" id="vis-visible" className="mt-0.5" />
            <Label htmlFor="vis-visible" className="cursor-pointer font-normal">
              <span className="font-medium">Visible para el paciente</span>
              <br />
              <span className="text-xs text-muted-foreground">
                Aparece de inmediato en su historia clínica.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border p-3">
            <RadioGroupItem value="en_consulta" id="vis-consulta" className="mt-0.5" />
            <Label htmlFor="vis-consulta" className="cursor-pointer font-normal">
              <span className="font-medium">Entregar en consulta</span>
              <br />
              <span className="text-xs text-muted-foreground">
                Queda oculta al paciente hasta que la liberes manualmente.
              </span>
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={signing}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSign()} disabled={signing}>
            {signing ? "Firmando..." : "Firmar nota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
