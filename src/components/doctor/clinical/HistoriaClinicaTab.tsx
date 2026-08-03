import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClinicalPatients } from "@/lib/api/clinical-notes.functions";
import { getDoctorAppointments } from "@/lib/api/appointments.functions";
import type { AgendaAppt } from "@/components/agenda/status";
import { PatientList } from "./PatientList";
import { NoteTimeline } from "./NoteTimeline";
import { OtherSpecialtiesPanel } from "./OtherSpecialtiesPanel";
import { AccessRequestsPanel } from "./AccessRequestsPanel";

export function HistoriaClinicaTab({ userId: _userId }: { userId: string }) {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const { data: patients } = useQuery({
    queryKey: ["clinical-patients"],
    queryFn: () => getClinicalPatients(),
  });

  const { data: appointments } = useQuery({
    queryKey: ["clinical-doctor-appointments"],
    queryFn: async () => (await getDoctorAppointments()) as AgendaAppt[],
  });

  const selectedPatient = useMemo(
    () => patients?.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  const patientAppointments = useMemo(
    () => (appointments ?? []).filter((a) => a.patient?.id === selectedPatientId),
    [appointments, selectedPatientId],
  );

  return (
    <div className="mt-6 space-y-4">
      <AccessRequestsPanel />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rounded-2xl border border-border bg-background p-4">
          <PatientList
            patients={patients ?? []}
            selectedId={selectedPatientId}
            onSelect={setSelectedPatientId}
          />
        </div>

        <div className="space-y-4">
          {!selectedPatient ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              <p>Seleccioná un paciente para ver su historia clínica.</p>
            </div>
          ) : (
            <>
              <OtherSpecialtiesPanel patientId={selectedPatient.id} />
              <NoteTimeline patient={selectedPatient} patientAppointments={patientAppointments} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
