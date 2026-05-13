"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Header typeahead. Hits /api/search with a debounce, renders grouped
// dropdown of hits (people · venues · gigs), supports keyboard nav
// (↑/↓ to move through flat list, Enter to open, Esc to close), and
// closes when you click outside. Designed to feel like the rest of the
// nav — quiet, paper-and-ink, no flashing UI.

type Hit = {
  kind: "musician" | "venue" | "gig";
  id: string;
  title: string;
  sub: string | null;
  href: string;
};

const KIND_LABEL: Record<Hit["kind"], string> = {
  musician: "People",
  venue: "Venues",
  gig: "Gigs",
};

const KIND_ORDER: Hit["kind"][] = ["musician", "venue", "gig"];

export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounced fetch. We aren't aborting in-flight requests — the typical
  // request finishes well under 100ms and we only care about the latest
  // result, so we drop responses whose query doesn't match the current
  // input value at resolution time.
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { credentials: "same-origin" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { q: string; hits: Hit[] };
        // Drop stale responses (the user kept typing past this query).
        if (json.q === trimmed) {
          setHits(json.hits);
          setSelectedIndex(0);
        }
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Group hits by kind for display while keeping a flat array for keyboard
  // nav. selectedIndex is the position in the flat list.
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: hits.filter((h) => h.kind === kind),
  })).filter((g) => g.items.length > 0);
  const flat = grouped.flatMap((g) => g.items);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[selectedIndex];
      if (hit) {
        router.push(hit.href);
        close();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
      inputRef.current?.blur();
    }
  };

  const close = () => {
    setOpen(false);
    setQ("");
    setHits([]);
    setSelectedIndex(0);
  };

  const onClickHit = (hit: Hit) => {
    router.push(hit.href);
    close();
  };

  const showDropdown =
    open && (q.trim().length >= 2 || loading) && (loading || flat.length > 0 || q.trim().length >= 2);

  return (
    <div ref={containerRef} className="relative w-[220px]">
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (q.trim().length >= 2) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search gigs, venues, people…"
        className="w-full rounded-md border border-line bg-paper py-[7px] pl-[30px] pr-3 text-[12px] text-ink placeholder-ink-mute outline-none focus:border-accent"
      />
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-mute">
        ⌕
      </span>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[420px] overflow-auto rounded-md border border-line bg-surface shadow-[0_12px_28px_-12px_rgba(26,20,16,0.18)]">
          {loading && flat.length === 0 && (
            <div className="px-3 py-2.5 text-[12px] italic text-ink-mute">
              Searching…
            </div>
          )}
          {!loading && flat.length === 0 && q.trim().length >= 2 && (
            <div className="px-3 py-2.5 text-[12px] italic text-ink-mute">
              No matches for &ldquo;{q.trim()}&rdquo;
            </div>
          )}
          {grouped.map((group) => {
            // Build the flat-index offset for this group so we know which
            // row corresponds to selectedIndex when highlighting.
            const offset = flat.findIndex((h) => h === group.items[0]);
            return (
              <div key={group.kind} className="py-1">
                <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                  {KIND_LABEL[group.kind]}
                </div>
                {group.items.map((hit, i) => {
                  const idx = offset + i;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={`${hit.kind}-${hit.id}`}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => onClickHit(hit)}
                      className={`block w-full px-3 py-2 text-left transition-colors ${
                        isSelected ? "bg-paper-warm" : "hover:bg-paper-warm/60"
                      }`}
                    >
                      <div className="font-serif text-[14px] text-ink leading-tight">
                        {hit.title}
                      </div>
                      {hit.sub && (
                        <div className="mt-0.5 text-[11px] text-ink-mute leading-tight">
                          {hit.sub}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
