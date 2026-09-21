"use client";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  RotateCcw,
  Search,
} from "lucide-react";
import { localDate, platforms, type Shift } from "@/lib/fleet";
import {
  emptyFilters,
  filterShifts,
  shiftTotals,
  type ShiftFilters,
  type ShiftOrder,
} from "@/lib/shifts";

type Props = {
  shifts: Shift[];
  renderRows: (rows: Shift[]) => ReactNode;
  exportRecord: () => void;
};
export default function ShiftHistory({
  shifts,
  renderRows,
  exportRecord,
}: Props) {
  const [filters, setFilters] = useState<ShiftFilters>(emptyFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const filtered = useMemo(
    () => filterShifts(shifts, filters),
    [shifts, filters],
  );
  const total = shiftTotals(filtered);
  const invalidRange = Boolean(
    filters.from && filters.to && filters.from > filters.to,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(
    activePage * pageSize,
    (activePage + 1) * pageSize,
  );
  const hasFilters =
    filters.query !== "" ||
    filters.platform !== "All platforms" ||
    filters.from !== "" ||
    filters.to !== "";
  function change(next: Partial<ShiftFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(0);
  }
  function reset() {
    setFilters(emptyFilters);
    setPage(0);
  }
  return (
    <section className="card full-table shift-history">
      <div className="card-title">
        <h2>
          Your shift history{" "}
          <span className="count-badge">{shifts.length}</span>
        </h2>
        <div className="table-actions">
          <select
            aria-label="Filter shifts by platform"
            value={filters.platform}
            onChange={(e) => change({ platform: e.target.value })}
          >
            <option>All platforms</option>
            {platforms.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <button
            className="button ghost small"
            onClick={exportRecord}
            title="Download your complete portable JSON record, not just these filtered results"
          >
            <ArrowDownToLine size={16} />
            Export
          </button>
        </div>
      </div>
      <div className="history-filters">
        <label className="history-search">
          Search shifts
          <div className="search-input">
            <Search size={16} />
            <input
              type="search"
              value={filters.query}
              onChange={(e) => change({ query: e.target.value })}
              placeholder="Platform, date, or start time"
              maxLength={120}
            />
          </div>
        </label>
        <label>
          From date
          <input
            type="date"
            value={filters.from}
            max={localDate()}
            onChange={(e) => change({ from: e.target.value })}
          />
        </label>
        <label>
          To date
          <input
            type="date"
            value={filters.to}
            max={localDate()}
            onChange={(e) => change({ to: e.target.value })}
          />
        </label>
        <label>
          Sort shifts
          <select
            value={filters.order}
            onChange={(e) => change({ order: e.target.value as ShiftOrder })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="earnings">Highest earnings</option>
            <option value="duration">Longest shifts</option>
          </select>
        </label>
      </div>
      {invalidRange && (
        <div className="error-banner history-error" role="alert">
          The start date must be on or before the end date.
        </div>
      )}
      <div className="history-summary">
        <p aria-live="polite">
          <strong>{filtered.length}</strong>{" "}
          {hasFilters ? "matching" : "recorded"}{" "}
          {filtered.length === 1 ? "shift" : "shifts"} <span>·</span>{" "}
          {total.hours} hrs <span>·</span> {total.trips} trips <span>·</span>{" "}
          {total.earnings.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          })}{" "}
          before expenses
        </p>
        {hasFilters && !!filtered.length && (
          <button className="text-link" onClick={reset}>
            <RotateCcw size={13} /> Clear filters
          </button>
        )}
      </div>
      {rows.length || !shifts.length ? (
        renderRows(rows)
      ) : (
        <div className="empty-state">
          <Search size={28} />
          <h3>No shifts match these filters.</h3>
          <p>
            {invalidRange
              ? "Adjust the date range, or clear your filters to see the full history."
              : "Try another date or platform. Search matches shift facts, not private journal notes."}
          </p>
          <button className="button secondary" onClick={reset}>
            Clear filters
          </button>
        </div>
      )}
      {!!filtered.length && (
        <div className="history-pagination">
          <label>
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {[10, 25, 50].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <nav aria-label="Shift history pages">
            <span>
              {activePage * pageSize + 1}–
              {Math.min((activePage + 1) * pageSize, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <button
              className="icon-button"
              aria-label="Previous shifts page"
              disabled={activePage === 0}
              onClick={() => setPage(activePage - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Next shifts page"
              disabled={activePage === pageCount - 1}
              onClick={() => setPage(activePage + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </nav>
        </div>
      )}
      <div className="table-footnote">
        <LockKeyhole size={14} />
        <span>
          Search uses platform, date, and start time only. Journal notes stay
          private. Export downloads your <strong>full record</strong>,
          regardless of filters.
        </span>
      </div>
    </section>
  );
}
