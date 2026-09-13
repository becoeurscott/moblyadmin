"use client";

import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { ReactNode } from "react";

/**
 * Page header: title on the left; on the right an optional context pill (e.g.
 * the date range), the light/dark toggle, and the signed-in admin.
 */
export default function Topbar({
  title,
  pill,
  actions,
}: {
  title: string;
  pill?: ReactNode;
  actions?: ReactNode;
}) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const initials = (user?.fullName ?? "A")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex items-center gap-4 mb-7">
      <h1 className="text-2xl font-bold text-fg tracking-tight">{title}</h1>

      {pill && (
        <span className="hidden sm:inline-flex items-center gap-2 text-xs font-medium text-muted bg-card border border-line rounded-lg px-3 py-1.5">
          {pill}
        </span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {actions}

        {/* theme toggle */}
        <div
          role="group"
          aria-label="Thème"
          className="flex items-center gap-1 bg-card border border-line rounded-full p-1"
        >
          <button
            type="button"
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
            title="Thème clair"
            className={`w-7 h-7 rounded-full grid place-items-center transition cursor-pointer ${
              theme === "light" ? "bg-primary text-white" : "text-muted hover:text-fg"
            }`}
          >
            <SunIcon />
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
            title="Thème sombre"
            className={`w-7 h-7 rounded-full grid place-items-center transition cursor-pointer ${
              theme === "dark" ? "bg-primary text-white" : "text-muted hover:text-fg"
            }`}
          >
            <MoonIcon />
          </button>
        </div>

        {/* signed-in admin */}
        <div className="flex items-center gap-2.5 pl-1">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="w-9 h-9 rounded-full object-cover ring-2 ring-card"
            />
          ) : (
            <span className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white bg-gradient-to-br from-primary to-[#7C3AED] ring-2 ring-card">
              {initials}
            </span>
          )}
          <div className="hidden md:block leading-tight">
            <p className="text-sm font-semibold text-fg truncate max-w-[10rem]">
              {user?.fullName}
            </p>
            <p className="text-[11px] text-muted">
              {roleLabel(user?.adminRole)}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

function roleLabel(r?: string | null) {
  switch (r) {
    case "SUPER_ADMIN": return "Super admin";
    case "ADMIN":       return "Administrateur";
    case "MODERATOR":   return "Modérateur";
    case "SUPPORT":     return "Support";
    case "READ_ONLY":   return "Lecture seule";
    default:            return "Admin";
  }
}

function SunIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}
