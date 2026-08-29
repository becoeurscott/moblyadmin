"use client";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-text">
        {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} sur{" "}
        {total}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white hover:bg-surface disabled:opacity-40 transition cursor-pointer disabled:cursor-default"
        >
          Precedent
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white hover:bg-surface disabled:opacity-40 transition cursor-pointer disabled:cursor-default"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
