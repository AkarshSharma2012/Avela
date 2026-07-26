import Link from "next/link";
import type { ReactNode } from "react";

import { PathMotif } from "@/components/brand/path-motif";

function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <div className="relative flex flex-col justify-between gap-8 overflow-hidden border-b border-border bg-secondary px-6 py-8 lg:w-[42%] lg:border-r lg:border-b-0 lg:px-16 lg:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 text-border"
          style={{
            backgroundImage:
              "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(to bottom, black, transparent 85%)",
          }}
        />
        <PathMotif className="right-4 bottom-20 h-56 w-40 lg:right-8 lg:bottom-28" />

        <Link
          href="/"
          className="animate-fade-up relative font-heading text-xl font-semibold text-foreground"
        >
          Avela
        </Link>

        <div className="stagger-children relative">
          <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
            {eyebrow}
          </p>
          <h1 className="animate-fade-up font-heading text-2xl leading-tight text-foreground sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          <p className="animate-fade-up mt-4 max-w-sm text-base leading-relaxed text-text-secondary">
            {description}
          </p>
        </div>

        <p
          className="animate-fade-up relative hidden font-heading text-sm italic text-muted-foreground lg:block"
          style={{ animationDelay: "160ms" }}
        >
          Your future, organized.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-16">
        <div className="animate-fade-up w-full max-w-sm" style={{ animationDelay: "80ms" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export { AuthShell };
