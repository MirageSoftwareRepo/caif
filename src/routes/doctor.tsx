import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CalendarDays, Settings2, Building2, FileText, User, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AgendaTab } from "@/components/doctor/AgendaTab";
import { HorariosTab } from "@/components/doctor/HorariosTab";
import { ObrasSocialesTab } from "@/components/doctor/ObrasSocialesTab";
import { ArchivosTab } from "@/components/doctor/ArchivosTab";
import { DescripcionTab } from "@/components/doctor/DescripcionTab";
import { PerfilTab } from "@/components/doctor/PerfilTab";
import { HistoriaClinicaTab } from "@/components/doctor/clinical/HistoriaClinicaTab";

export const Route = createFileRoute("/doctor")({
  head: () => ({ meta: [{ title: "Mi Agenda · CAIF" }] }),
  component: DoctorPanel,
});

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
            <TabsTrigger value="historia-clinica" className="gap-1 sm:gap-2">
              <Stethoscope className="h-4 w-4 shrink-0" />{" "}
              <span className="hidden sm:inline">Historia clínica</span>
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
          <HorariosTab userId={user.id} />
        </TabsContent>
        <TabsContent value="obras-sociales">
          <ObrasSocialesTab userId={user.id} />
        </TabsContent>
        <TabsContent value="historia-clinica">
          <HistoriaClinicaTab userId={user.id} />
        </TabsContent>
        <TabsContent value="fichas">
          <ArchivosTab userId={user.id} />
        </TabsContent>
        <TabsContent value="descripcion">
          <DescripcionTab userId={user.id} />
        </TabsContent>
        <TabsContent value="perfil">
          <PerfilTab userId={user!.id} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
