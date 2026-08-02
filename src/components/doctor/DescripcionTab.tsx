import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { getMyDoctorProfile, updateMyBio } from "@/lib/api/doctor-schedule.functions";

export function DescripcionTab({ userId }: { userId: string }) {
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
