import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Stethoscope } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toastError";
import { getMyClinicalHistory, exportNotePdf } from "@/lib/api/clinical-notes.functions";
import { getMyVisibleRecords, getMyRecordFile } from "@/lib/api/medical-records.functions";

function downloadBase64(fileData: string, fileName: string, fileType: string) {
  const binary = atob(fileData);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: fileType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

// Plan 10, Fase 4, D7: el paciente ve su historia agrupada por especialidad,
// solo notas firmadas y liberadas. Los archivos con patientVisible=true
// aparecen en la misma vista (D9).
export function ClinicalHistoryTab() {
  const { data: notes } = useQuery({
    queryKey: ["my-clinical-history"],
    queryFn: () => getMyClinicalHistory(),
  });
  const { data: records } = useQuery({
    queryKey: ["my-visible-records"],
    queryFn: () => getMyVisibleRecords(),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { specialtyName: string; notes: NonNullable<typeof notes> }>();
    for (const n of notes ?? []) {
      const key = n.specialtyId;
      if (!map.has(key)) map.set(key, { specialtyName: n.specialty?.name ?? "—", notes: [] });
      map.get(key)!.notes.push(n);
    }
    return Array.from(map.entries());
  }, [notes]);

  const handleDownloadRecord = async (recordId: string) => {
    try {
      const { fileData, fileName, fileType } = await getMyRecordFile({ data: { recordId } });
      downloadBase64(fileData, fileName, fileType);
    } catch (err) {
      toastError(err, "No se pudo descargar el archivo");
    }
  };

  const handleExportNote = async (noteId: string) => {
    try {
      const { fileData, fileName } = await exportNotePdf({ data: { noteId } });
      downloadBase64(fileData, fileName, "application/pdf");
    } catch (err) {
      toastError(err, "No se pudo exportar la nota");
    }
  };

  const hasNothing = grouped.length === 0 && (!records || records.length === 0);

  return (
    <div className="space-y-6">
      {hasNothing ? (
        <div className="rounded-2xl border border-dashed border-border bg-background p-10 text-center text-muted-foreground">
          <Stethoscope className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>Todavía no tenés notas ni archivos en tu historia clínica.</p>
        </div>
      ) : (
        <>
          {grouped.length > 0 && (
            <div className="rounded-2xl border border-border bg-background p-4">
              <Accordion type="multiple" className="w-full">
                {grouped.map(([specialtyId, group]) => (
                  <AccordionItem key={specialtyId} value={specialtyId}>
                    <AccordionTrigger>
                      {group.specialtyName} ({group.notes.length})
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        {group.notes.map((n) => (
                          <div key={n.id} className="rounded-lg border border-border p-3 text-sm">
                            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{fmtDate(n.sessionDate)}</span>
                              <span className="flex items-center gap-2">
                                {n.doctor?.user.firstName} {n.doctor?.user.lastName}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5"
                                  onClick={() => void handleExportNote(n.id)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </div>
                            {n.motivo && <div className="mb-1 font-medium">{n.motivo}</div>}
                            <div
                              className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: n.bodyHtml ?? "" }}
                            />
                            {n.addenda.length > 0 && (
                              <div className="mt-2 space-y-1.5 border-t border-dashed border-border pt-2">
                                {n.addenda.map((a) => (
                                  <div key={a.id} className="text-xs">
                                    <span className="text-muted-foreground">
                                      {fmtDate(a.createdAt)} · {a.author.user.firstName}{" "}
                                      {a.author.user.lastName}:
                                    </span>{" "}
                                    <span dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {records && records.length > 0 && (
            <div className="rounded-2xl border border-border bg-background p-4">
              <h3 className="mb-3 text-sm font-medium">Archivos</h3>
              <div className="space-y-2">
                {records.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{r.fileName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {r.doctor?.specialty?.name}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void handleDownloadRecord(r.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
