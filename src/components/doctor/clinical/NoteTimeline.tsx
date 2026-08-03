import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, FileText, Lock, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toastError";
import {
  listPatientTimeline,
  getNote,
  createOrGetDraftFromAppointment,
} from "@/lib/api/clinical-notes.functions";
import { NoteEditor } from "./NoteEditor";
import { NoteViewer } from "./NoteViewer";
import type { ClinicalNote, ClinicalPatient } from "./types";
import type { AgendaAppt } from "@/components/agenda/status";

export function NoteTimeline({
  patient,
  patientAppointments,
}: {
  patient: ClinicalPatient;
  patientAppointments: AgendaAppt[];
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  const timelineKey = ["clinical-timeline", patient.id, search];
  const { data: notes, refetch } = useQuery({
    queryKey: timelineKey,
    queryFn: () => listPatientTimeline({ data: { patientId: patient.id, q: search || undefined } }),
  });

  const { data: fullNote, refetch: refetchNote } = useQuery({
    queryKey: ["clinical-note", selectedNoteId],
    enabled: !!selectedNoteId,
    queryFn: () => getNote({ data: { noteId: selectedNoteId! } }) as Promise<ClinicalNote>,
  });

  useEffect(() => {
    setSelectedNoteId(null);
  }, [patient.id]);

  const appointmentsWithoutNote = patientAppointments.filter(
    (a) => !notes?.some((n) => n.appointmentId === a.id),
  );

  const startFromAppointment = async (appointmentId: string) => {
    setCreating(appointmentId);
    try {
      const note = await createOrGetDraftFromAppointment({ data: { appointmentId } });
      await refetch();
      setSelectedNoteId(note.id);
      setNewNoteOpen(false);
    } catch (err) {
      toastError(err, "No se pudo iniciar la nota");
    }
    setCreating(null);
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: timelineKey });
  };

  const handleSigned = () => {
    void refetch();
    void refetchNote();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8 text-sm"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            onClick={() => setNewNoteOpen(true)}
            disabled={patientAppointments.length === 0}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1.5">
          {!notes || notes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Sin notas todavía.
            </p>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelectedNoteId(n.id)}
                className={cn(
                  "w-full rounded-lg border p-2.5 text-left text-sm transition-colors",
                  selectedNoteId === n.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {new Date(n.sessionDate).toLocaleDateString("es-AR")}
                  </span>
                  {n.status === "firmada" ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <PenLine className="h-3.5 w-3.5 text-amber-600" />
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {n.specialty?.name ?? "—"} ·{" "}
                  {n.motivo || (n.status === "borrador" ? "Borrador" : "Sin motivo")}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        {!fullNote ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
            <FileText className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">Elegí una nota del timeline o iniciá una nueva.</p>
          </div>
        ) : fullNote.status === "borrador" ? (
          // `key` obligatoria: useEditor de Tiptap crea la instancia una sola vez y
          // `content` solo se lee al montar. Sin key, al saltar a una nota que ya
          // estaba en la cache de react-query el componente no se desmonta y el
          // editor sigue mostrando el cuerpo de la nota anterior — y el autosave
          // siguiente lo escribe en la nota nueva.
          <NoteEditor
            key={fullNote.id}
            note={fullNote}
            onSaved={handleSaved}
            onSigned={handleSigned}
          />
        ) : (
          <NoteViewer
            note={fullNote}
            onAddendumAdded={() => void refetchNote()}
            onReleased={() => void refetchNote()}
          />
        )}
      </div>

      <Dialog open={newNoteOpen} onOpenChange={setNewNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar nota clínica</DialogTitle>
            <DialogDescription>
              Elegí el turno al que corresponde la sesión. Una nota por turno.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {appointmentsWithoutNote.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Todos los turnos de este paciente ya tienen una nota.
              </p>
            ) : (
              appointmentsWithoutNote.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void startFromAppointment(a.id)}
                  disabled={creating === a.id}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                >
                  <span>
                    {new Date(a.scheduledAt).toLocaleString("es-AR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground">{a.specialty?.name ?? "—"}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
