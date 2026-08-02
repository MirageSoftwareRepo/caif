import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  User,
  Settings2,
  X,
  Building2,
  Plus,
  FileText,
  Search,
  Smartphone,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  getDoctorAppointments,
  updateAppointmentStatus,
  bookAppointment,
  getDayAppointments,
} from "@/lib/api/appointments.functions";
import {
  getMySchedule,
  updateMySchedule,
  getDoctorIdByUserId,
  getMyDoctorProfile,
  updateMyInsurance,
  updateMyBio,
  updateMyWhatsappPreference,
  updateMyDirectBooking,
} from "@/lib/api/doctor-schedule.functions";
import { searchPatients } from "@/lib/api/admin-users.functions";
import { getAllSpecialties } from "@/lib/api/specialties.functions";
import { generateSlots, type Slot } from "@/lib/slots";
import { ProfileEditor } from "@/components/ProfileEditor";
import { toastError } from "@/lib/toastError";
import { Switch } from "@/components/ui/switch";
import { isValidArPhone } from "@/lib/phone";
import { DayGrid } from "@/components/agenda/DayGrid";
import { WeekView } from "@/components/agenda/WeekView";
import { FreshnessIndicator } from "@/components/agenda/FreshnessIndicator";
import { Skeleton } from "@/components/ui/skeleton";
import { useTabVisible } from "@/lib/useTabVisible";
import type { AgendaAppt } from "@/components/agenda/status";
import { ArchivosTab } from "@/components/doctor/ArchivosTab";
import {
  DAYS,
  DAYS_FULL,
  startOfDay,
  addDays,
  startOfWeek,
  fmtDate,
  fmtTime,
} from "@/components/doctor/shared";

export const Route = createFileRoute("/doctor")({
  head: () => ({ meta: [{ title: "Mi Agenda · CAIF" }] }),
  component: DoctorPanel,
});

type ScheduleEntry = {
  weekday: number;
  startTime: string;
  endTime: string;
};

