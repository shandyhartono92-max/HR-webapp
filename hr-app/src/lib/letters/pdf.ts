import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

// A4 letter layout with pdf-lib's built-in Helvetica (no font files to ship).
// Helvetica uses WinAnsi encoding, which covers Indonesian text; anything
// outside it (emoji, CJK) is replaced so rendering never throws.

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { x: 64, top: 56, bottom: 64 };
const BODY_SIZE = 10.5;
const LINE = 15;
const LABEL_COL = 150; // width of the "Label" column in key–value rows
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.4, 0.43, 0.48);

export type LetterPdfInput = {
  company: { name: string; address: string; city: string };
  title: string;
  letterNumber: string;
  body: string; // already filled
  dateLine: string; // "Bandung, 30 Oktober 2026"
  signatory: { name: string; title: string };
  acknowledgementName?: string; // SP: recipient signs "Diterima oleh"
};

const WIN_ANSI_EXTRA = "–—‘’“”•…€™";
function clean(text: string) {
  return [...text.normalize("NFC")]
    .map((ch) => (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.includes(ch) ? ch : "?"))
    .join("")
    .replace(/\t/g, " ");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderLetterPdf(input: LetterPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.title} ${input.letterNumber}`);
  pdf.setAuthor(input.company.name);
  pdf.setCreator("Portal HR");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = A4.width - MARGIN.x * 2;

  let page: PDFPage = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN.top;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN.bottom) {
      page = pdf.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN.top;
    }
  };
  const text = (s: string, x: number, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(clean(s), { x, y, font: opts.font ?? regular, size: opts.size ?? BODY_SIZE, color: opts.color ?? INK });
  const centered = (s: string, font: PDFFont, size: number) => {
    const w = font.widthOfTextAtSize(clean(s), size);
    text(s, (A4.width - w) / 2, { font, size });
    return w;
  };

  // Letterhead
  text(input.company.name, MARGIN.x, { font: bold, size: 15 });
  y -= 14;
  for (const line of wrap(clean(input.company.address), regular, 9, contentWidth)) {
    text(line, MARGIN.x, { size: 9, color: MUTED });
    y -= 11;
  }
  y -= 2;
  page.drawLine({ start: { x: MARGIN.x, y }, end: { x: A4.width - MARGIN.x, y }, thickness: 1.2, color: INK });
  y -= 30;

  // Title + number
  const titleWidth = centered(input.title, bold, 12);
  page.drawLine({
    start: { x: (A4.width - titleWidth) / 2, y: y - 2 },
    end: { x: (A4.width + titleWidth) / 2, y: y - 2 },
    thickness: 0.7,
    color: INK,
  });
  y -= 15;
  centered(`Nomor: ${input.letterNumber}`, regular, 10);
  y -= 30;

  // Body
  const paragraphs = clean(input.body).split(/\n\s*\n/);
  for (const para of paragraphs) {
    for (const rawLine of para.split("\n")) {
      const kv = rawLine.match(/^(.{1,40}?)\s+:\s+(.*)$/);
      if (kv) {
        const valueLines = wrap(kv[2], regular, BODY_SIZE, contentWidth - LABEL_COL - 12);
        ensureSpace(valueLines.length * LINE);
        text(kv[1], MARGIN.x + 16);
        text(":", MARGIN.x + LABEL_COL);
        for (const v of valueLines) {
          text(v, MARGIN.x + LABEL_COL + 10);
          y -= LINE;
        }
      } else {
        for (const line of wrap(rawLine, regular, BODY_SIZE, contentWidth)) {
          ensureSpace(LINE);
          text(line, MARGIN.x);
          y -= LINE;
        }
      }
    }
    y -= LINE * 0.6;
  }

  // Signature block (kept together on one page)
  ensureSpace(150);
  y -= 10;
  const rightX = A4.width - MARGIN.x - 190;
  text(input.dateLine, rightX);
  y -= LINE;
  text("Hormat kami,", rightX);
  if (input.acknowledgementName) text("Diterima oleh,", MARGIN.x);
  y -= LINE;
  text(input.company.name, rightX, { size: 9.5 });
  y -= 70;
  text(input.signatory.name, rightX, { font: bold });
  const sigW = bold.widthOfTextAtSize(clean(input.signatory.name), BODY_SIZE);
  page.drawLine({ start: { x: rightX, y: y - 2 }, end: { x: rightX + sigW, y: y - 2 }, thickness: 0.6, color: INK });
  if (input.acknowledgementName) {
    text(input.acknowledgementName, MARGIN.x, { font: bold });
    const ackW = bold.widthOfTextAtSize(clean(input.acknowledgementName), BODY_SIZE);
    page.drawLine({ start: { x: MARGIN.x, y: y - 2 }, end: { x: MARGIN.x + ackW, y: y - 2 }, thickness: 0.6, color: INK });
  }
  y -= LINE;
  text(input.signatory.title, rightX, { size: 9.5, color: MUTED });
  if (input.acknowledgementName) text("Tanggal: ____________", MARGIN.x, { size: 9.5, color: MUTED });

  // Footer on every page
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const footer = clean(`${input.letterNumber} · Halaman ${i + 1} dari ${pages.length}`);
    p.drawText(footer, { x: MARGIN.x, y: 32, size: 8, font: regular, color: MUTED });
  });

  return Buffer.from(await pdf.save());
}
