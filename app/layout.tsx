import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider, ThemeScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mobly Admin",
  description: "Tableau de bord administrateur Mobly",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `data-theme` is stamped client-side before paint by ThemeScript, so the
    // server-rendered attribute may legitimately differ.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
