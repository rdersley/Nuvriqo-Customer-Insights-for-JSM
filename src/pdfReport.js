// A Customer Insights report as a PDF, drawn in the browser with jsPDF from a
// plain "model" (the agent page and the portal each build one). Nothing is
// sent anywhere; the file is downloaded like the CSV export.
//
// model: {
//   title, subtitle, generatedAt (Date), kpis: [{ label, value, hint }],
//   chart: { title, points: [{ date, count }] } | null,
//   summary: { heading, text, note } | null, actions: [string],
//   issues: [{ title, summary, count, change, trend: [{ count, days }], when, resolution, examples: [{ key, summary, status }] }],
//   breakdowns: [{ label, values: [{ value, count }] }],
//   timeOfDay: { timeZone, grid: 7x24 } | null,
//   footnote,
// }
import { jsPDF } from 'jspdf';
import { DAYS, hoursOf, peakWindow, windowText } from './timeOfDay.js';

// PDF colours (the document has no CSS; these match the Nuvriqo UI kit).
const C = {
  brand: [12, 102, 228], text: [23, 43, 77], subtle: [98, 111, 134], faint: [140, 155, 171],
  border: [223, 225, 230], panel: [247, 248, 249], band: [11, 58, 153], white: [255, 255, 255],
  up: [127, 95, 1], upBg: [255, 247, 214], down: [33, 110, 78], downBg: [220, 255, 241], newBg: [243, 240, 255], newText: [94, 77, 178],
};
const PAGE = { w: 595.28, h: 841.89, m: 40 };

// The built-in PDF fonts only cover Windows-1252; anything else becomes a
// close ASCII form or "?" so text never turns into garbage.
const CP1252 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const SWAP = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', '≈': '~', '↑': '+', '↓': '-', '→': '->', '←': '<-', '×': 'x', ' ': ' ', ' ': ' ', ' ': ' ' };
export function pdfText(value) {
  return [...String(value ?? '')].map((ch) => {
    if (SWAP[ch]) return SWAP[ch];
    const code = ch.codePointAt(0);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255) || CP1252.has(ch)) return ch;
    if (code === 10) return ch;
    const plain = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return plain && [...plain].every((c) => c.codePointAt(0) < 127) ? plain : '?';
  }).join('');
}

