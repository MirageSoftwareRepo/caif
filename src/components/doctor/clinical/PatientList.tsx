import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ClinicalPatient } from "./types";

export function PatientList({
  patients,
  selectedId,
  onSelect,
}: {
  patients: ClinicalPatient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return patients;
    const term = search.toLowerCase();
    return patients.filter((p) => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      return name.includes(term) || (p.documentNumber ?? "").includes(term);
    });
  }, [patients, search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8 text-sm"
          placeholder="Buscar paciente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-[60vh] space-y-1 overflow-y-auto lg:max-h-[70vh]">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">Sin pacientes.</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left text-sm transition-colors",
                selectedId === p.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-primary text-xs font-bold text-primary-foreground">
                {p.firstName[0]}
                {p.lastName[0]}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {p.firstName} {p.lastName}
                </div>
                <div className="text-xs text-muted-foreground">{p.documentNumber ?? "—"}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
