"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Table state (page / search / sort) held in the URL rather than React state.
 *
 * Why the URL: the list is a Server Component, so changing the URL is what makes
 * the server re-query. It also makes a filtered view shareable, makes the back
 * button behave, and survives a refresh. Local state would give us none of that
 * and would need a parallel client fetch to stay in sync.
 */
export const DEFAULT_PAGE_SIZE = 10;

export function useTableParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "";
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  const push = useCallback(
    (updates) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        // Keep the URL clean: empty values are removed, not left as `?q=`.
        if (value === "" || value === null || value === undefined) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }

      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setSearch = useCallback(
    (value) => push({ q: value, page: 1 }), // a new search always restarts paging
    [push]
  );

  const setPage = useCallback((value) => push({ page: value }), [push]);

  const toggleSort = useCallback(
    (key) => {
      // Same column -> flip direction. New column -> start descending, which is
      // what people usually want for dates and amounts.
      const nextDir = sort === key && dir === "desc" ? "asc" : "desc";
      push({ sort: key, dir: nextDir, page: 1 });
    },
    [dir, push, sort]
  );

  return { page, q, sort, dir, setSearch, setPage, toggleSort, push };
}
