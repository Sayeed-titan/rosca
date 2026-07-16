"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FileSpreadsheet, FileText, Printer, BarChart3 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import { exportCsv, exportExcel, exportPdf } from "../export";

export function ReportView({ report, reportKeys, activeKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectReport(key) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("report", key);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Report picker — tabs rather than a dropdown, so the available reports
          are visible rather than hidden behind a click. print:hidden so the
          chrome doesn't end up in the PDF. */}
      <div className="flex flex-wrap gap-1.5 print:hidden">
        {reportKeys.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectReport(key)}
            aria-current={key === activeKey ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              key === activeKey
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Card
        id="report-print-area"
        className="glass gap-0 overflow-hidden rounded-xl border-0 p-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-medium">{report.label}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {report.committeeName} ·{" "}
              {new Date(report.generatedAt).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => exportCsv(report)}>
              <FileText className="size-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportExcel(report)}>
              <FileSpreadsheet className="size-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportPdf()}>
              <Printer className="size-4" />
              PDF
            </Button>
          </div>
        </div>

        {report.rows.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Nothing to report yet"
            description="Once payments and draws are recorded, this report fills in automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {report.columns.map((c) => (
                    <TableHead key={c.key} className={c.numeric ? "text-right" : ""}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {report.rows.map((row, i) => (
                  <TableRow key={i}>
                    {report.columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={c.numeric ? "tabular text-right" : ""}
                      >
                        {row[c.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {report.rows.length > 0 && report.totals && (
          <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <p className="text-muted-foreground text-xs font-medium">
              {report.totals.label}
            </p>
            <dl className="flex flex-wrap gap-5 text-sm">
              {Object.entries(report.totals)
                .filter(([k]) => k !== "label")
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <dt className="text-muted-foreground text-xs capitalize">
                      {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </dt>
                    <dd className="tabular font-semibold">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </Card>
    </div>
  );
}
