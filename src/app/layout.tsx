import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JAPA DTR System — Enterprise Attendance & Biometrics",
  description: "Official Daily Time Record and Payroll Management Portal for JAPA Global Trading",
  icons: {
    icon: "/japa-logo.jpg",
    shortcut: "/japa-logo.jpg",
    apple: "/japa-logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/japa-logo.jpg" type="image/jpeg" />
      </head>
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col h-screen overflow-hidden">
            <AppHeader />
            <main className="flex-1 overflow-y-auto flex flex-col justify-between">
              <div className="flex-1">
                {children}
              </div>
              <AppFooter />
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
