import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.API_URL || "https://mobly-backend.onrender.com/api/v1";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const target = `${API_BASE}/${path.join("/")}`;
  const url = new URL(target);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = req.headers.get("Authorization");
  if (auth) headers["Authorization"] = auth;
  // Confirmation phrase for irreversible actions. Dropping it here would make
  // every guarded endpoint reject the request as unconfirmed.
  const confirm = req.headers.get("x-confirm");
  if (confirm) headers["x-confirm"] = confirm;
  // The backend's IP allowlist and audit log record the *caller*, but this
  // proxy is the caller as far as the backend can see. Forward the browser's
  // address so both reflect the operator rather than the Next.js server.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) headers["x-forwarded-for"] = fwd;

  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.text()
      : undefined;

  const res = await fetch(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  const data = await res.text();
  const out: Record<string, string> = {
    "Content-Type": res.headers.get("Content-Type") || "application/json",
  };
  // CSV and JSON exports rely on this to download as a file rather than
  // rendering as text in the browser.
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) out["Content-Disposition"] = disposition;

  return new NextResponse(data, { status: res.status, headers: out });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
