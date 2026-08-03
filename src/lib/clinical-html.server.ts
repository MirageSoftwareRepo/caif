import sanitizeHtml from "sanitize-html";

// Sanitización server-side del cuerpo de una nota clínica (Plan 10, Fase 2, §6).
// Allowlist cerrada: nada de `style`/`class`/tablas/imágenes. HTML de usuario
// guardado y luego renderizado al paciente es XSS directo si no se sanitiza acá;
// la sanitización del cliente no cuenta porque la server fn se puede llamar sola.
const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h3", "h4"];

export function sanitizeClinicalHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
}

// bodyText es el espejo en texto plano de bodyHtml ya sanitizado, para
// full-text search (índice GIN, ver migración de la Fase 2). Se deriva
// despojando todas las etiquetas.
export function deriveBodyText(sanitizedHtml: string): string {
  // El input ya pasó por sanitizeClinicalHtml (allowlist cerrada), así que un
  // strip por regex es seguro acá. Cada tag se reemplaza por un espacio para
  // no pegar palabras de bloques adyacentes (p ej. "</h3><p>" → "Motivo Dolor").
  return sanitizedHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
