import PDFDocument from "pdfkit";
import { getArgentinaTomorrow, type TurneroRow } from "./pdf-turnero";

// Aislado en su propio módulo (P0.3): las queries del turnero (pdf-turnero.ts) NO deben
// importar pdfkit, así el path del cron nocturno no falla si pdfkit no está disponible.

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export async function generateTurneroPDF(rows: TurneroRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const buffers: Buffer[] = [];
    doc.on("data", (b: Buffer) => buffers.push(b));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const title = "Turnero";
    const sub = formatDate(getArgentinaTomorrow());

    doc.font("Helvetica-Bold").fontSize(22).text(title, { align: "center" });
    doc.font("Helvetica").fontSize(12).text(sub, { align: "center" });
    doc.moveDown(1.5);

    if (rows.length === 0) {
      doc.fontSize(14).text("No hay turnos agendados para mañana.", { align: "center" });
    } else {
      const colX = [40, 100, 280, 420];
      const colW = [55, 175, 135, 150];

      const drawHeader = () => {
        doc.font("Helvetica-Bold").fontSize(10);
        const headers = ["Hora", "Paciente", "Médico", "Especialidad"];
        headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: colW[i] }));
        doc.moveDown(0.5);
      };

      doc.x = 40;
      drawHeader();

      doc.font("Helvetica").fontSize(9);
      for (const row of rows) {
        if (doc.y > 720) {
          doc.addPage();
          doc.x = 40;
          drawHeader();
        }
        const y = doc.y;
        doc.text(row.hora, colX[0], y, { width: colW[0] });
        doc.text(row.paciente, colX[1], y, { width: colW[1] });
        doc.text(row.medico, colX[2], y, { width: colW[2] });
        doc.text(row.especialidad, colX[3], y, { width: colW[3] });
        doc.moveDown(0.8);
      }
    }

    const now = new Date();
    const footerText = `Generado el ${now.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;
    doc.fontSize(8).fillColor("#888").text(footerText, 40, 780, { align: "center" });

    doc.end();
  });
}

export type ClinicalNoteForPdf = {
  patientName: string;
  doctorName: string;
  specialtyName: string;
  sessionDate: Date;
  motivo: string | null;
  diagnostico: string | null;
  bodyText: string | null;
  signedAt: Date | null;
  addenda: { authorName: string; createdAt: Date | null; bodyText: string | null }[];
};

// Plan 10, Fase 6 (paso 30). Se usa bodyText (plano) y no bodyHtml: pdfkit no
// renderiza HTML, y el cuerpo de una nota clínica no necesita el formato rico
// para quedar legible en un PDF de una consulta.
export async function generateClinicalNotePDF(note: ClinicalNoteForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const buffers: Buffer[] = [];
    doc.on("data", (b: Buffer) => buffers.push(b));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text("Nota clínica", { align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor("#555").text(note.specialtyName, { align: "center" });
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(11);
    doc.font("Helvetica-Bold").text("Paciente: ", { continued: true }).font("Helvetica").text(note.patientName);
    doc.font("Helvetica-Bold").text("Profesional: ", { continued: true }).font("Helvetica").text(note.doctorName);
    doc
      .font("Helvetica-Bold")
      .text("Fecha: ", { continued: true })
      .font("Helvetica")
      .text(formatDate(note.sessionDate));
    doc.moveDown(1);

    if (note.motivo) {
      doc.font("Helvetica-Bold").text("Motivo de consulta");
      doc.font("Helvetica").text(note.motivo);
      doc.moveDown(0.5);
    }
    if (note.diagnostico) {
      doc.font("Helvetica-Bold").text("Diagnóstico");
      doc.font("Helvetica").text(note.diagnostico);
      doc.moveDown(0.5);
    }

    doc.font("Helvetica-Bold").text("Nota");
    doc.font("Helvetica").text(note.bodyText || "—");
    doc.moveDown(1);

    if (note.addenda.length > 0) {
      doc.font("Helvetica-Bold").text("Addenda");
      for (const a of note.addenda) {
        doc.moveDown(0.3);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(`${a.authorName} — ${a.createdAt ? formatDate(a.createdAt) : ""}`);
        doc.font("Helvetica").fontSize(11).text(a.bodyText || "—");
      }
      doc.moveDown(1);
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(
        note.signedAt
          ? `Firmado digitalmente el ${formatDate(note.signedAt)} por ${note.doctorName}.`
          : "Nota sin firmar.",
      );

    const now = new Date();
    const footerText = `Exportado el ${now.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;
    doc.fontSize(8).fillColor("#888").text(footerText, 50, 780, { align: "center" });

    doc.end();
  });
}
