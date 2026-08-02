import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { getMyDoctorProfile, updateMyInsurance } from "@/lib/api/doctor-schedule.functions";

export function ObrasSocialesTab({ userId }: { userId: string }) {
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