export function buildReportPdf(model) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = PAGE.w - 2 * PAGE.m;
  let y = PAGE.m;
  const set = (size, style = 'normal', colour = C.text) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...colour); };
  const ensure = (h) => { if (y + h > PAGE.h - PAGE.m - 18) { doc.addPage(); y = PAGE.m; } };
  const lines = (text, width, size) => { doc.setFontSize(size); return doc.splitTextToSize(pdfText(text), width); };
  const paragraph = (text, { size = 10, style = 'normal', colour = C.text, width = W, x = PAGE.m, gap = 4 } = {}) => {
    const ls = lines(text, width, size);
    const lh = size * 1.3;
    for (const l of ls) { ensure(lh); set(size, style, colour); doc.text(l, x, y + size); y += lh; }
    y += gap;
  };
  const heading = (text) => { ensure(40); y += 10; set(13, 'bold'); doc.text(pdfText(text), PAGE.m, y + 13); y += 22; };

  // Header band.
  doc.setFillColor(...C.band); doc.rect(0, 0, PAGE.w, 96, 'F');
  set(9, 'bold', C.white); doc.text('NUVRIQO  CUSTOMER INSIGHTS', PAGE.m, 30);
  set(20, 'bold', C.white); doc.text(lines(model.title, W - 140, 20)[0] || '', PAGE.m, 58);
  set(10, 'normal', C.white); doc.text(pdfText(model.subtitle), PAGE.m, 78);
  set(8, 'normal', C.white);
  doc.text(pdfText(`Generated ${model.generatedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`), PAGE.w - PAGE.m, 30, { align: 'right' });
  y = 116;

  // Headline numbers.
  const kpis = (model.kpis || []).slice(0, 4);
  if (kpis.length) {
    const gap = 10;
    const tw = (W - gap * (kpis.length - 1)) / kpis.length;
    kpis.forEach((k, i) => {
      const x = PAGE.m + i * (tw + gap);
      doc.setDrawColor(...C.border); doc.setFillColor(...C.white); doc.roundedRect(x, y, tw, 58, 4, 4, 'FD');
      set(7, 'bold', C.subtle); doc.text(pdfText(k.label).toUpperCase(), x + 10, y + 16);
      set(17, 'bold'); doc.text(pdfText(k.value), x + 10, y + 37);
      set(7.5, 'normal', C.subtle); doc.text(lines(k.hint || '', tw - 20, 7.5)[0] || '', x + 10, y + 50);
    });
    y += 72;
  }

  // Volume chart.
  const pts = model.chart?.points || [];
  if (pts.length > 1) {
    heading(model.chart.title || 'Tickets over time');
    ensure(130);
    const h = 100;
    const max = Math.max(1, ...pts.map((p) => p.count));
    const slot = W / pts.length;
    const every = Math.max(1, Math.ceil(pts.length / 8));
    doc.setDrawColor(...C.border); doc.line(PAGE.m, y + h, PAGE.m + W, y + h);
    pts.forEach((p, i) => {
      const bh = Math.max(1.5, (p.count / max) * (h - 6));
      doc.setFillColor(...C.brand); doc.rect(PAGE.m + i * slot + slot * 0.18, y + h - bh, slot * 0.64, bh, 'F');
      if (i % every === 0) { set(6.5, 'normal', C.faint); doc.text(pdfText(p.date.slice(5)), PAGE.m + i * slot + slot / 2, y + h + 10, { align: 'center' }); }
    });
    set(6.5, 'normal', C.faint); doc.text(String(max), PAGE.m - 4, y + 8, { align: 'right' });
    y += h + 20;
  }

  // Summary and next steps.
  if (model.summary?.text) {
    heading(model.summary.heading || 'Summary');
    paragraph(model.summary.text, { size: 10 });
    if (model.summary.note) paragraph(model.summary.note, { size: 8, colour: C.subtle });
  }
  if (model.actions?.length) {
    heading('Next steps');
    for (const a of model.actions) {
      const ls = lines(a, W - 14, 10);
      ls.forEach((l, i) => { ensure(13); set(10); if (!i) doc.text('•', PAGE.m + 2, y + 10); doc.text(l, PAGE.m + 14, y + 10); y += 13; });
      y += 3;
    }
  }

  // Categories: broad areas (AI), each with its biggest patterns.
  if (model.categories?.length) {
    heading('Issue categories');
    for (const c of model.categories) {
      const detail = lines(c.patterns || '', W - 150, 8);
      ensure(24 + detail.length * 10);
      doc.setDrawColor(...C.border); doc.line(PAGE.m, y, PAGE.m + W, y);
      y += 6;
      set(10.5, 'bold'); doc.text(lines(c.title, W - 150, 10.5)[0] || '', PAGE.m, y + 11);
      set(8, 'normal', C.subtle); doc.text(pdfText(c.share || ''), PAGE.m + W - 100, y + 11, { align: 'right' });
      set(11, 'bold'); doc.text(pdfText(String(c.count)), PAGE.m + W - 50, y + 11, { align: 'right' });
      if (c.change) {
        const [bg, fg] = c.change.kind === 'up' ? [C.upBg, C.up] : c.change.kind === 'down' ? [C.downBg, C.down] : [C.newBg, C.newText];
        doc.setFillColor(...bg); doc.roundedRect(PAGE.m + W - 42, y + 2, 40, 13, 3, 3, 'F');
        set(7.5, 'bold', fg); doc.text(pdfText(c.change.text), PAGE.m + W - 22, y + 11, { align: 'center' });
      }
      y += 16;
      for (const l of detail) { set(8, 'normal', C.subtle); doc.text(l, PAGE.m, y + 8); y += 10; }
      y += 4;
    }
  }

  // Issues.
  if (model.issues?.length) {
    heading(`Recurring issues (${model.issues.length})`);
    for (const issue of model.issues) {
      const summaryLines = issue.summary ? lines(issue.summary, W - 240, 8.5) : [];
      const metaText = [issue.when, issue.resolution].filter(Boolean).join('  ·  ');
      const exampleCount = Math.min(3, issue.examples?.length || 0);
      ensure(30 + summaryLines.length * 11 + (metaText ? 12 : 0) + exampleCount * 11);
      doc.setDrawColor(...C.border); doc.line(PAGE.m, y, PAGE.m + W, y);
      y += 6;
      set(10.5, 'bold'); doc.text(lines(issue.title, W - 240, 10.5)[0] || '', PAGE.m, y + 11);
      // Count, change lozenge and trend line on the right.
      set(11, 'bold'); doc.text(pdfText(String(issue.count)), PAGE.m + W - 92, y + 11, { align: 'right' });
      if (issue.change) {
        const [bg, fg] = issue.change.kind === 'up' ? [C.upBg, C.up] : issue.change.kind === 'down' ? [C.downBg, C.down] : [C.newBg, C.newText];
        doc.setFillColor(...bg); doc.roundedRect(PAGE.m + W - 84, y + 2, 40, 13, 3, 3, 'F');
        set(7.5, 'bold', fg); doc.text(pdfText(issue.change.text), PAGE.m + W - 64, y + 11, { align: 'center' });
      }
      const t = (issue.trend || []).map((p) => p.count / (p.days || 1));
      if (t.length > 1) {
        const tmax = Math.max(...t) || 1;
        const sx = PAGE.m + W - 225;
        doc.setDrawColor(...C.brand); doc.setLineWidth(1.2);
        for (let i = 1; i < t.length; i += 1) {
          doc.line(sx + ((i - 1) / (t.length - 1)) * 80, y + 15 - (t[i - 1] / tmax) * 12, sx + (i / (t.length - 1)) * 80, y + 15 - (t[i] / tmax) * 12);
        }
        doc.setLineWidth(0.5);
      }
      y += 16;
      for (const l of summaryLines) { set(8.5, 'normal', C.subtle); doc.text(l, PAGE.m, y + 8); y += 11; }
      if (metaText) { set(8, 'normal', C.subtle); doc.text(lines(metaText, W, 8)[0], PAGE.m, y + 8); y += 12; }
      for (const e of (issue.examples || []).slice(0, 3)) {
        set(8, 'bold', C.brand); doc.text(pdfText(e.key), PAGE.m + 8, y + 8);
        set(8, 'normal'); doc.text(lines(`${e.summary}${e.status ? `  (${e.status})` : ''}`, W - 80, 8)[0] || '', PAGE.m + 70, y + 8);
        y += 11;
      }
      y += 6;
    }
  }

  // Breakdowns.
  for (const b of model.breakdowns || []) {
    if (!b.values?.length) continue;
    heading(`By ${b.label}`);
    const top = Math.max(1, ...b.values.map((v) => v.count));
    for (const v of b.values.slice(0, 8)) {
      ensure(15);
      set(9); doc.text(lines(v.value, 170, 9)[0] || '', PAGE.m, y + 9);
      doc.setFillColor(...C.border); doc.rect(PAGE.m + 180, y + 3, W - 240, 6, 'F');
      doc.setFillColor(...C.brand); doc.rect(PAGE.m + 180, y + 3, Math.max(2, (v.count / top) * (W - 240)), 6, 'F');
      set(9, 'bold'); doc.text(pdfText(String(v.countText ?? v.count)), PAGE.m + W, y + 9, { align: 'right' });
      y += 15;
    }
  }

  // When tickets arrive.
  const grid = model.timeOfDay?.grid;
  if (grid?.length === 7 && grid.flat().some((n) => n > 0)) {
    heading('When tickets arrive');
    const peak = peakWindow(hoursOf(grid));
    paragraph(`Times in ${model.timeOfDay.timeZone}.${peak ? ` Busiest 3 hours: ${windowText(peak)} (${peak.share}% of tickets).` : ''}`, { size: 9, colour: C.subtle });
    ensure(7 * 13 + 20);
    const cell = (W - 30) / 24;
    const max = Math.max(1, ...grid.flat());
    for (let h = 0; h < 24; h += 3) { set(6.5, 'normal', C.faint); doc.text(String(h).padStart(2, '0'), PAGE.m + 30 + h * cell, y + 7); }
    y += 10;
    grid.forEach((row, d) => {
      set(7, 'normal', C.subtle); doc.text(DAYS[d], PAGE.m, y + 8);
      row.forEach((n, h) => {
        const k = n ? 0.15 + 0.85 * (n / max) : 0;
        const mix = (a, b) => Math.round(a + (b - a) * k);
        doc.setFillColor(...(n ? [mix(C.panel[0], C.brand[0]), mix(C.panel[1], C.brand[1]), mix(C.panel[2], C.brand[2])] : C.panel));
        doc.rect(PAGE.m + 30 + h * cell + 0.5, y, cell - 1, 11, 'F');
      });
      y += 13;
    });
    y += 6;
  }

  if (model.footnote) { y += 6; paragraph(model.footnote, { size: 7.5, colour: C.faint }); }

  // Page numbers.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    set(7.5, 'normal', C.faint);
    doc.text(pdfText(`${model.title} · ${model.subtitle}`), PAGE.m, PAGE.h - 22);
    doc.text(`${p} / ${pages}`, PAGE.w - PAGE.m, PAGE.h - 22, { align: 'right' });
  }
  return doc;
}

/** Builds and downloads the PDF (same way as the CSV export). */
export function downloadReportPdf(model, filename) {
  const blob = buildReportPdf(model).output('blob');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
