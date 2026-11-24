import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smartphone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ProfileEditor } from "@/components/ProfileEditor";
import { Switch } from "@/components/ui/switch";
import { isValidArPhone } from "@/lib/phone";
import { WHATSAPP_BOT_ENABLED } from "@/lib/features";
import {
  getMyDoctorProfile,
  updateMyWhatsappPreference,
  updateMyDirectBooking,
} from "@/lib/api/doctor-schedule.functions";

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

export function PerfilTab({ userId }: { userId: string }) {
  return (
    <div className="mt-6 space-y-6">
      <ProfileEditor />
      {WHATSAPP_BOT_ENABLED && <DoctorWhatsAppToggle userId={userId} />}
      <DoctorDirectBookingToggle userId={userId} />
    </div>
  );
}
