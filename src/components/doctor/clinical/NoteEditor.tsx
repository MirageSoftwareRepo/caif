import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading3,
  Heading4,
  Undo2,
  Redo2,
  ShieldAlert,
  PenLine,
  Mic,
  MicOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toastError";
import { autosaveNote } from "@/lib/api/clinical-notes.functions";
import { useDictation } from "@/hooks/useDictation";
import { SignDialog } from "./SignDialog";
import { TEMPLATES, type ClinicalNote } from "./types";

const AUTOSAVE_DELAY_MS = 10_000;

function toDateInputValue(d: string | Date | null) {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function NoteEditor({
  note,
  onSaved,
  onSigned,
}: {
  note: ClinicalNote;
  onSaved: (note: ClinicalNote) => void;
  onSigned: () => void;
}) {
  const [motivo, setMotivo] = useState(note.motivo ?? "");
  const [diagnostico, setDiagnostico] = useState(note.diagnostico ?? "");
  const [proximoControl, setProximoControl] = useState(toDateInputValue(note.proximoControl));
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  // El autosave diferido y el flush al desmontar tienen que llamar SIEMPRE a la
  // ultima version de save(): un setTimeout captura el closure del render en que
  // se programo, y si entre medio el medico toco Motivo o Diagnostico, ese closure
  // guardaria los valores viejos y pisaria lo que acaba de escribir.
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const editor = useEditor({
    extensions: [StarterKit],
    content: note.bodyHtml ?? "",
    immediatelyRender: false,
    onUpdate: () => scheduleSave(),
  });

  // Dictado (§7): el texto final se inserta en el borrador y nunca dispara la
  // firma (D11) — solo llama a scheduleSave, igual que tipear a mano.
  const dictation = useDictation((text) => {
    editor?.chain().focus().insertContent(text + " ").run();
    scheduleSave();
  });

  // Al desmontar (cambio de nota, cambio de paciente, salir de la pestaña) hay que
  // vaciar lo que quedo pendiente: cancelar el timer a secas tiraba a la basura
  // hasta 10 segundos de lo que el medico habia escrito.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingRef.current) void saveRef.current();
    };
  }, [note.id]);

  function scheduleSave() {
    pendingRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_DELAY_MS);
  }

  async function save() {
    if (!pendingRef.current || !editor) return;
    pendingRef.current = false;
    setSaving(true);
    try {
      const updated = await autosaveNote({
        data: {
          noteId: note.id,
          motivo,
          diagnostico,
          proximoControl: proximoControl ? new Date(proximoControl).toISOString() : null,
          bodyHtml: editor.getHTML(),
        },
      });
      onSaved({ ...note, ...updated });
      setLastSavedAt(new Date());
    } catch (err) {
      toastError(err, "No se pudo guardar el borrador");
    }
    setSaving(false);
  }

  saveRef.current = save;

  function markDirty() {
    pendingRef.current = true;
  }

  const insertTemplate = (text: string) => {
    editor?.chain().focus().insertContent(text).run();
    scheduleSave();
  };

  if (note.status === "firmada") {
    return null; // firmada -> se muestra con NoteViewer, no acá
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          El paciente podrá leer esta nota una vez firmada (según la visibilidad que elijas al
          firmar).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Motivo de consulta</Label>
          <Input
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              markDirty();
            }}
            onBlur={() => void save()}
          />
        </div>
        <div>
          <Label>Diagnóstico</Label>
          <Input
            value={diagnostico}
            onChange={(e) => {
              setDiagnostico(e.target.value);
              markDirty();
            }}
            onBlur={() => void save()}
          />
        </div>
        <div>
          <Label>Próximo control</Label>
          <Input
            type="date"
            value={proximoControl}
            onChange={(e) => {
              setProximoControl(e.target.value);
              markDirty();
            }}
            onBlur={() => void save()}
          />
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block">Nota</Label>
        <div className="rounded-lg border border-border">
          <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
            <ToolbarButton
              active={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              icon={Bold}
              label="Negrita"
            />
            <ToolbarButton
              active={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              icon={Italic}
              label="Itálica"
            />
            <ToolbarButton
              active={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              icon={UnderlineIcon}
              label="Subrayado"
            />
            <ToolbarButton
              active={editor?.isActive("bulletList")}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              icon={List}
              label="Lista"
            />
            <ToolbarButton
              active={editor?.isActive("orderedList")}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              icon={ListOrdered}
              label="Lista numerada"
            />
            <ToolbarButton
              active={editor?.isActive("heading", { level: 3 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              icon={Heading3}
              label="Título"
            />
            <ToolbarButton
              active={editor?.isActive("heading", { level: 4 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()}
              icon={Heading4}
              label="Subtítulo"
            />
            <div className="mx-1 h-5 w-px bg-border" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().undo().run()}
              icon={Undo2}
              label="Deshacer"
            />
            <ToolbarButton
              onClick={() => editor?.chain().focus().redo().run()}
              icon={Redo2}
              label="Rehacer"
            />
            {dictation.isSupported && (
              <>
                <div className="mx-1 h-5 w-px bg-border" />
                <ToolbarButton
                  active={dictation.isListening}
                  onClick={() => (dictation.isListening ? dictation.stop() : dictation.start())}
                  icon={dictation.isListening ? MicOff : Mic}
                  label={dictation.isListening ? "Detener dictado" : "Dictar"}
                />
                {dictation.isListening && (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                    Grabando
                  </span>
                )}
              </>
            )}
          </div>
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none px-3 py-2 focus:outline-none [&_.ProseMirror]:min-h-[180px] [&_.ProseMirror]:outline-none"
            aria-label="Cuerpo de la nota clínica"
            role="textbox"
            onBlur={() => void save()}
          />
          {dictation.isListening && (
            <p className="border-t border-border px-3 py-1.5 text-sm italic text-muted-foreground" aria-live="polite">
              {dictation.interimText || "Escuchando..."}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs text-muted-foreground">Frases frecuentes</Label>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => insertTemplate(t)}
            >
              {t.trim()}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {saving
            ? "Guardando..."
            : lastSavedAt
              ? `Guardado ${lastSavedAt.toLocaleTimeString("es-AR")}`
              : "Sin guardar todavía"}
        </span>
        <Button onClick={() => setSignOpen(true)}>
          <PenLine className="mr-2 h-4 w-4" /> Firmar nota
        </Button>
      </div>

      <SignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        noteId={note.id}
        onBeforeSign={save}
        onSigned={onSigned}
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon: Icon,
  label,
  active,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className="h-8 w-8 p-0"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
