"use client";

import Link from "next/link";

const footerLinks = {
  Product: ["Features", "Use Cases", "Pricing", "Changelog"],
  Company: ["About", "Blog", "Careers", "Contact"],
  Legal: ["Privacy Policy", "Terms of Service", "Security"],
};

export function Footer() {
  return (
    <footer className="bg-muted/30 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              {/* Placeholder logo */}
              <div className="relative w-7 h-7">
                <svg viewBox="0 0 28 28" fill="none" className="w-7 h-7">
                  <circle cx="14" cy="14" r="6" className="stroke-primary" strokeWidth="1.5" />
                  <path d="M14 3v4M14 21v4M3 14h4M21 14h4" className="stroke-primary/50 " strokeWidth="1" strokeLinecap="round" />
                </svg>
              </div>
              <span className="font-bold text-foreground">Minerva</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[180px]">
              The Operating System for Intelligent Business Conversations.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">
                {group}
              </p>
              <ul className="flex flex-col gap-2">
                {links.map((link) => (
                  <li key={link}>
                    <Link
                      href="#"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Minerva. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground text-center italic">
            Minerva — The Operating System for Intelligent Business Conversations
          </p>
        </div>
      </div>
    </footer>
  );
}
