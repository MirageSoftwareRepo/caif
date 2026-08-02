import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { getMySchedule, updateMySchedule } from "@/lib/api/doctor-schedule.functions";
import { DAYS, DAYS_FULL } from "@/components/doctor/shared";

type ScheduleEntry = {
  weekday: number;
  startTime: string;
  endTime: string;
};

export function HorariosTab({ userId }: { userId: string }) {
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
