"use client";

import { useState } from "react";
import { useRevealOnScroll } from "./use-reveal";

const useCases = [
  {
    industry: "Real Estate",
    tagline: "Qualify buyers, schedule visits, recommend properties",
    color: "from-emerald-500/10 to-emerald-500/5",
    border: "border-emerald-500/20",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <path d="M4 28V14L16 4l12 10v14H4z" className="stroke-emerald-500/70" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="12" y="18" width="8" height="10" className="stroke-emerald-500/60" strokeWidth="1.5" />
        <path d="M10 14h12" className="stroke-emerald-500/40" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    industry: "Fintech",
    tagline: "Guide users through financial products, KYC, onboarding",
    color: "from-blue-500/10 to-blue-500/5",
    border: "border-blue-500/20",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <circle cx="16" cy="16" r="12" className="stroke-blue-500/60" strokeWidth="1.5" />
        <path d="M16 8v2M16 22v2M10 16h2M20 16h2" className="stroke-blue-500/50" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13 12l6 8" className="stroke-blue-500/60" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    industry: "Healthcare",
    tagline: "Assist with appointments, triage, and patient queries",
    color: "from-rose-500/10 to-rose-500/5",
    border: "border-rose-500/20",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <path d="M16 6v20M6 16h20" className="stroke-rose-500/60" strokeWidth="2" strokeLinecap="round" />
        <rect x="6" y="6" width="20" height="20" rx="4" className="stroke-rose-500/30" strokeWidth="1" />
      </svg>
    ),
  },
  {
    industry: "E-commerce",
    tagline: "Drive conversions with guided shopping experiences",
    color: "from-amber-500/10 to-amber-500/5",
    border: "border-amber-500/20",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <path d="M4 6h4l3 14h14" className="stroke-amber-500/60" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="26" r="2" className="stroke-amber-500/60" strokeWidth="1.5" />
        <circle cx="22" cy="26" r="2" className="stroke-amber-500/60" strokeWidth="1.5" />
        <path d="M8 10h18l-2 8H10L8 10z" className="stroke-amber-500/40" strokeWidth="1" />
      </svg>
    ),
  },
  {
    industry: "Enterprise Ops",
    tagline: "Internal copilots for teams, HR, IT, and operations",
    color: "from-violet-500/10 to-violet-500/5",
    border: "border-violet-500/20",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <rect x="4" y="10" width="24" height="16" rx="3" className="stroke-violet-500/60" strokeWidth="1.5" />
        <path d="M10 16h12M10 21h8" className="stroke-violet-500/50" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="16" cy="6" r="3" className="stroke-violet-500/50" strokeWidth="1.5" />
        <path d="M16 9v1" className="stroke-violet-500/40" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function UseCasesSection() {
  const [active, setActive] = useState(0);
  const { ref, visible } = useRevealOnScroll();

  return (
    <section id="use-cases" className="py-24 bg-accent/20" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <div className="text-center mb-12">
            <span className="text-xs text-primary font-semibold uppercase tracking-widest">
              Use Cases
            </span>
            <h2 className="mt-2 text-4xl sm:text-5xl font-black tracking-tight">
              Built for every industry.{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Optimized for your outcomes.
              </span>
            </h2>
            <p className="mt-3 text-muted-foreground">One platform. Infinite use cases.</p>
          </div>

          {/* Industry cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
            {useCases.map((uc, i) => (
              <button
                key={uc.industry}
                onClick={() => setActive(i)}
                className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                  active === i
                    ? `bg-gradient-to-br ${uc.color} ${uc.border} shadow-md`
                    : "border-border bg-background hover:bg-accent/30"
                }`}
              >
                <div className="mb-2">{uc.icon}</div>
                <div className="text-sm font-bold text-foreground">{uc.industry}</div>
              </button>
            ))}
          </div>

          {/* Active use case detail */}
          <div
            className={`p-8 rounded-2xl border bg-gradient-to-br ${useCases[active].color} ${useCases[active].border} transition-all duration-300`}
          >
            <div className="flex items-center gap-4 mb-3">
              {useCases[active].icon}
              <h3 className="text-xl font-bold text-foreground">
                {useCases[active].industry}
              </h3>
            </div>
            <p className="text-muted-foreground text-base">{useCases[active].tagline}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