function DoctorWhatsAppToggle({ userId }: { userId: string }) {
  const { data: doctor, isLoading } = useQuery({
    queryKey: ["my-doctor-profile", userId],
    queryFn: () => getMyDoctorProfile(),
  });

  const queryClient = useQueryClient();

  const toggleWhatsApp = useMutation({
    mutationFn: (enabled: boolean) => updateMyWhatsappPreference({ data: { enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-doctor-profile", userId] });
      toast.success(
        doctor?.whatsappNotifications
          ? "Notificaciones de WhatsApp desactivadas"
          : "Notificaciones de WhatsApp activadas",
      );
    },
    onError: () => {
      toast.error("Error al actualizar preferencia");
    },
  });

  const whatsappEnabled = doctor?.whatsappNotifications ?? false;

  return (
    <div className="rounded-2xl border border-border bg-background p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-lg">Notificaciones por WhatsApp</h3>
            <p className="text-sm text-muted-foreground">
              Recibí tu listado de turnos del día siguiente a las 21:00 ARG
            </p>
          </div>
        </div>
        <Switch
          checked={whatsappEnabled}
          onCheckedChange={(checked) => toggleWhatsApp.mutate(checked)}
          disabled={toggleWhatsApp.isPending || isLoading}
        />
      </div>
      {whatsappEnabled && (
        <p className="mt-3 text-xs text-teal">
          ✓ Activado — mañana recibirás tus turnos por WhatsApp
        </p>
      )}
    </div>
  );
}

function DoctorDirectBookingToggle({ userId }: { userId: string }) {
  const { data: doctor, isLoading } = useQuery({
    queryKey: ["my-doctor-profile", userId],
    queryFn: () => getMyDoctorProfile(),
  });

  const queryClient = useQueryClient();

  const toggleDirectBooking = useMutation({
    mutationFn: (enabled: boolean) => updateMyDirectBooking({ data: { enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-doctor-profile", userId] });
      toast.success(
        doctor?.directBooking ? "WhatsApp directo desactivado" : "WhatsApp directo activado",
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error al actualizar preferencia");
    },
  });

  const directBookingEnabled = doctor?.directBooking ?? false;
  const phoneValid = isValidArPhone(doctor?.user?.phone ?? "");

  return (
    <div className="rounded-2xl border border-border bg-background p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-lg">Coordinar turnos por WhatsApp directo</h3>
            <p className="text-sm text-muted-foreground">
              Los pacientes verán tu WhatsApp en lugar del calendario para sacar turno.
            </p>
          </div>
        </div>
        <Switch
          checked={directBookingEnabled}
          onCheckedChange={(checked) => toggleDirectBooking.mutate(checked)}
          disabled={
            toggleDirectBooking.isPending || isLoading || (!directBookingEnabled && !phoneValid)
          }
        />
      </div>
      {directBookingEnabled && (
        <p className="mt-3 text-xs text-teal">
          ✓ Activado — los pacientes coordinan por WhatsApp en vez de reservar en el sistema
        </p>
      )}
      {!directBookingEnabled && !phoneValid && !isLoading && (
        <p className="mt-3 text-xs text-destructive">
          Tu teléfono no tiene un formato válido. Corregilo en "Perfil" para poder activar esto.
        </p>
      )}
    </div>
  );
}

function DoctorPanel() {
  const { user, loading, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (!hasRole("medico")) {
    return (
      <div className="min-h-screen bg-surface">
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Acceso restringido</h1>
          <p className="mt-2 text-muted-foreground">
            Solo los médicos pueden acceder a este panel.
          </p>
          <Button className="mt-6" onClick={() => navigate({ to: "/dashboard" })}>
            Volver
          </Button>
        </main>
      </div>
    );
  }

  return (
    <DashboardLayout title="Mi Agenda" description="Gestioná tus turnos y horarios.">
      <Tabs defaultValue="agenda">
        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="agenda" className="gap-1 sm:gap-2">
              <CalendarDays className="h-4 w-4 shrink-0" />{" "}
              <span className="hidden sm:inline">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="horarios" className="gap-1 sm:gap-2">
              <Settings2 className="h-4 w-4 shrink-0" />{" "}
              <span className="hidden sm:inline">Horarios</span>
            </TabsTrigger>
            <TabsTrigger value="obras-sociales" className="gap-1 sm:gap-2">
              <Building2 className="h-4 w-4 shrink-0" />{" "}
              <span className="hidden sm:inline">Obras Sociales</span>
            </TabsTrigger>
            <TabsTrigger value="fichas" className="gap-1 sm:gap-2">
              <FileText className="h-4 w-4 shrink-0" />{" "}
              <span className="hidden sm:inline">Archivos</span>
            </TabsTrigger>
            <TabsTrigger value="descripcion" className="gap-1 sm:gap-2">
              <User className="h-4 w-4 shrink-0" />{" "}
              <span className="hidden sm:inline">Descripción</span>
            </TabsTrigger>
            <TabsTrigger value="perfil" className="gap-1 sm:gap-2">
              <User className="h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Perfil</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="agenda">
          <AgendaTab userId={user.id} />
        </TabsContent>
        <TabsContent value="horarios">
          <ScheduleTab userId={user.id} />
        </TabsContent>
        <TabsContent value="obras-sociales">
          <InsuranceTab userId={user.id} />
        </TabsContent>
        <TabsContent value="fichas">
          <ArchivosTab userId={user.id} />
        </TabsContent>
        <TabsContent value="descripcion">
          <DescriptionTab userId={user.id} />
        </TabsContent>
        <TabsContent value="perfil">
          <div className="mt-6 space-y-6">
            <ProfileEditor />
            <DoctorWhatsAppToggle userId={user!.id} />
            <DoctorDirectBookingToggle userId={user!.id} />
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

function AgendaTab({ userId }: { userId: string }) {
  const [view, setView] = useState<"day" | "week">("day");
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const [turnoOpen, setTurnoOpen] = useState(false);

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
            <DoctorNewTurnoDialog
              doctorId={doctorId}
              open={turnoOpen}
              onOpenChange={setTurnoOpen}
              onCreated={refetch}
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
    </div>
  );
}

function InsuranceTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-doctor-profile", userId],
    queryFn: () => getMyDoctorProfile(),
  });

  useEffect(() => {
    if (profile?.insuranceCompanies && !loaded) {
      setItems(profile.insuranceCompanies);
      setLoaded(true);
    }
  }, [profile, loaded]);

  const addItem = () => {
    const v = inputVal.trim().toLowerCase();
    if (v && !items.includes(v)) setItems((p) => [...p, v]);
    setInputVal("");
  };

  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  const save = async () => {
    try {
      await updateMyInsurance({ data: { insuranceCompanies: items } });
      toast.success("Obras sociales guardadas");
    } catch (err) {
      toastError(err, "Error al guardar");
    }
  };

  const specialtiesList =
    profile?.specialties
      ?.map((s) => s.specialty?.name)
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-border bg-background p-6">
        <h3 className="font-display mb-1 text-lg">Obras Sociales</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {specialtiesList !== "—" && (
            <>
              Especialidades: <span className="text-foreground font-medium">{specialtiesList}</span>{" "}
              ·{" "}
            </>
          )}
          Gestioná las obras sociales con las que trabajás
        </p>
        {isLoading ? (
          <div className="text-muted-foreground">Cargando...</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {items.map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {item}
                  <button
                    onClick={() => removeItem(i)}
                    className="ml-1 text-primary/60 hover:text-primary"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
                placeholder="Ej: ipross, osde, galeno..."
                className="max-w-xs"
              />
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={save}>Guardar</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ScheduleTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const { data: serverSchedules, isLoading } = useQuery({
    queryKey: ["my-schedule", userId],
    queryFn: () => getMySchedule(),
  });

  useEffect(() => {
    if (serverSchedules && !loaded) {
      setSchedules(
        serverSchedules.map((s) => ({
          weekday: s.weekday,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      );
      setLoaded(true);
    }
  }, [serverSchedules, loaded]);

  const addSlot = (weekday: number) => {
    setSchedules((prev) => [...prev, { weekday, startTime: "08:00", endTime: "17:00" }]);
  };

  const removeSlot = (index: number) => {
    setSchedules((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof ScheduleEntry, value: string | number) => {
    setSchedules((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const save = async () => {
    try {
      await updateMySchedule({ data: { schedules } });
      queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
      toast.success("Horarios guardados");
    } catch (err) {
      toastError(err, "Error al guardar horarios");
    }
  };

  const byDay = DAYS_FULL.map((_name, weekday) => ({
    weekday,
    label: DAYS[weekday],
    slots: schedules.filter((s) => s.weekday === weekday),
  }));

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-border bg-background p-6">
        <h3 className="font-display mb-4 text-lg">Configurar horarios semanales</h3>
        {isLoading ? (
          <div className="text-muted-foreground">Cargando horarios...</div>
        ) : (
          <div className="space-y-4">
            {byDay.map(({ weekday, label, slots }) => (
              <div key={weekday} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-medium">{label}</h4>
                  <Button size="sm" variant="outline" onClick={() => addSlot(weekday)}>
                    + Agregar
                  </Button>
                </div>
                {slots.length === 0 && <p className="text-xs text-muted-foreground">Sin horario</p>}
                {slots.map((slot, idx) => {
                  const globalIdx = schedules.findIndex(
                    (s, i) => s.weekday === weekday && schedules.indexOf(s) === i,
                  );
                  const actualIdx = schedules.findIndex(
                    (s, i) =>
                      s.weekday === weekday &&
                      schedules.slice(0, i).filter((x) => x.weekday === weekday).length === idx,
                  );
                  return (
                    <div key={idx} className="mb-2 flex items-center gap-3">
                      <Input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateSlot(actualIdx, "startTime", e.target.value)}
                        className="w-24 sm:w-32"
                      />
                      <span className="text-muted-foreground">a</span>
                      <Input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateSlot(actualIdx, "endTime", e.target.value)}
                        className="w-24 sm:w-32"
                      />
                      <Button size="sm" variant="destructive" onClick={() => removeSlot(actualIdx)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <Button onClick={save}>Guardar horarios</Button>
        </div>
      </div>
    </div>
  );
}

function DescriptionTab({ userId }: { userId: string }) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-doctor-profile-bio", userId],
    queryFn: () => getMyDoctorProfile(),
  });

  const [bio, setBio] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile && !loaded) {
      setBio(profile.bio ?? "");
      setLoaded(true);
    }
  }, [profile, loaded]);

  const save = async () => {
    setSaving(true);
    try {
      await updateMyBio({ data: { bio } });
      toast.success("Descripción guardada");
    } catch (err) {
      toastError(err, "Error al guardar la descripción");
    }
    setSaving(false);
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-border bg-background p-6">
        <h3 className="font-display mb-1 text-lg">Descripción profesional</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Esta descripción se muestra a los pacientes al seleccionar un profesional. Ej: "Realizo
          evaluaciones psicodiagnósticas con tests de personalidad (Rorschach, Zulliger)."
        </p>
        {isLoading ? (
          <div className="text-muted-foreground">Cargando...</div>
        ) : (
          <>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[120px] resize-y"
              placeholder="Describí tu enfoque profesional, técnicas que utilizás, etc."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
            />
            <p className="mt-1 text-xs text-muted-foreground">{bio.length}/500 caracteres</p>
            <div className="mt-4 flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? "Guardando..." : "Guardar descripción"}
              </Button>
            </div>
          </>
        )}
      </div>
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
        const { getDoctorSchedule } = await import("@/lib/api/doctor-schedule.functions");
        const schedule = await getDoctorSchedule({ data: { doctorId } });
        const [yr, mo, dy] = selectedDate.split("-").map(Number);
        const date = new Date(yr, mo - 1, dy);

        const existing = await getDayAppointments({
          data: { doctorId, date: selectedDate },
        });
        const occupied = (existing ?? [])
          .filter((a) => a.scheduledAt && a.status !== "cancelado")
          .map((a) => {
            const start = new Date(a.scheduledAt);
            const dur = Number(a.durationMinutes ?? slotMinutes) || slotMinutes;
            const end = new Date(start.getTime() + dur * 60_000);
            return { start, end };
          });

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
