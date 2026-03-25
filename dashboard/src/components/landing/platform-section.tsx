"use client";

import { useRevealOnScroll } from "./use-reveal";

const pillars = [
  {
    title: "Plug-and-play tools",
    description: "Integrate with your existing stack in minutes, not months.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <rect x="4" y="12" width="10" height="8" rx="2" className="stroke-primary/60" strokeWidth="1.5" />
        <rect x="18" y="12" width="10" height="8" rx="2" className="stroke-primary/60" strokeWidth="1.5" />
        <path d="M14 16h4" className="stroke-primary animate-draw-line" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Composable agents",
    description: "Mix and match AI agents to build exactly the workflow you need.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <circle cx="16" cy="8" r="4" className="stroke-primary/60" strokeWidth="1.5" />
        <circle cx="8" cy="24" r="4" className="stroke-primary/60" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="4" className="stroke-primary/60" strokeWidth="1.5" />
        <path d="M14 11l-4 9M18 11l4 9M12 24h8" className="stroke-primary/40 animate-draw-line" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Industry-ready frameworks",
    description: "Pre-built frameworks for 5+ industries so you can deploy faster.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <rect x="4" y="4" width="10" height="10" rx="2" className="stroke-primary/60" strokeWidth="1.5" />
        <rect x="18" y="4" width="10" height="10" rx="2" className="stroke-primary/60" strokeWidth="1.5" />
        <rect x="4" y="18" width="10" height="10" rx="2" className="stroke-primary/60" strokeWidth="1.5" />
        <rect x="18" y="18" width="10" height="10" rx="2" className="stroke-primary/30" strokeWidth="1" strokeDasharray="2 2" />
        <path d="M21 21l4 4M25 21l-4 4" className="stroke-primary/50" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Extensible architecture",
    description: "Open APIs and webhooks let you build anything on top of Minerva.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M6 12l6-6 4 4 4-4 6 6" className="stroke-primary/60 animate-draw-line" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 20l6-6 4 4 4-4 6 6" className="stroke-primary/30 animate-draw-line" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 26h20" className="stroke-primary/20" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function PlatformSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section className="py-24 bg-accent/20" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-xs text-primary font-semibold uppercase tracking-widest">
                Platform Vision
              </span>
              <h2 className="mt-2 text-4xl sm:text-5xl font-black tracking-tight mb-4">
                More than a product.{" "}
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  A platform.
                </span>
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Minerva is designed as a{" "}
                <strong className="text-foreground">conversation infrastructure layer</strong>. You&apos;re not just using AI —
                you&apos;re building on it.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {pillars.map((p) => (
                  <div
                    key={p.title}
                    className="p-4 rounded-xl border border-border bg-background hover:border-primary/40 transition-all duration-200 group"
                  >
                    <div className="mb-2 group-hover:scale-110 transition-transform inline-block">
                      {p.icon}
                    </div>
                    <h3 className="text-sm font-bold text-foreground mb-1">{p.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture SVG */}
            <div className="flex justify-center">
              <ArchitectureSVG />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArchitectureSVG() {
  return (
    <svg
      viewBox="0 0 360 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-sm animate-float"
    >
      {/* Layer labels */}
      {[
        { y: 40, label: "Your Business Logic", w: 200 },
        { y: 110, label: "Composable Agents", w: 240 },
        { y: 180, label: "Minerva Core AI", w: 280 },
        { y: 250, label: "Data & Channels", w: 320 },
      ].map((layer, i) => (
        <g key={layer.label}>
          <rect
            x={(360 - layer.w) / 2}
            y={layer.y}
            width={layer.w}
            height={46}
            rx="8"
            className={`stroke-primary/30 ${i === 2 ? "fill-primary/10" : "fill-background"}`}
            strokeWidth="1.5"
          />
          <text
            x="180"
            y={layer.y + 27}
            textAnchor="middle"
            className={`${i === 2 ? "fill-primary" : "fill-muted-foreground"}`}
            fontSize="11"
            fontFamily="inherit"
            fontWeight={i === 2 ? "600" : "400"}
          >
            {layer.label}
          </text>
          {i < 3 && (
            <path
              d="M180 0 V8"
              transform={`translate(0,${layer.y + 46})`}
              className="stroke-primary/30 animate-draw-line"
              strokeWidth="1"
              strokeLinecap="round"
              markerEnd="url(#arrow)"
            />
          )}
        </g>
      ))}

      {/* Side decoration */}
      <path
        d="M30 60 Q20 160 30 260"
        className="stroke-primary/15 animate-draw-line"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <path
        d="M330 60 Q340 160 330 260"
        className="stroke-primary/15 animate-draw-line"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text x="16" y="168" className="fill-primary/30" fontSize="8" fontFamily="inherit" writingMode="tb">
        extensible
      </text>
      <text x="338" y="175" className="fill-primary/30" fontSize="8" fontFamily="inherit" writingMode="tb">
        composable
      </text>
    </svg>
  );
}
