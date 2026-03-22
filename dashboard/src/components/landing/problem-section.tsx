"use client";

import { useRevealOnScroll } from "./use-reveal";

const problems = [
  {
    title: "Chatbots are rigid",
    description:
      "Scripted flows break at the first unexpected question, leaving customers stuck and frustrated.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect x="8" y="12" width="32" height="24" rx="4" className="stroke-destructive/60" strokeWidth="1.5" />
        <path d="M16 22h4M28 22h4M20 30h8" className="stroke-destructive/60 animate-draw-line" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M24 12V8M16 12l-4-4M32 12l4-4" className="stroke-destructive/40" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Sales teams are overloaded",
    description:
      "Reps spend hours on repetitive queries instead of closing deals and building relationships.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <circle cx="24" cy="18" r="8" className="stroke-destructive/60" strokeWidth="1.5" />
        <path d="M10 40c0-7.732 6.268-14 14-14s14 6.268 14 14" className="stroke-destructive/60 animate-draw-line" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M32 22l8 4M36 26l2-2" className="stroke-destructive/40" strokeWidth="1" strokeLinecap="round" />
        <text x="36" y="20" className="fill-destructive/60" fontSize="10" fontWeight="bold">!</text>
      </svg>
    ),
  },
  {
    title: "Journeys are fragmented",
    description:
      "Disconnected touchpoints mean customers repeat themselves, losing trust — and you lose revenue.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <circle cx="12" cy="12" r="5" className="stroke-destructive/60" strokeWidth="1.5" />
        <circle cx="36" cy="24" r="5" className="stroke-destructive/60" strokeWidth="1.5" />
        <circle cx="18" cy="38" r="5" className="stroke-destructive/60" strokeWidth="1.5" />
        <path d="M17 13l12 8M31 27l-8 7" className="stroke-destructive/40 stroke-dasharray-[4_4] animate-draw-line" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />
        <line x1="12" y1="17" x2="15" y2="27" className="stroke-destructive/20" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    ),
  },
];

export function ProblemSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section id="problem" className="py-24 bg-background" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
              Your customers expect{" "}
              <span className="text-destructive">conversations.</span>
              <br />
              You&apos;re giving them forms.
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Every missed interaction is lost revenue. The gap between customer
              expectations and legacy tooling has never been wider.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {problems.map((p, i) => (
              <div
                key={p.title}
                className="group relative p-8 rounded-2xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/8 hover:border-destructive/40 transition-all duration-300"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="mb-4">{p.icon}</div>
                <h3 className="text-lg font-bold text-foreground mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>

                {/* Corner accent */}
                <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-2xl">
                  <svg viewBox="0 0 64 64" className="w-16 h-16 text-destructive/10">
                    <polygon points="64,0 64,64 0,0" fill="currentColor" />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {/* Connecting line */}
          <div className="mt-16 flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-border" />
            <span className="px-4 py-1.5 rounded-full border border-border bg-background text-xs font-medium">
              There&apos;s a better way
            </span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-border" />
          </div>
        </div>
      </div>
    </section>
  );
}
