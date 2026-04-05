import { ReactNode } from "react";
import { Link } from "wouter";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary"></div>
            Role Cases AI-assessor
          </Link>
          <nav>
            <Link href="/results" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Все результаты
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
