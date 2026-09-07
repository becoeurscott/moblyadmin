"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The small set of primitives the control pages share.
 *
 * Kept in one file on purpose: the dashboard has no component library, and a
 * dozen one-export files would be harder to scan than this. Every style here
 * follows the tokens already in `globals.css` (primary / accent / success /
 * danger / warning) so new pages match the existing ones.
 */

type Variant = "primary" | "accent" | "success" | "danger" | "warning" | "neutral";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
  neutral: "bg-surface text-text",
};

export function Badge({
  children,
  variant = "neutral",
  title,
}: {
  children: ReactNode;
  variant?: Variant;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${VARIANT[variant]}`}
    >
      {children}
    </span>
  );
}

/** An accessible on/off switch. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition
        ${checked ? "bg-success" : "bg-border"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition
          ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

/**
 * Modal with the behaviours the inlined version lacked: Escape closes it, the
 * page behind stops scrolling, and focus is not left stranded on the backdrop.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white rounded-2xl p-6 w-full shadow-xl max-h-[85vh] overflow-y-auto ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-dark mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * Confirmation for an irreversible action.
 *
 * The operator has to type the exact phrase before the button enables, and the
 * phrase is sent to the server as `x-confirm` — so a mis-click on the wrong row
 * cannot go through even if the UI is wrong about which row is selected.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  phrase,
  confirmLabel = "Confirmer",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  phrase: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-text mb-4 space-y-2">{body}</div>
      <label className="block text-sm font-medium text-dark mb-1.5">
        Tapez <code className="px-1.5 py-0.5 rounded bg-surface text-danger font-mono">{phrase}</code> pour confirmer
      </label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-danger/30"
        placeholder={phrase}
      />
      <div className="flex gap-2 mt-5">
        <button
          onClick={onConfirm}
          disabled={typed.trim() !== phrase || busy}
          className="px-4 py-2 text-sm rounded-xl bg-danger text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
        >
          {busy ? "…" : confirmLabel}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-surface font-medium transition cursor-pointer ml-auto"
        >
          Annuler
        </button>
      </div>
    </Modal>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition cursor-pointer ${
            active === t.id
              ? "border-primary text-primary"
              : "border-transparent text-text hover:text-dark"
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 text-xs opacity-60">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-border/50 ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-dark mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-text mt-1">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  size = "md",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  size?: "sm" | "md";
  type?: "button" | "submit";
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${pad} rounded-xl font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80 ${VARIANT[variant]}`}
    >
      {children}
    </button>
  );
}

/** Transient feedback after a write. */
export function Notice({ kind, children }: { kind: "success" | "danger"; children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      className={`text-sm rounded-xl px-4 py-2.5 ${
        kind === "success" ? "text-success bg-success/10" : "text-danger bg-danger/10"
      }`}
    >
      {children}
    </p>
  );
}

export function Spinner() {
  return <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />;
}

/** Debounced text input — the list pages refetch on every keystroke without it. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "w-72",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(value), [value]);

  return (
    <input
      value={local}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(v), 300);
      }}
      className={`${className} px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
    />
  );
}

/** Before/after diff for an audit entry. */
export function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  const fmt = (v: unknown) =>
    v === null || v === undefined ? "—" : JSON.stringify(v, null, 2);
  return (
    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
      <div>
        <p className="text-text mb-1 font-sans font-medium">Avant</p>
        <pre className="bg-danger/5 border border-danger/20 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
          {fmt(before)}
        </pre>
      </div>
      <div>
        <p className="text-text mb-1 font-sans font-medium">Après</p>
        <pre className="bg-success/5 border border-success/20 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
          {fmt(after)}
        </pre>
      </div>
    </div>
  );
}

export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
