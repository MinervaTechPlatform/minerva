"use client";

import { useRevealOnScroll } from "./use-reveal";

const features = [
  {
    title: "Natural Conversations",
    description:
      "Human-like interactions that feel intuitive and fluid — no robotic back-and-forth.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <path
          d="M8 10a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H20l-8 6v-6H12a4 4 0 0 1-4-4V10z"
          className="stroke-primary/60"
          strokeWidth="1.5"
        />
        <path d="M14 17h12M14 22h8" className="stroke-primary/50 animate-draw-line" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Intent-Driven Engine",
    description:
      "Understands why users are asking, not just what, so responses are always on point.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <circle cx="20" cy="20" r="10" className="stroke-primary/50" strokeWidth="1.5" />
        <circle cx="20" cy="20" r="4" className="fill-primary/20 stroke-primary/60" strokeWidth="1.5" />
        <path d="M20 4v4M20 32v4M4 20h4M32 20h4" className="stroke-primary/30" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Multi-Channel Deployment",
    description:
      "Web, mobile, WhatsApp, and more — all channels in sync, all conversations unified.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <rect x="6" y="14" width="14" height="18" rx="3" className="stroke-primary/50" strokeWidth="1.5" />
        <rect x="22" y="10" width="12" height="22" rx="2" className="stroke-primary/50" strokeWidth="1.5" />
        <path d="M13 30h2M28 26h2" className="stroke-primary/40" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 6c4 0 8 2 10 5" className="stroke-primary/30 animate-draw-line" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Workflow Automation",
    description:
      "Turn conversations into actions automatically — bookings, escalations, follow-ups, and more.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <path d="M10 20l6-6 4 4 10-10" className="stroke-primary/60 animate-draw-line" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="20" r="3" className="fill-primary/15 stroke-primary/50" strokeWidth="1" />
        <circle cx="16" cy="14" r="3" className="fill-primary/15 stroke-primary/50" strokeWidth="1" />
        <circle cx="30" cy="8" r="3" className="fill-primary/15 stroke-primary/50" strokeWidth="1" />
        <path d="M16 20v10M16 30h8" className="stroke-primary/30" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Conversation Analytics",
    description:
      "See what users want, where they drop off, and exactly how to improve conversion.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <path d="M6 32V16l8-6 8 8 10-12" className="stroke-primary/60 animate-draw-line" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="6" y="30" width="6" height="6" rx="1" className="fill-primary/15 stroke-primary/30" strokeWidth="1" />
        <rect x="17" y="24" width="6" height="12" rx="1" className="fill-primary/20 stroke-primary/35" strokeWidth="1" />
        <rect x="28" y="18" width="6" height="18" rx="1" className="fill-primary/25 stroke-primary/40" strokeWidth="1" />
      </svg>
    ),
  },
  {
    title: "Modular Architecture",
    description:
      "Build, extend, and customize without limits. Composable agents, plug-and-play tools.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <rect x="6" y="6" width="12" height="12" rx="3" className="stroke-primary/50" strokeWidth="1.5" />
        <rect x="22" y="6" width="12" height="12" rx="3" className="stroke-primary/50" strokeWidth="1.5" />
        <rect x="6" y="22" width="12" height="12" rx="3" className="stroke-primary/50" strokeWidth="1.5" />
        <rect x="22" y="22" width="12" height="12" rx="3" className="stroke-primary/50" strokeWidth="1.5" />
        <path d="M18 12h4M18 28h4M12 18v4M28 18v4" className="stroke-primary/35 animate-draw-line" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function FeaturesSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section id="features" className="py-24 bg-background" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <div className="text-center mb-16">
            <span className="text-xs text-primary font-semibold uppercase tracking-widest">
              Key Features
            </span>
            <h2 className="mt-2 text-4xl sm:text-5xl font-black tracking-tight">
              Everything you need to{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                build intelligent conversations
              </span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-0.5"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="p-2 rounded-xl bg-primary/5 inline-block mb-4 group-hover:bg-primary/10 transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
