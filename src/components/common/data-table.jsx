"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTableParams } from "@/hooks/use-table-params";

/**
 * The one table.
 *
 * Rows are fetched and paginated on the SERVER; this component only renders them
 * and drives the URL. It never slices `rows` itself — client-side pagination would
 * mean shipping every member to the browser and then hiding most of them, which
 * stops working the moment an org has a few thousand.
 *
 * @param {object[]} columns  {key, header, cell?, sortable?, className?, headClassName?}
 * @param {object[]} rows     the current page, already sorted/filtered by the server
 * @param {number}   total    total matching rows (for pagination maths)
 */
export function DataTable({
  columns,
  rows,
  total,
  pageSize = 10,
  searchPlaceholder = "Search…",
  searchable = true,
  empty,
  toolbar,
  getRowKey = (row) => row.id,
  onRowClick,
}) {
  const { page, q, sort, dir, setSearch, setPage, toggleSort } = useTableParams();

  // Local mirror so typing feels instant, then debounced into the URL — pushing on
  // every keystroke would fire a server round trip per character.
  const [term, setTerm] = useState(q);
  useEffect(() => setTerm(q), [q]);

  useEffect(() => {
    if (term === q) return;
    const timer = setTimeout(() => setSearch(term), 350);
    return () => clearTimeout(timer);
  }, [term, q, setSearch]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Card className="glass gap-0 overflow-hidden rounded-xl border-0 p-0">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 p-4">
          {searchable && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9 pr-9"
              />
              {term && (
                <button
                  type="button"
                  onClick={() => setTerm("")}
                  aria-label="Clear search"
                  className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2 rounded p-1"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {toolbar}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => {
                const active = sort === col.key;
                return (
                  <TableHead key={col.key} className={col.headClassName}>
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="hover:text-foreground -mx-2 inline-flex items-center gap-1.5 rounded px-2 py-1"
                        aria-label={`Sort by ${col.header}`}
                      >
                        {col.header}
                        {active ? (
                          dir === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.cell ? col.cell(row) : row[col.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="text-muted-foreground text-xs" aria-live="polite">
            Showing <span className="tabular">{from}</span>–
            <span className="tabular">{to}</span> of{" "}
            <span className="tabular">{total}</span>
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-muted-foreground tabular px-1 text-xs">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
