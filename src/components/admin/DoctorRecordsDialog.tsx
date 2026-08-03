import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, FileText } from "lucide-react";
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
import { toastError } from "@/lib/toastError";
import {
  adminListDoctorPatients,
  adminListPatientNotes,
  adminViewNote,
} from "@/lib/api/admin-clinical.functions";

type NoteWithAddenda = Awaited<ReturnType<typeof adminViewNote>>;

// Plan 10, §4ter. Camino explícito para que el admin lea una ficha: entra por
// un médico, ve sus pacientes, y recién ahí puede abrir una nota — nunca en
// un listado global. Cada apertura pide motivo de nuevo (mín. 15 caracteres).
export function DoctorRecordsDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
}) {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [openedNote, setOpenedNote] = useState<NoteWithAddenda | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: patients } = useQuery({
    queryKey: ["admin-doctor-patients", doctorId],
    queryFn: () => adminListDoctorPatients({ data: { doctorId } }),
    enabled: open,
  });

  const { data: notes } = useQuery({
    queryKey: ["admin-patient-notes", doctorId, patientId],
    queryFn: () => adminListPatientNotes({ data: { doctorId, patientId: patientId! } }),
    enabled: open && !!patientId,
  });

  const reset = () => {
    setPatientId(null);
    setPendingNoteId(null);
    setReason("");
    setOpenedNote(null);
  };

  const handleOpenNote = async () => {
    if (!pendingNoteId || reason.trim().length < 15) return;
    setLoading(true);
    try {
      const note = await adminViewNote({ data: { noteId: pendingNoteId, reason: reason.trim() } });
      setOpenedNote(note);
    } catch (err) {
      toastError(err, "No se pudo abrir la nota");
    }
    setLoading(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fichas de {doctorName}</DialogTitle>
          <DialogDescription>
            Acceso auditado: cada nota que abrís queda registrada y se le avisa al autor con el
            motivo.
          </DialogDescription>
        </DialogHeader>

        {openedNote ? (
          <div className="space-y-3">
            <Button size="sm" variant="ghost" onClick={() => setOpenedNote(null)}>
              ← Volver
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              {openedNote.specialty?.name} ·{" "}
              {openedNote.sessionDate && new Date(openedNote.sessionDate).toLocaleDateString("es-AR")}
            </div>
            {openedNote.motivo && (
              <p className="text-sm">
                <span className="text-muted-foreground">Motivo:</span> {openedNote.motivo}
              </p>
            )}
            {openedNote.diagnostico && (
              <p className="text-sm">
                <span className="text-muted-foreground">Diagnóstico:</span> {openedNote.diagnostico}
              </p>
            )}
            <div
              className="prose prose-sm max-w-none rounded-lg border border-border p-3"
              dangerouslySetInnerHTML={{ __html: openedNote.bodyHtml ?? "" }}
            />
            {openedNote.addenda.map((a) => (
              <div key={a.id} className="rounded-lg border border-dashed border-border p-3 text-sm">
                <div
                  className="mb-1 text-xs text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: a.bodyHtml }}
                />
              </div>
            ))}
          </div>
        ) : pendingNoteId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Motivo del acceso (mínimo 15 caracteres, obligatorio):
            </p>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingNoteId(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handleOpenNote()}
                disabled={loading || reason.trim().length < 15}
              >
                {loading ? "Abriendo..." : "Abrir nota"}
              </Button>
            </DialogFooter>
          </div>
        ) : !patientId ? (
          <div className="max-h-96 space-y-1.5 overflow-y-auto">
            {!patients || patients.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Sin pacientes.</p>
            ) : (
              patients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPatientId(p.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left text-sm hover:bg-muted/50"
                >
                  <span>
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.documentNumber ?? "—"}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Button size="sm" variant="ghost" onClick={() => setPatientId(null)}>
              ← Volver a pacientes
            </Button>
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {!notes || notes.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">Sin notas.</p>
              ) : (
                notes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setPendingNoteId(n.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      {new Date(n.sessionDate).toLocaleDateString("es-AR")} — {n.specialty?.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{n.status}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
