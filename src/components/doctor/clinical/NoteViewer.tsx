import { useState } from "react";
import { Lock, Plus, Unlock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { addAddendum, releaseNoteToPatient, exportNotePdf } from "@/lib/api/clinical-notes.functions";
import type { ClinicalNote } from "./types";

function fmtDateTime(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}

export function NoteViewer({
  note,
  onAddendumAdded,
  onReleased,
}: {
  note: ClinicalNote;
  onAddendumAdded: () => void;
  onReleased?: () => void;
}) {
  const [addendumOpen, setAddendumOpen] = useState(false);
  const [addendumText, setAddendumText] = useState("");
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const { fileData, fileName } = await exportNotePdf({ data: { noteId: note.id } });
      const binary = atob(fileData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err, "No se pudo exportar la nota");
    }
    setExporting(false);
  };

  const handleAddAddendum = async () => {
    if (!addendumText.trim()) return;
    setSaving(true);
    try {
      await addAddendum({ data: { noteId: note.id, bodyHtml: `<p>${addendumText}</p>` } });
      toast.success("Addendum agregado");
      setAddendumText("");
      setAddendumOpen(false);
      onAddendumAdded();
    } catch (err) {
      toastError(err, "No se pudo agregar el addendum");
    }
    setSaving(false);
  };

  const handleRelease = async () => {
    setReleasing(true);
    try {
      await releaseNoteToPatient({ data: { noteId: note.id } });
      toast.success("Nota liberada al paciente");
      onReleased?.();
    } catch (err) {
      toastError(err, "No se pudo liberar la nota");
    }
    setReleasing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          <Lock className="mr-1 h-3 w-3" /> Firmada
        </Badge>
        <span className="text-xs text-muted-foreground">
          {fmtDateTime(note.signedAt)} · {note.doctor?.user.firstName} {note.doctor?.user.lastName}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void handleExportPdf()} disabled={exporting}>
          <Download className="mr-1 h-3.5 w-3.5" /> PDF
        </Button>
        <Badge variant="outline" className="ml-auto">
          {note.patientVisibility === "visible" ? "Visible al paciente" : "Entregar en consulta"}
        </Badge>
        {note.patientVisibility === "en_consulta" && !note.releasedToPatientAt && (
          <Button size="sm" variant="outline" onClick={() => void handleRelease()} disabled={releasing}>
            <Unlock className="mr-1 h-3.5 w-3.5" /> {releasing ? "Liberando..." : "Liberar al paciente"}
          </Button>
        )}
      </div>

      {(note.motivo || note.diagnostico || note.proximoControl) && (
        <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm sm:grid-cols-3">
          {note.motivo && (
            <div>
              <div className="text-xs text-muted-foreground">Motivo</div>
              <div>{note.motivo}</div>
            </div>
          )}
          {note.diagnostico && (
            <div>
              <div className="text-xs text-muted-foreground">Diagnóstico</div>
              <div>{note.diagnostico}</div>
            </div>
          )}
          {note.proximoControl && (
            <div>
              <div className="text-xs text-muted-foreground">Próximo control</div>
              <div>{new Date(note.proximoControl).toLocaleDateString("es-AR")}</div>
            </div>
          )}
        </div>
      )}

      <div
        className="prose prose-sm max-w-none rounded-lg border border-border p-3"
        dangerouslySetInnerHTML={{ __html: note.bodyHtml ?? "" }}
      />

      {note.addenda.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Addenda</div>
          {note.addenda.map((a) => (
            <div key={a.id} className="rounded-lg border border-dashed border-border p-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">
                {fmtDateTime(a.createdAt)} · {a.author.user.firstName} {a.author.user.lastName}
              </div>
              <div dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />
            </div>
          ))}
        </div>
      )}

      {addendumOpen ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <Textarea
            value={addendumText}
            onChange={(e) => setAddendumText(e.target.value)}
            placeholder="Corrección o aclaración posterior a la firma..."
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddendumOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleAddAddendum()}
              disabled={saving || !addendumText.trim()}
            >
              {saving ? "Guardando..." : "Agregar addendum"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAddendumOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Agregar addendum
        </Button>
      )}
    </div>
  );
}
