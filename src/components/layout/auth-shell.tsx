import Link from "next/link";
import type { ReactNode } from "react";

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
      <div className="flex flex-col justify-between gap-8 border-b border-border bg-secondary px-6 py-8 lg:w-[42%] lg:border-r lg:border-b-0 lg:px-16 lg:py-16">
        <Link
          href="/"
          className="font-heading text-xl font-semibold text-foreground"
        >
          Avela
        </Link>

        <div>
          <p className="mb-3 text-xs font-medium tracking-wide text-primary uppercase">
            {eyebrow}
          </p>
          <h1 className="font-heading text-2xl leading-tight text-foreground sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-text-secondary">
            {description}
          </p>
        </div>

        <p className="hidden text-sm text-muted-foreground lg:block">
          Your future, organized.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

export { AuthShell };
