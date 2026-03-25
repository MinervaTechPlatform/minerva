"use client";

import { useRevealOnScroll } from "./use-reveal";

const steps = [
  {
    step: "01",
    title: "Define Your Business",
    description:
      "Set up your organisation and business context in minutes. No complex configuration — just tell Minerva who you are.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect x="6" y="6" width="28" height="28" rx="6" className="stroke-primary/50" strokeWidth="1.5" />
        <path d="M13 20h14M13 14h8M13 26h10" className="stroke-primary animate-draw-line" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    step: "02",
    title: "Train Your AI",
    description:
      "Plug in your data, workflows, and goals. Minerva learns your domain and adapts its responses accordingly.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <circle cx="20" cy="20" r="8" className="stroke-primary/50" strokeWidth="1.5" />
        <path d="M20 8v4M20 28v4M8 20h4M28 20h4" className="stroke-primary/40 animate-draw-line" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="20" cy="20" r="3" className="fill-primary animate-pulse-glow" />
      </svg>
    ),
  },
  {
    step: "03",
    title: "Deploy Anywhere",
    description:
      "Website, WhatsApp, mobile apps, or internal tools — Minerva deploys across every channel your customers use.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <circle cx="8" cy="20" r="4" className="stroke-primary/50" strokeWidth="1.5" />
        <circle cx="32" cy="10" r="4" className="stroke-primary/50" strokeWidth="1.5" />
        <circle cx="32" cy="30" r="4" className="stroke-primary/50" strokeWidth="1.5" />
        <path d="M12 19l16-7M12 21l16 7" className="stroke-primary animate-draw-line" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    step: "04",
    title: "Optimize with Intelligence",
    description:
      "Track conversations, surface insights, improve outcomes, and scale effortlessly — all from one dashboard.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <path d="M6 30 L14 18 L20 24 L28 12 L34 16" className="stroke-primary animate-draw-line" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="28" cy="12" r="3" className="fill-primary/20 stroke-primary/60" strokeWidth="1" />
      </svg>
    ),
  },
];

export function HowItWorksSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section id="how-it-works" className="py-24 bg-background" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <div className="text-center mb-16">
            <span className="text-xs text-primary font-semibold uppercase tracking-widest">
              How It Works
            </span>
            <h2 className="mt-2 text-4xl sm:text-5xl font-black tracking-tight">
              Up and running in four steps
            </h2>
          </div>

          {/* Steps */}
          <div className="relative">
            {/* Connecting line (desktop) */}
            <div className="hidden lg:block absolute top-14 left-0 right-0 h-px">
              <svg viewBox="0 0 100 1" preserveAspectRatio="none" className="w-full h-4">
                <path
                  d="M5 0.5 Q 25 0.5 30 0.5 Q 50 0.5 50 0.5 Q 70 0.5 75 0.5 Q 95 0.5 95 0.5"
                  className="stroke-primary/20 animate-draw-line"
                  strokeWidth="0.5"
                  fill="none"
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {steps.map((s, i) => (
                <div key={s.step} className="relative flex flex-col items-start gap-4">
                  {/* Step number + icon */}
                  <div className="flex items-center gap-3 z-10">
                    <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-primary/8 border border-primary/25 relative">
                      {s.icon}
                      <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {i + 1}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base mb-1">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
