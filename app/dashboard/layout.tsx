import { Suspense } from "react";
import { CachedThing } from "./cached-thing";
import { ClientShell } from "./client-shell";

// ════════════════════════════════════════════════════════════════════════
//  THE BUG:  "use cache" inside <Suspense> blocks client navigation
//            in dev mode despite being wrapped in a Suspense boundary.
// ════════════════════════════════════════════════════════════════════════
//
//  What you'd expect:
//    <Suspense> catches any suspension from <CachedThing>
//    → shows fallback
//    → {children} (the page) renders independently
//    → navigation shows the page immediately
//
//  What happens in dev:
//    <ClientShell> is a client component boundary. Flight serializes
//    its entire children tree (<div> containing <Suspense> + {children})
//    as ONE prop chunk. When <CachedThing>'s "use cache" misses:
//
//    1. use-cache-wrapper.ts:756 does `await setTimeout(0)` (DEV ONLY)
//    2. PPR abort fires in the same timer phase (via _idleStart patching)
//    3. Flight's serialization task aborts mid-tree
//    4. The ENTIRE prop chunk becomes a HALTED reference
//    5. Including <Suspense>, including {children}
//    6. Client receives one big Lazy → suspends at outer boundary
//    7. → SKELETON instead of page content
//
//  This is dev-only because the setTimeout(0) only exists behind:
//    process.env.NODE_ENV === 'development'
//
//  In production, "use cache" misses are handled synchronously
//  (as proper postpones or cache fills) — no timer race.
// ════════════════════════════════════════════════════════════════════════

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main>
      <h2>Dashboard Layout</h2>

      {/* Outer Suspense — catches suspension when the inner chunk halts.
          In SKELETON case, this fallback is what shows. */}
      <Suspense
        fallback={
          <div
            data-testid="SKELETON"
            style={{
              background: "#fee",
              border: "2px dashed red",
              padding: 20,
            }}
          >
            ⏳ SKELETON — the entire prop chunk halted because "use cache"
            did setTimeout(0) during Flight serialization. The inner Suspense
            never made it into the stream.
          </div>
        }
      >
        {/* ClientShell creates the client boundary. Its children prop
            is serialized as one Flight chunk containing BOTH the Suspense
            around CachedThing AND {children} (the page LayoutRouter). */}
        <ClientShell>
          <div>
            {/* You'd expect this Suspense to contain CachedThing's
                suspension. It would — IF it made it into the stream.
                But when the prop chunk halts, this Suspense element
                was never emitted. */}
            <Suspense
              fallback={
                <div data-testid="INNER-FALLBACK" style={{ color: "#999" }}>
                  Loading cached data...
                </div>
              }
            >
              <CachedThing />
            </Suspense>

            {/* This is the page content. It should render independently
                of CachedThing. But when the prop chunk halts, this is
                never reached either. */}
            {children}
          </div>
        </ClientShell>
      </Suspense>
    </main>
  );
}
