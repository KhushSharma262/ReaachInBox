"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

const TABS = [
  { href: "/dashboard", label: "Compose" },
  { href: "/dashboard/scheduled", label: "Scheduled" },
  { href: "/dashboard/sent", label: "Sent" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900">
              <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">ReachInbox</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium leading-tight">{session.user?.name}</p>
              <p className="text-[11px] leading-tight text-slate-500">{session.user?.email}</p>
            </div>
            {session.user?.image && (
              <img src={session.user.image} alt="" className="h-8 w-8 rounded-full ring-1 ring-slate-200" />
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Log out
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-6 px-6">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "relative pb-2.5 text-[13px] font-medium transition " +
                  (active ? "text-slate-900" : "text-slate-400 hover:text-slate-700")
                }
              >
                {t.label}
                {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-slate-900" />}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
