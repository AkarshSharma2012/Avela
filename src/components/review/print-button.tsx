"use client";

/** Browser print-to-PDF (spec Part 11's minimal export foundation) — no server-side PDF generation dependency needed for a single print-ready page. */
function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mt-2 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      Print or save as PDF
    </button>
  );
}

export { PrintButton };
