// Pulls the text (and any filled-in form fields) out of a character document so the
// importer can read it. Everything runs on the device; nothing is uploaded.
//
//   PDF          pdf.js: page text plus form fields (fillable character sheets, D&D Beyond exports)
//   DOCX / ODT   unzipped with fflate; paragraphs and table rows become lines
//   TXT, MD, CSV, JSON, HTML, RTF   read as text
//
// Photos and scans are not supported: reading text from an image needs OCR.

import { strFromU8, unzipSync } from 'fflate';

export interface Extracted {
  text: string;
  /** Form field name → value, from fillable PDFs. */
  fields: Record<string, string>;
  kind: string;
}

export class UnsupportedFile extends Error {}

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

export async function extractFromFile(file: File): Promise<Extracted> {
  const e = ext(file.name);
  const type = file.type;
  if (e === 'pdf' || type === 'application/pdf') return extractPdf(new Uint8Array(await file.arrayBuffer()));
  if (e === 'docx') return { text: docxText(new Uint8Array(await file.arrayBuffer())), fields: {}, kind: 'Word document' };
  if (e === 'odt') return { text: odtText(new Uint8Array(await file.arrayBuffer())), fields: {}, kind: 'OpenDocument text' };
  if (e === 'doc') throw new UnsupportedFile('Old .doc files can’t be read. In Word or Google Docs, save it as .docx or PDF and try again.');
  if (e === 'pages') throw new UnsupportedFile('Pages files can’t be read. In Pages, export it as PDF or Word and try again.');
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'heic', 'webp', 'gif'].includes(e))
    throw new UnsupportedFile('Pictures and scans can’t be read: that needs text recognition. Copy the text and paste it instead, or use a PDF exported from the app you made the sheet in.');
  const raw = await file.text();
  if (e === 'html' || e === 'htm' || type === 'text/html') return { text: htmlText(raw), fields: {}, kind: 'web page' };
  if (e === 'rtf' || raw.startsWith('{\\rtf')) return { text: rtfText(raw), fields: {}, kind: 'RTF document' };
  return { text: raw, fields: {}, kind: 'text' };
}

/** XML entity decoding shared by the Word and OpenDocument readers. */
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function unzipEntry(data: Uint8Array, path: string): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name === path });
  } catch {
    throw new UnsupportedFile('That file looks damaged or isn’t really a Word/OpenDocument file.');
  }
  if (!files[path]) throw new UnsupportedFile('That file has no readable text in it.');
  return strFromU8(files[path]);
}

/** Word: one line per paragraph; table cells joined with " | " so tables stay readable. */
export function docxText(data: Uint8Array): string {
  const xml = unzipEntry(data, 'word/document.xml');
  return decodeXml(
    xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tc>/g, ' | ')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/ \| \n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function odtText(data: Uint8Array): string {
  const xml = unzipEntry(data, 'content.xml');
  return decodeXml(
    xml
      .replace(/<text:tab\/>/g, '\t')
      .replace(/<text:line-break\/>/g, '\n')
      .replace(/<\/text:(p|h)>/g, '\n')
      .replace(/<\/table:table-cell>/g, ' | ')
      .replace(/<\/table:table-row>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/ \| \n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function htmlText(html: string): string {
  return decodeXml(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' '),
  ).replace(/\n{3,}/g, '\n\n');
}

export function rtfText(rtf: string): string {
  return rtf
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

/** Lazily loads pdf.js and runs its parser on the main thread (no separate worker file needed offline). */
async function loadPdfJs() {
  const g = globalThis as unknown as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) g.pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
  return import('pdfjs-dist');
}

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

export async function extractPdf(data: Uint8Array): Promise<Extracted> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const msg = (e as Error).message ?? '';
    throw new UnsupportedFile(/password/i.test(msg) ? 'That PDF is password-protected. Remove the password and try again.' : 'That PDF couldn’t be opened.');
  }
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let line = '';
    let lastY: number | null = null;
    for (const raw of content.items as TextItemLike[]) {
      if (typeof raw.str !== 'string') continue;
      const y = raw.transform ? raw.transform[5] : null;
      // A new baseline means a new line even when the PDF doesn't say so.
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3 && line.trim()) {
        lines.push(line.trim());
        line = '';
      }
      line += (line && !line.endsWith(' ') && raw.str && !raw.str.startsWith(' ') ? ' ' : '') + raw.str;
      if (y !== null) lastY = y;
      if (raw.hasEOL) {
        lines.push(line.trim());
        line = '';
      }
    }
    if (line.trim()) lines.push(line.trim());
    lines.push('');
  }
  // Filled-in form fields live on each page's widgets (fillable sheets, D&D Beyond exports).
  const fields: Record<string, string> = {};
  for (let p = 1; p <= doc.numPages; p++) {
    const annots = (await (await doc.getPage(p)).getAnnotations()) as { subtype?: string; fieldName?: string; fieldValue?: unknown; checkBox?: boolean }[];
    for (const a of annots) {
      if (a.subtype !== 'Widget' || !a.fieldName || a.fieldName in fields) continue;
      const v = a.fieldValue;
      if (v === undefined || v === null || v === '' || v === 'Off' || v === false) continue;
      fields[a.fieldName] = Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : 'Yes';
    }
  }
  await task.destroy();
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  if (!text.trim() && !Object.keys(fields).length)
    throw new UnsupportedFile('That PDF has no text in it: it may be a scan or a photo. Copy the text and paste it instead.');
  return { text, fields, kind: Object.keys(fields).length ? 'fillable PDF' : 'PDF' };
}
