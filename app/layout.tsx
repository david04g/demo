import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "EOD Strategy Lab",
  description: "Beginner-safe end-of-day strategy builder and backtester",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full bg-slate-950">
      <body className="min-h-full bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
