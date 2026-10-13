import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export type TourStep = { target: string; title: string; body: string };

const TOUR_STEPS: TourStep[] = [
  {
    target: "scan",
    title: "Automatic scanning",
    body: "Checks every source at once — company job boards on Greenhouse, Ashby, and Lever, plus remote job boards — and adds new matches to your feed. See when the last scan ran, and run a new one any time from here.",
  },
  {
    target: "interested",
    title: "Your shortlist",
    body: "Mark any job Interested, Applied, or Not Interested with the buttons on its row. Interested jobs stay pinned here at the top, and choosing Applied moves the job to the Applications tab.",
  },
  {
    target: "nav-applications",
    title: "Track applications",
    body: "Follow each application through the screen, interview, and offer stages, keep notes, and export everything to CSV.",
  },
  {
    target: "nav-checklist",
    title: "No standard job board?",
    body: "Companies without a supported job board. Open each careers page from here and the app remembers when you last checked.",
  },
  {
    target: "nav-settings",
    title: "Make it yours",
    body: "Add a company by pasting its careers page URL, and tune the keywords and locations that decide what counts as a match.",
  },
];

const PAD = 6;
const POPOVER_W = 320;
const GAP = 12;

// The sidebar renders twice (desktop aside + mobile drawer), so pick the
// copy that's actually on screen.
function findVisible(target: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of els) if (el.getClientRects().length > 0) return el;
  return null;
}

export function ProductTour({ open, onClose, steps = TOUR_STEPS }: {
  open: boolean;
  onClose: () => void;
  steps?: TourStep[];
}) {
  const [active, setActive] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Steps whose target isn't on screen (e.g. sidebar items on a phone, where
  // the menu is collapsed) are skipped rather than pointing at nothing.
  useEffect(() => {
    if (!open) { setActive([]); return; }
    const visible = steps.filter((s) => findVisible(s.target));
    if (visible.length === 0) { onClose(); return; }
    setActive(visible);
    setIndex(0);
  }, [open, steps, onClose]);

  const step = open ? active[index] : undefined;

  const measure = useCallback(() => {
    const el = step && findVisible(step.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    findVisible(step.target)?.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!step || !rect || typeof document === "undefined") return null;

  const isLast = index === active.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Sidebar items: place the popover to the right. Everything else: below,
  // or above if there isn't room.
  let top: number;
  let left: number;
  if (rect.right + GAP + POPOVER_W < vw && rect.left < 280) {
    left = rect.right + GAP;
    top = Math.max(GAP, Math.min(rect.top - 8, vh - 200));
  } else {
    left = Math.max(GAP, Math.min(rect.left, vw - POPOVER_W - GAP));
    top = rect.bottom + GAP + 180 < vh ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - 180);
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={step.title}>
      <div
        className="absolute rounded-lg transition-all duration-200 pointer-events-none ring-2 ring-primary"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)",
        }}
      />
      <div
        className="absolute rounded-lg border border-border bg-card text-card-foreground shadow-xl p-4 space-y-2"
        style={{ top, left, width: POPOVER_W, maxWidth: `calc(100vw - ${GAP * 2}px)` }}
      >
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {index + 1} of {active.length}
        </div>
        <div className="text-sm font-semibold">{step.title}</div>
        <p className="text-sm text-muted-foreground">{step.body}</p>
        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Close tour</Button>
          <Button size="sm" onClick={() => (isLast ? onClose() : setIndex((i) => i + 1))}>
            {isLast ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
