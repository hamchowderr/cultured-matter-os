"use client";

// Adapted from the shadcn UI kit block tables13: paging, sorting and filtering run on the
// server, so the table only renders the current page.

import { flexRender } from "@tanstack/react-table";
import {
  getCoreRowModel,
  useLegacyTable as useReactTable,
  type LegacyColumnDef as ColumnDef
} from "@tanstack/react-table/legacy";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import type { Contact } from "@/actions/schemas";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SortKey = "name" | "company" | "role";
export type SortDir = "asc" | "desc";

const SOURCE_LABELS: Record<Contact["source"], string> = {
  linkedin_csv: "LinkedIn",
  google: "Google",
  newsletter_signup: "Signup",
  manual: "Manual",
  sample: "Sample"
};

export const sourceLabel = (source: Contact["source"]) => SOURCE_LABELS[source] ?? source;

// Columns that drop out on narrow screens so the name always fits.
const HIDE_BELOW: Record<string, string> = {
  role: "hidden lg:table-cell",
  sectors: "hidden md:table-cell",
  source: "hidden xl:table-cell"
};

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 3) return [1, 2, 3, 4, "ellipsis", total];
  if (current >= total - 2) return [1, "ellipsis", total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

function SortHeader({
  label,
  column,
  sort,
  dir,
  sortHref
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: SortDir;
  sortHref: (sort: SortKey, dir: SortDir) => string;
}) {
  const active = sort === column;
  const next: SortDir = active && dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDownIcon : dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Link
      href={sortHref(column, next)}
      scroll={false}
      className={cn(
        "hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5",
        active && "text-foreground"
      )}
      aria-label={`Sort by ${label.toLowerCase()}${active && dir === "asc" ? ", Z to A" : ", A to Z"}`}
    >
      {label}
      <Icon className={cn("size-3.5", !active && "opacity-40")} />
    </Link>
  );
}

export function ContactsTable({
  contacts,
  total,
  page,
  pageSize,
  sort,
  dir,
  sortHref,
  pageHref,
  onOpen,
  empty
}: {
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: SortDir;
  sortHref: (sort: SortKey, dir: SortDir) => string;
  pageHref: (page: number) => string;
  onOpen: (contact: Contact) => void;
  // Shown in place of rows when nothing matches.
  empty: React.ReactNode;
}) {
  const columns = React.useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        id: "name",
        header: () => (
          <SortHeader label="Name" column="name" sort={sort} dir={dir} sortHref={sortHref} />
        ),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">{initials(row.original.fullName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.fullName}</div>
              {row.original.email && (
                <div className="text-muted-foreground truncate text-xs">{row.original.email}</div>
              )}
            </div>
          </div>
        )
      },
      {
        id: "company",
        header: () => (
          <SortHeader label="Company" column="company" sort={sort} dir={dir} sortHref={sortHref} />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.company || "—"}</span>
        )
      },
      {
        id: "role",
        header: () => (
          <SortHeader label="Role" column="role" sort={sort} dir={dir} sortHref={sortHref} />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground line-clamp-1 max-w-56">
            {row.original.position || "—"}
          </span>
        )
      },
      {
        id: "sectors",
        header: "Sectors",
        cell: ({ row }) => {
          const sectors = row.original.sectors;
          if (sectors.length === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {sectors.slice(0, 2).map((s) => (
                <Badge key={s} variant="secondary" className="font-normal">
                  {s}
                </Badge>
              ))}
              {sectors.length > 2 && (
                <Badge variant="outline" className="font-normal">
                  +{sectors.length - 2}
                </Badge>
              )}
            </div>
          );
        }
      },
      {
        id: "newsletter",
        header: "Newsletter",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span
              className={cn(
                "size-1.5 rounded-full",
                row.original.newsletter ? "bg-primary" : "bg-muted-foreground/40"
              )}
            />
            <span className={cn(!row.original.newsletter && "text-muted-foreground")}>
              {row.original.newsletter ? "On" : "Off"}
            </span>
          </span>
        )
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{sourceLabel(row.original.source)}</span>
        )
      }
    ],
    [sort, dir, sortHref]
  );

  const table = useReactTable({
    data: contacts,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: total
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "text-muted-foreground h-10 px-4 font-medium",
                      HIDE_BELOW[header.id]
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  className="hover:bg-muted/50 focus-visible:bg-muted/50 cursor-pointer outline-none"
                  onClick={() => onOpen(row.original)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(row.original);
                    }
                  }}
                  aria-label={`Open ${row.original.fullName}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn("h-14 px-4", HIDE_BELOW[cell.column.id])}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="py-10 text-center">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Pages">
          <Button variant="ghost" size="sm" disabled={page <= 1} asChild={page > 1}>
            {page > 1 ? (
              <Link href={pageHref(page - 1)} scroll={false}>
                <ChevronLeftIcon /> Previous
              </Link>
            ) : (
              <span>
                <ChevronLeftIcon /> Previous
              </span>
            )}
          </Button>
          {getPageNumbers(page, pageCount).map((p, index) =>
            p === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="text-muted-foreground px-2">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={page === p ? "secondary" : "ghost"}
                size="icon"
                className="size-8 tabular-nums"
                asChild
              >
                <Link
                  href={pageHref(p)}
                  scroll={false}
                  aria-current={page === p ? "page" : undefined}
                >
                  {p}
                </Link>
              </Button>
            )
          )}
          <Button variant="ghost" size="sm" disabled={page >= pageCount} asChild={page < pageCount}>
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} scroll={false}>
                Next <ChevronRightIcon />
              </Link>
            ) : (
              <span>
                Next <ChevronRightIcon />
              </span>
            )}
          </Button>
        </nav>
      )}
    </div>
  );
}
