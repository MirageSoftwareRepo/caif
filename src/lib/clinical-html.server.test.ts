import { describe, it, expect } from "vitest";
import { sanitizeClinicalHtml, deriveBodyText } from "./clinical-html.server";

describe("sanitizeClinicalHtml", () => {
  it("elimina tags de script por completo, no solo escapa", () => {
    const out = sanitizeClinicalHtml("<p>Hola</p><script>alert(1)</script>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("Hola");
  });

  it("elimina atributos style/class/onerror aunque el tag esté permitido", () => {
    const out = sanitizeClinicalHtml(
      '<p style="color:red" class="x" onclick="evil()">texto</p><img src=x onerror="evil()">',
    );
    expect(out).not.toContain("style");
    expect(out).not.toContain("class");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<img");
  });

  it("conserva la lista de tags permitidos", () => {
    const html =
      "<h3>Motivo</h3><p><strong>bold</strong> <em>italic</em> <u>underline</u></p><ul><li>uno</li></ul>";
    const out = sanitizeClinicalHtml(html);
    expect(out).toContain("<h3>");
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain("<u>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>");
  });

  it("descarta tags no permitidos (tablas, imágenes) sin romper el resto", () => {
    const out = sanitizeClinicalHtml("<table><tr><td>x</td></tr></table><p>ok</p>");
    expect(out).not.toContain("<table");
    expect(out).toContain("<p>ok</p>");
  });
});

describe("deriveBodyText", () => {
  it("despoja todas las etiquetas dejando solo el texto", () => {
    const html = "<h3>Motivo</h3><p><strong>Dolor</strong> de cabeza</p>";
    expect(deriveBodyText(html)).toBe("Motivo Dolor de cabeza");
  });

  it("normaliza espacios múltiples", () => {
    const html = "<p>uno</p>\n\n<p>dos</p>";
    expect(deriveBodyText(html)).toBe("uno dos");
  });
});
