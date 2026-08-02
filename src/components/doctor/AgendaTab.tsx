import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import {
  getDoctorAppointments,
  updateAppointmentStatus,
  bookAppointment,
  getDayAppointments,
} from "@/lib/api/appointments.functions";
import {
  getDoctorIdByUserId,
  getMyDoctorProfile,
  getDoctorSchedule,
} from "@/lib/api/doctor-schedule.functions";
import { searchPatients } from "@/lib/api/admin-users.functions";
import { getAllSpecialties } from "@/lib/api/specialties.functions";
import { generateSlots, type Slot } from "@/lib/slots";
import { blocksToOccupied } from "@/lib/time-blocks";
import { getMyTimeBlocks, deleteTimeBlock } from "@/lib/api/time-blocks.functions";
import { DayGrid } from "@/components/agenda/DayGrid";
import { WeekView } from "@/components/agenda/WeekView";
import { FreshnessIndicator } from "@/components/agenda/FreshnessIndicator";
import { useTabVisible } from "@/lib/useTabVisible";
import type { AgendaAppt } from "@/components/agenda/status";
import { startOfDay, addDays, startOfWeek, fmtDate } from "@/components/doctor/shared";
import { BlockSlotDialog } from "@/components/doctor/BlockSlotDialog";
import { QuickPatientDialog } from "@/components/doctor/QuickPatientDialog";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AgendaTab({ userId }: { userId: string }) {
  const [view, setView] = useState<"day" | "week">("day");
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const [turnoOpen, setTurnoOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [promotingBlockId, setPromotingBlockId] = useState<string | null>(null);

  const { data: doctorId } = useQuery({
    queryKey: ["my-doctor-id", userId],
    queryFn: () => getDoctorIdByUserId(),
  });

  const isTabVisible = useTabVisible();
  const queryClient = useQueryClient();
  const doctorApptsKey = ["doctor-appts", userId];

  const {
    data: appts,
    refetch,
    isLoading,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: doctorApptsKey,
    enabled: !!doctorId,
    refetchInterval: isTabVisible ? 45_000 : false,
    queryFn: async () => {
      const all = await getDoctorAppointments();
      return all as AgendaAppt[];
    },
  });

  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) };
    const from = startOfWeek(cursor);
    return { from, to: addDays(from, 7) };
  }, [view, cursor]);

  const filtered = useMemo(
    () =>
      (appts ?? []).filter((a) => {
        const t = new Date(a.scheduledAt);
        return t >= range.from && t < range.to;
      }),
    [appts, range],
  );

  const rangeFrom = toYMD(range.from);
  const rangeTo = toYMD(addDays(range.to, -1));

  const { data: timeBlocks, refetch: refetchBlocks } = useQuery({
    queryKey: ["my-time-blocks", rangeFrom, rangeTo],
    queryFn: () => getMyTimeBlocks({ data: { from: rangeFrom, to: rangeTo } }),
  });

  const handleDeleteBlock = async (id: string) => {
    try {
      await deleteTimeBlock({ data: { blockId: id } });
      toast.success("Bloqueo eliminado");
      refetchBlocks();
    } catch (e) {
      toastError(e, "No se pudo eliminar el bloqueo");
    }
  };

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: AgendaAppt["status"] }) =>
      updateAppointmentStatus({ data: { appointmentId: vars.id, status: vars.status } }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: doctorApptsKey });
      const previous = queryClient.getQueryData<AgendaAppt[]>(doctorApptsKey);
      queryClient.setQueryData<AgendaAppt[]>(doctorApptsKey, (old) =>
        old?.map((a) => (a.id === vars.id ? { ...a, status: vars.status } : a)),
      );
      return { previous };
    },
    onSuccess: () => toast.success("Turno actualizado"),
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(doctorApptsKey, ctx.previous);
      toastError(err, "Error al actualizar el turno");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: doctorApptsKey });
    },
  });

  const updateStatus = (id: string, status: AgendaAppt["status"]) => {
    if (pendingIds.has(id)) return;
    setPendingIds((prev) => new Set(prev).add(id));
    statusMutation.mutate(
      { id, status },
      {
        onSettled: () => {
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    );
  };

  const move = (n: number) => setCursor(addDays(cursor, view === "day" ? n : n * 7));

  return (
    <div className="mt-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <Tabs value={view} onValueChange={(v) => setView(v as "day" | "week")}>
          <TabsList>
            <TabsTrigger value="day">Día</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
          </TabsList>
        </Tabs>
        {doctorId && (
          <>
            <Button onClick={() => setTurnoOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nuevo turno
            </Button>
            <Button variant="outline" onClick={() => setBlockOpen(true)} className="min-h-[44px]">
              <Ban className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Bloquear horario</span>
            </Button>
            <DoctorNewTurnoDialog
              doctorId={doctorId}
              open={turnoOpen}
              onOpenChange={setTurnoOpen}
              onCreated={refetch}
            />
            <BlockSlotDialog
              open={blockOpen}
              onOpenChange={setBlockOpen}
              defaultDate={toYMD(cursor)}
              onCreated={refetchBlocks}
            />
          </>
        )}
      </div>

      <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4">
        <Button variant="ghost" size="icon" onClick={() => move(-1)} aria-label="Anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-col items-center">
          <div className="font-display text-xl capitalize">
            {view === "day"
              ? fmtDate(cursor)
              : `${startOfWeek(cursor).toLocaleDateString("es-AR", { day: "numeric", month: "short" })} – ${addDays(startOfWeek(cursor), 6).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => setCursor(startOfDay(new Date()))}
            >
              Hoy
            </button>
            <FreshnessIndicator
              updatedAt={dataUpdatedAt}
              isFetching={isFetching}
              onRefresh={() => refetch()}
            />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => move(1)} aria-label="Siguiente">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 rounded-2xl border border-border bg-background p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : view === "day" ? (
        <DayGrid
          date={cursor}
          appts={filtered}
          variant="doctor"
          onUpdateStatus={updateStatus}
          onChanged={refetch}
          pendingIds={pendingIds}
          blocks={timeBlocks ?? []}
          onDeleteBlock={handleDeleteBlock}
          onAddPatientBlock={setPromotingBlockId}
        />
      ) : (
        <WeekView
          from={startOfWeek(cursor)}
          appts={filtered}
          onPickDay={(d) => {
            setCursor(d);
            setView("day");
          }}
        />
      )}

      <QuickPatientDialog
        blockId={promotingBlockId}
        onOpenChange={(v) => {
          if (!v) setPromotingBlockId(null);
        }}
        onPromoted={() => {
          setPromotingBlockId(null);
          refetchBlocks();
          refetch();
        }}
      />
    </div>
  );
}

function DoctorNewTurnoDialog({
  doctorId,
  open,
  onOpenChange,
  onCreated,
}: {
  doctorId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<"patient" | "details">("patient");
  const [searchTerm, setSearchTerm] = useState("");
  const [patients, setPatients] = useState<
    {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      documentNumber: string | null;
    }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  } | null>(null);

  const [specialties, setSpecialties] = useState<{ id: string; name: string }[]>([]);
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: doctorProfile } = useQuery({
    queryKey: ["my-doctor-profile", doctorId],
    queryFn: () => getMyDoctorProfile(),
    enabled: open,
  });
  const slotMinutes = doctorProfile?.slotMinutes ?? 30;

  const doSearch = useCallback(async (term: string) => {
    if (term.length < 2) {
      setPatients([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchPatients({ data: { search: term } });
      setPatients(res);
    } catch {
      setPatients([]);
    }
    setSearching(false);
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(searchTerm), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, doSearch]);

  useEffect(() => {
    if (!open) {
      setStep("patient");
      setSearchTerm("");
      setPatients([]);
      setSelectedPatient(null);
      setSelectedSpecialtyId("");
      setSelectedDate("");
      setSlots([]);
      setSelectedSlot("");
    }
  }, [open]);

  useEffect(() => {
    getAllSpecialties()
      .then((s) => {
        setSpecialties(s);
        if (s.length === 1) setSelectedSpecialtyId(s[0].id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      setSelectedSlot("");
      return;
    }
    const loadSlots = async () => {
      try {
        const schedule = await getDoctorSchedule({ data: { doctorId } });
        const [yr, mo, dy] = selectedDate.split("-").map(Number);
        const date = new Date(yr, mo - 1, dy);

        const { appointments: existing, blocks } = await getDayAppointments({
          data: { doctorId, date: selectedDate },
        });
        const occupied = [
          ...(existing ?? [])
            .filter((a) => a.scheduledAt && a.status !== "cancelado")
            .map((a) => {
              const start = new Date(a.scheduledAt);
              const dur = Number(a.durationMinutes ?? slotMinutes) || slotMinutes;
              const end = new Date(start.getTime() + dur * 60_000);
              return { start, end };
            }),
          ...blocksToOccupied(
            (blocks ?? []).map((b) => ({ startAt: new Date(b.startAt), endAt: new Date(b.endAt) })),
          ),
        ];

        setSlots(
          generateSlots({
            date,
            schedule: schedule ?? [],
            occupied,
            slotMinutes,
            now: new Date(),
          }),
        );
      } catch {
        setSlots([]);
      }
    };
    loadSlots();
  }, [doctorId, selectedDate, slotMinutes]);

  const handleSubmit = async () => {
    if (!selectedPatient || !selectedSlot || !selectedDate || !selectedSpecialtyId) return;
    setSubmitting(true);
    try {
      const scheduledAt = new Date(selectedSlot);
      await bookAppointment({
        data: {
          patientId: selectedPatient.id,
          doctorId,
          specialtyId: selectedSpecialtyId,
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: slotMinutes,
        },
      });
      toast.success("Turno creado");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toastError(e, "Error al crear el turno");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "patient" ? "Seleccionar paciente" : "Detalles del turno"}
          </DialogTitle>
        </DialogHeader>

        {step === "patient" ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar paciente por nombre, email o DNI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>

            {searching && <p className="text-center text-sm text-muted-foreground">Buscando...</p>}

            {selectedPatient && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">
                    {selectedPatient.firstName} {selectedPatient.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedPatient.email}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedPatient(null);
                    setSearchTerm("");
                  }}
                >
                  Cambiar
                </Button>
              </div>
            )}

            {!selectedPatient &&
              patients.length > 0 &&
              patients.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setSelectedPatient({
                      id: p.id,
                      firstName: p.firstName,
                      lastName: p.lastName,
                      email: p.email,
                      phone: p.phone,
                    });
                    setPatients([]);
                    setSearchTerm("");
                  }}
                >
                  <p className="text-sm font-medium">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </button>
              ))}

            {!selectedPatient && searchTerm.length >= 2 && !searching && patients.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                No se encontraron pacientes con ese criterio.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button disabled={!selectedPatient} onClick={() => setStep("details")}>
                Siguiente
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedPatient && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium">
                  {selectedPatient.firstName} {selectedPatient.lastName}
                </p>
                <p className="text-xs text-muted-foreground">{selectedPatient.email}</p>
              </div>
            )}

            <div>
              <Label>Especialidad</Label>
              <Select value={selectedSpecialtyId} onValueChange={setSelectedSpecialtyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar especialidad" />
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

            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlot("");
                }}
              />
            </div>

            {selectedDate && slots.length > 0 && (
              <div>
                <Label>Horario</Label>
                <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {slots.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      disabled={!s.available}
                      className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
                        selectedSlot === s.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : s.available
                            ? "border-border hover:border-primary hover:bg-primary/5"
                            : "border-border cursor-not-allowed text-muted-foreground/40 line-through"
                      }`}
                      onClick={() => setSelectedSlot(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedDate && slots.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay horarios disponibles para esta fecha.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("patient")}>
                Atrás
              </Button>
              <Button
                disabled={!selectedSpecialtyId || !selectedSlot || submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Creando..." : "Confirmar turno"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
