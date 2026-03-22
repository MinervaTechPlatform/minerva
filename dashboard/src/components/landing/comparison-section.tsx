"use client";

import { useRevealOnScroll } from "./use-reveal";

const rows = [
  { old: "Scripted responses", new: "Dynamic, context-aware conversations" },
  { old: "Static flows", new: "Adaptive intelligence that learns" },
  { old: "Low engagement rates", new: "High conversion outcomes" },
  { old: "One-size-fits-all", new: "Personalized per user, per moment" },
  { old: "Hard to scale", new: "Built for growth from day one" },
];

export function ComparisonSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section className="py-24 bg-background" ref={ref}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <div className="text-center mb-12">
            <span className="text-xs text-primary font-semibold uppercase tracking-widest">
              Why Minerva
            </span>
            <h2 className="mt-2 text-4xl sm:text-5xl font-black tracking-tight">
              Minerva wins.
            </h2>
          </div>

          <div className="rounded-2xl border border-border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-2 bg-muted/40">
              <div className="px-6 py-4 text-sm font-bold text-muted-foreground border-r border-border">
                Traditional Chatbots
              </div>
              <div className="px-6 py-4 text-sm font-bold text-primary flex items-center gap-2">
                <svg viewBox="0 0 16 16" className="w-4 h-4">
                  <circle cx="8" cy="8" r="7" className="fill-primary/15 stroke-primary/50" strokeWidth="1" />
                  <path d="M5 8l2 2 4-4" className="stroke-primary" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
                Minerva
              </div>
            </div>

            {/* Rows */}
            {rows.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-2 border-t border-border ${
                  i % 2 === 0 ? "bg-background" : "bg-muted/20"
                }`}
              >
                <div className="px-6 py-4 text-sm text-muted-foreground border-r border-border flex items-center gap-2">
                  <svg viewBox="0 0 12 12" className="w-3 h-3 flex-shrink-0 text-destructive/50">
                    <path d="M2 2l8 8M10 2L2 10" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {row.old}
                </div>
                <div className="px-6 py-4 text-sm text-foreground font-medium flex items-center gap-2">
                  <svg viewBox="0 0 12 12" className="w-3 h-3 flex-shrink-0 text-primary">
                    <path d="M1.5 6l3 3 6-6" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  {row.new}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
