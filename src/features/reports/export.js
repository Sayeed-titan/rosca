/**
 * Report exports — CSV, Excel and PDF.
 *
 * All client-side: the report data is already in the browser, so round-tripping
 * it to a server just to reformat it would add latency and a whole endpoint for
 * nothing.
 */

/**
 * Escape one CSV cell.
 *
 * Two separate problems, both real:
 *
 * 1. Delimiters. A value containing a comma, quote or newline must be quoted,
 *    with inner quotes doubled — RFC 4180. `[...].join(",")` silently corrupts
 *    the moment anyone's name has a comma in it.
 *
 * 2. CSV injection. Excel and Sheets treat a leading =, +, - or @ as a formula,
 *    so a member named `=cmd|'/c calc'!A1` becomes code execution when the
 *    organiser opens the export. Prefixing with a tab neutralises it while
 *    displaying identically. This is why the export isn't just a join().
 */
function csvCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  const deFanged = /^[=+\-@\t\r]/.test(raw) ? `\t${raw}` : raw;

  return /[",\n\r]/.test(deFanged) ? `"${deFanged.replace(/"/g, '""')}"` : deFanged;
}

export function toCsv(report) {
  const header = report.columns.map((c) => csvCell(c.label)).join(",");
  const body = report.rows
    .map((row) => report.columns.map((c) => csvCell(row[c.key])).join(","))
    .join("\r\n");

  return `${header}\r\n${body}`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function filenameFor(report, extension) {
  const slug = `${report.committeeName}-${report.label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const date = report.generatedAt.slice(0, 10);
  return `${slug}-${date}.${extension}`;
}

export function exportCsv(report) {
  // The BOM makes Excel read UTF-8 correctly. Without it, ৳ and Bengali names
  // render as mojibake — which for this app is most of the data.
  const blob = new Blob(["﻿", toCsv(report)], {
    type: "text/csv;charset=utf-8",
  });
  download(blob, filenameFor(report, "csv"));
}

/**
 * Excel export.
 *
 * Writes SpreadsheetML 2003 (an XML dialect Excel opens natively) rather than
 * pulling in a multi-megabyte xlsx library. Real .xlsx is a ZIP archive, which
 * cannot be produced without a bundled zip implementation — this gets a genuine,
 * formatted Excel file with no dependency at all.
 */
export function exportExcel(report) {
  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const headerRow = `<Row>${report.columns
    .map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(c.label)}</Data></Cell>`)
    .join("")}</Row>`;

  const bodyRows = report.rows
    .map(
      (row) =>
        `<Row>${report.columns
          .map((c) => `<Cell><Data ss:Type="String">${esc(row[c.key])}</Data></Cell>`)
          .join("")}</Row>`
    )
    .join("");

  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#EEEEEE" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="${esc(report.label).slice(0, 31)}">
  <Table>${headerRow}${bodyRows}</Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  download(blob, filenameFor(report, "xls"));
}

/**
 * PDF export via the browser's own print-to-PDF.
 *
 * A real PDF library (jsPDF/pdfmake) would add megabytes to the bundle to
 * reproduce what every browser already does well — including page breaks and
 * font embedding for Bengali text, which is exactly where hand-rolled PDF
 * generation tends to fall over.
 */
export function exportPdf() {
  window.print();
}
