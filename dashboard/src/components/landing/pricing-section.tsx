"use client";

import Link from "next/link";
import { useRevealOnScroll } from "./use-reveal";

const highlights = [
  { label: "7-day free trial", icon: "⚡" },
  { label: "1 business included", icon: "🏢" },
  { label: "Upgrade anytime", icon: "↑" },
];

export function PricingSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section id="pricing" className="py-24 bg-accent/20" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <div className="text-center mb-12">
            <span className="text-xs text-primary font-semibold uppercase tracking-widest">
              Pricing
            </span>
            <h2 className="mt-2 text-4xl sm:text-5xl font-black tracking-tight">
              Start free.{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Scale as you grow.
              </span>
            </h2>
          </div>

          <div className="relative p-8 md:p-12 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/8 to-primary/3 overflow-hidden">
            {/* Decorative SVG */}
            <div className="absolute right-0 top-0 opacity-10">
              <svg viewBox="0 0 200 200" className="w-64 h-64">
                <circle cx="100" cy="100" r="80" className="stroke-primary animate-spin-slow" strokeWidth="1" fill="none" strokeDasharray="8 6" />
                <circle cx="100" cy="100" r="50" className="stroke-primary" strokeWidth="0.5" fill="none" />
              </svg>
            </div>

            <div className="relative flex flex-col md:flex-row items-start md:items-center gap-10">
              <div className="flex-1">
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-6xl font-black text-foreground">Free</span>
                  <span className="text-muted-foreground text-sm mb-2">to start</span>
                </div>
                <p className="text-muted-foreground mb-6">
                  No hidden costs. No surprises. Upgrade anytime for advanced
                  capabilities.
                </p>

                <ul className="flex flex-col gap-3 mb-8">
                  {highlights.map((h) => (
                    <li key={h.label} className="flex items-center gap-3 text-sm text-foreground">
                      <span className="text-base">{h.icon}</span>
                      {h.label}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/auth/signin"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5"
                >
                  Start Your Free Trial
                </Link>
              </div>

              {/* Divider */}
              <div className="hidden md:block w-px h-40 bg-primary/20" />

              {/* What's included tick list */}
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-1">
                  Included in trial
                </p>
                {[
                  "AI conversation engine",
                  "1 business configuration",
                  "Multi-channel deployment",
                  "Conversation analytics",
                  "Email support",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-muted-foreground">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0">
                      <circle cx="8" cy="8" r="7" className="stroke-primary/40" strokeWidth="1" fill="none" />
                      <path d="M5 8l2 2 4-4" className="stroke-primary" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
