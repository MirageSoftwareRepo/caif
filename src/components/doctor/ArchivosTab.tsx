import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Upload, Eye, Trash2, Search, History } from "lucide-react";
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
import {
  uploadMedicalRecord,
  getMyPatientRecords,
  getRecordFile,
  deleteMedicalRecord,
} from "@/lib/api/medical-records.functions";
import { getDoctorIdByUserId } from "@/lib/api/doctor-schedule.functions";
import { getDoctorAppointments } from "@/lib/api/appointments.functions";
import type { AgendaAppt } from "@/components/agenda/status";

type PatientRecord = {
  id: string;
  patientId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  recordVersion: number;
  createdAt: Date | null;
  patient: {
    firstName: string;
    lastName: string;
    email: string;
    documentNumber: string | null;
  } | null;
};

export function ArchivosTab({ userId }: { userId: string }) {
  const { data: doctorId } = useQuery({
    queryKey: ["my-doctor-id-records", userId],
    queryFn: () => getDoctorIdByUserId(),
  });

  const { data: apptsData } = useQuery({
    queryKey: ["doctor-appts-patients", userId],
    enabled: !!doctorId,
    queryFn: async () => {
      const all = await getDoctorAppointments();
      return all as AgendaAppt[];
    },
  });

  const patientsWithAppts = useMemo(() => {
    if (!apptsData) return [];
    const seen = new Map<
      string,
      { id: string; firstName: string; lastName: string; email: string }
    >();
    for (const a of apptsData) {
      if (a.patient && !seen.has(a.patient.id)) {
        seen.set(a.patient.id, a.patient);
      }
    }
    return Array.from(seen.values());
  }, [apptsData]);

  const { data: records, refetch } = useQuery({
    queryKey: ["my-patient-records", doctorId],
    enabled: !!doctorId,
    queryFn: () => getMyPatientRecords({ data: { doctorId: doctorId! } }),
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForPatient, setUploadForPatient] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");

  const handleUpload = async (patientId: string) => {
    if (!file || !doctorId) return;
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      await uploadMedicalRecord({
        data: {
          doctorId,
          patientId,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileData: base64,
          fileSize: file.size,
        },
      });
      toast.success("Ficha médica subida");
      setUploadOpen(false);
      setFile(null);
      setUploadForPatient(null);
      refetch();
    } catch (e) {
      toastError(e, "Error al subir la ficha");
    }
    setUploading(false);
  };

  const handleView = async (recordId: string) => {
    try {
      const { fileData, fileName, fileType } = await getRecordFile({
        data: { recordId },
      });
      const binary = atob(fileData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: fileType });
      const url = URL.createObjectURL(blob);
      if (fileType.startsWith("image/")) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
      }
      URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err, "Error al abrir la ficha");
    }
  };

  const handleDelete = async (recordId: string) => {
    try {
      await deleteMedicalRecord({ data: { recordId } });
      toast.success("Ficha eliminada");
      refetch();
    } catch (err) {
      toastError(err, "Error al eliminar la ficha");
    }
  };

  const recordsByPatient = useMemo(() => {
    const map = new Map<string, (PatientRecord & { recordVersion: number })[]>();
    for (const r of records ?? []) {
      const pid = r.patientId;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(r as PatientRecord & { recordVersion: number });
    }
    for (const [, versions] of map) {
      versions.sort((a, b) => b.recordVersion - a.recordVersion);
    }
    return map;
  }, [records]);

  const filteredPatientIds = useMemo(() => {
    if (!search.trim()) return Array.from(recordsByPatient.keys());
    const term = search.toLowerCase();
    return Array.from(recordsByPatient.entries())
      .filter(([, versions]) => {
        const p = versions[0].patient;
        const name = `${p?.firstName} ${p?.lastName}`.toLowerCase();
        const dni = p?.documentNumber?.toLowerCase() ?? "";
        return name.includes(term) || dni.includes(term);
      })
      .map(([pid]) => pid);
  }, [recordsByPatient, search]);

  const fileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "PDF";
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext ?? "")) return "IMG";
    if (["doc", "docx"].includes(ext ?? "")) return "DOC";
    if (ext === "txt") return "TXT";
    return "FILE";
  };

  const openUpload = (patient?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }) => {
    setUploadForPatient(patient ?? null);
    setFile(null);
    setUploadOpen(true);
  };

  function PatientRecordCard({
    patientId,
    versions,
  }: {
    patientId: string;
    versions: (PatientRecord & { recordVersion: number })[];
  }) {
    const [showHistory, setShowHistory] = useState(false);
    const latest = versions[0];
    const prevVersions = versions.slice(1);
    const p = latest.patient;

    return (
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-primary text-primary-foreground text-sm font-bold">
              {p?.firstName?.[0]}
              {p?.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">
                {p?.firstName} {p?.lastName}
              </div>
              <div className="text-xs text-muted-foreground">
                {p?.documentNumber ?? "—"} · {p?.email}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openUpload({
                  id: patientId,
                  firstName: p?.firstName ?? "",
                  lastName: p?.lastName ?? "",
                  email: p?.email ?? "",
                })
              }
            >
              <Upload className="mr-1 h-4 w-4" /> Nueva versión
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowHistory(!showHistory)}
              disabled={prevVersions.length === 0}
            >
              <History className="mr-1 h-4 w-4" />
              {prevVersions.length > 0 ? `Historial (${versions.length})` : "Sin historial"}
            </Button>
          </div>
        </div>

        <div className="border-t border-border px-4 py-3 bg-muted/20">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                {fileIcon(latest.fileName)}
              </span>
              <span className="truncate">{latest.fileName}</span>
              <span className="text-muted-foreground text-xs">
                v{latest.recordVersion} · {(latest.fileSize / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">
                {latest.createdAt ? new Date(latest.createdAt).toLocaleDateString("es-AR") : ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => handleView(latest.id)}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(latest.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {showHistory && prevVersions.length > 0 && (
          <div className="border-t border-border">
            {prevVersions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 bg-background/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {fileIcon(v.fileName)}
                  </span>
                  <span className="text-sm truncate">{v.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    v{v.recordVersion} · {(v.fileSize / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {v.createdAt ? new Date(v.createdAt).toLocaleDateString("es-AR") : ""}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => handleView(v.id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(v.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-border bg-background p-6">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre o DNI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => openUpload()}>
            <Upload className="mr-2 h-4 w-4" /> Subir ficha
          </Button>
        </div>

        {recordsByPatient.size === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>No hay fichas médicas aún.</p>
            <p className="text-xs mt-1">Subí la primera ficha usando el botón "Subir ficha".</p>
          </div>
        ) : filteredPatientIds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>No se encontraron fichas para "{search}"</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPatientIds.map((patientId) => (
              <PatientRecordCard
                key={patientId}
                patientId={patientId}
                versions={recordsByPatient.get(patientId)!}
              />
            ))}
          </div>
        )}

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {uploadForPatient
                  ? `Nueva versión para ${uploadForPatient.firstName} ${uploadForPatient.lastName}`
                  : "Subir ficha médica"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!uploadForPatient && (
                <div>
                  <Label>Paciente</Label>
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const p = patientsWithAppts.find((p) => p.id === e.target.value);
                      setUploadForPatient(p ?? null);
                    }}
                  >
                    <option value="">Seleccionar paciente</option>
                    {patientsWithAppts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} ({p.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label>Archivo (PDF, imagen, Word, TXT)</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => handleUpload(uploadForPatient!.id)}
                disabled={!file || !uploadForPatient || uploading}
              >
                {uploading ? "Subiendo..." : "Subir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
