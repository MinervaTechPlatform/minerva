import * as React from "react";
import { ChevronDown, ChevronUp, Loader2, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingBoxProps {
  content: string;
  isThinking: boolean;
}

export function ThinkingBox({ content, isThinking }: ThinkingBoxProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  
  // Track previous isThinking to detect completion
  const prevIsThinkingRef = React.useRef(isThinking);

  React.useEffect(() => {
    // Auto-scroll to bottom of thinking box when new content arrives
    if (isThinking && scrollRef.current) {
      const el = scrollRef.current;
      // Scroll to the bottom 
      el.scrollTop = el.scrollHeight;
    }
  }, [content, isThinking]);

  React.useEffect(() => {
    // If we just finished thinking, automatically collapse
    if (prevIsThinkingRef.current && !isThinking) {
      setTimeout(() => setIsExpanded(false), 500);
    }
    prevIsThinkingRef.current = isThinking;
  }, [isThinking]);

  if (!content && !isThinking) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-muted-foreground/15 bg-muted/30 shadow-sm transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between bg-muted/40 px-3.5 py-2 hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isThinking ? (
            <div className="relative">
              <BrainCircuit className="h-4 w-4 text-primary animate-pulse" />
              <Loader2 className="absolute -bottom-1 -right-1 h-2 w-2 animate-spin text-primary" />
            </div>
          ) : (
            <BrainCircuit className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={cn(
            "text-[11px] font-semibold uppercase tracking-wider",
            isThinking ? "text-primary" : "text-muted-foreground"
          )}>
            {isThinking ? "Processing thought…" : "Internal Reasoning"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isThinking && (
             <span className="text-[10px] text-muted-foreground/60 mr-1">Completed</span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground/50 transition-transform" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground/50 transition-transform" />
          )}
        </div>
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="relative border-t border-muted-foreground/10 px-4 py-3">
             {/* Left accent line */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/20" />
            
            <div 
              ref={scrollRef}
              className="max-h-24 overflow-y-auto pr-1 text-xs scroll-smooth"
            >
              <p className="text-[13px] leading-relaxed italic text-muted-foreground/85 whitespace-pre-wrap font-serif">
                {content || "..."}
                {isThinking && (
                  <span className="inline-block h-3 w-1 animate-pulse bg-primary/40 ml-1 rounded-sm align-middle" />
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
