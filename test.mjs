// ════════════════════════════════════════════════════════════════════════
//  E2E test: "use cache" inside <Suspense> blocks client navigation
//            in dev mode
// ════════════════════════════════════════════════════════════════════════
//
//  Demonstrates that a component using "use cache" wrapped in <Suspense>
//  can block an ENTIRE client navigation — even though you'd expect
//  Suspense to contain the suspension.
//
//  The bug is dev-only (use-cache-wrapper.ts:756 does setTimeout(0)
//  on cache miss only when NODE_ENV === 'development').
//
//  Run:
//    npx next dev --turbopack --port 3900    (terminal 1)
//    node test.mjs                            (terminal 2)
//
//  Expected output:
//    Some iterations show SKELETON (cache miss → setTimeout(0) → halt),
//    others show PAGE-B (cache hit → microtask → completes).
//    The "inner Suspense" fallback is NEVER shown — it doesn't exist
//    in the stream when the chunk halts.

import { chromium } from "playwright";
import { instant } from "@next/playwright";

const PORT = process.env.PORT || "3900";
const ITERS = parseInt(process.env.ITERS || "20", 10);
const BASE = `http://localhost:${PORT}`;

async function runOnce(browser, i) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Load entry page
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="PAGE-A"]', {
    state: "visible",
    timeout: 10000,
  });

  let result;

  // Use instant() to freeze at the PPR shell state — same as the
  // testing API used by vercel-site's screenshot tool.
  await instant(page, async () => {
    await new Promise((r) => setTimeout(r, 1000));
    // Client-navigate from Page A → Dashboard (Page B)
    await page.evaluate(() => {
      // @ts-ignore
      window.next.router.push("/dashboard");
    });

    // Wait for the navigation to commit and render.
    result = await page.evaluate(async () => {
      const t0 = performance.now();

      const POLL_MS = 50;
      const TIMEOUT_MS = 10_000;
      let sawSkeleton = false;
      let sawInnerFb = false;

      const vis = (el) =>
        el &&
        !el.closest("[hidden]") &&
        getComputedStyle(el).display !== "none";

      while (performance.now() - t0 < TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));

        const skeleton = document.querySelector('[data-testid="SKELETON"]');
        const pageB = document.querySelector('[data-testid="PAGE-B"]');
        const innerFb = document.querySelector(
          '[data-testid="INNER-FALLBACK"]',
        );
        const cached = document.querySelector('[data-testid="CACHED-THING"]');

        if (vis(skeleton)) sawSkeleton = true;
        if (vis(innerFb)) sawInnerFb = true;

        if (vis(pageB)) {
          return {
            outcome: sawSkeleton ? "SKEL→PAGE-B" : "PAGE-B",
            hasCached: vis(cached),
            hasInnerFb: vis(innerFb),
            sawSkeleton,
            sawInnerFb,
            t: performance.now() - t0,
          };
        }
      }

      // Timed out — report what we last saw.
      return {
        outcome: sawSkeleton
          ? "SKELETON"
          : sawInnerFb
            ? "INNER-FALLBACK"
            : "TIMEOUT",
        sawSkeleton,
        sawInnerFb,
        t: performance.now() - t0,
      };
    });
  });

  await new Promise((r) => setTimeout(r, 3000));

  await ctx.close();
  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────

const ver = JSON.parse(
  await (
    await import("fs/promises")
  ).readFile("/tmp/ppr-use-cache-repro/node_modules/next/package.json", "utf8"),
).version;

console.log(`
${"═".repeat(70)}
  "use cache" inside <Suspense> blocks client navigation (dev-only bug)
  next@${ver}  |  ${ITERS} iterations
${"═".repeat(70)}

  Expected behavior:
    <Suspense> catches CachedThing's suspension
    → inner fallback shows  OR  cached data renders
    → page content always renders (not blocked)

  Actual behavior in dev (flaky):
    "use cache" miss → setTimeout(0) → PPR abort halts the entire
    Flight prop chunk → <Suspense> never emitted → outer SKELETON

  Legend:
    ✅ PAGE-B     = page rendered (cache hit, no setTimeout)
    ⏳ SKELETON   = entire chunk halted (cache miss, setTimeout race)
    📦 INNER-FB   = inner Suspense caught it (expected but never happens)
    🔄 SKEL→PAGE  = skeleton then resolved (would mean timer-only delay)
`);

const browser = await chromium.launch({ headless: false });

// Pre-warm: compile both routes
const warmCtx = await browser.newContext();
const warmPage = await warmCtx.newPage();
await warmPage.goto(`${BASE}/dashboard`, { waitUntil: "load", timeout: 30000 });
await warmCtx.close();

const results = [];

for (let i = 1; i <= ITERS; i++) {
  const r = await runOnce(browser, i);
  results.push(r);

  const icon =
    r.outcome === "PAGE-B"
      ? "✅"
      : r.outcome === "SKELETON"
        ? "⏳"
        : r.outcome === "INNER-FALLBACK"
          ? "📦"
          : r.outcome === "SKEL→PAGE-B"
            ? "🔄"
            : "❓";

  const extra = [];
  if (r.hasCached) extra.push("+cached");
  if (r.hasInnerFb) extra.push("+inner-fallback");

  console.log(
    `  [${String(i).padStart(2)}]  ${icon} ${r.outcome.padEnd(14)}  @${String(Math.round(r.t)).padStart(4)}ms  ${extra.join(" ")}`,
  );
}

await browser.close();

const pageB = results.filter((r) => r.outcome === "PAGE-B").length;
const skel = results.filter((r) => r.outcome === "SKELETON").length;
const inner = results.filter((r) => r.outcome === "INNER-FALLBACK").length;
const trans = results.filter((r) => r.outcome === "SKEL→PAGE-B").length;
const other = ITERS - pageB - skel - inner - trans;

console.log(`
${"─".repeat(70)}
  ${pageB} PAGE-B  |  ${skel} SKELETON  |  ${inner} INNER-FALLBACK  |  ${trans} SKEL→PAGE  |  ${other} OTHER
${"─".repeat(70)}`);

if (skel > 0 && pageB > 0) {
  console.log(`
  🎯 BUG REPRODUCED

  ${skel}/${ITERS} navigations showed SKELETON — the "use cache" component
  blocked the ENTIRE navigation despite being wrapped in <Suspense>.

  The inner Suspense fallback was shown ${inner} times (expected: sometimes).
  It's never shown because the <Suspense> element itself is inside the
  halted Flight chunk — it never made it to the client.

  Root cause: use-cache-wrapper.ts:756 does setTimeout(0) on cache miss
  in dev mode. This setTimeout lands in PPR's abort timer phase. Flight
  serialization aborts the whole prop chunk, not just the suspended
  component. Suspense boundaries inside the chunk are lost.

  This is DEV-ONLY. In production, cache misses use synchronous postpone
  (not setTimeout), so Suspense correctly contains the suspension.
`);
} else if (skel === ITERS) {
  console.log(`
  All SKELETON — cache always missed. The bug is consistent here.
  (Inner Suspense fallback never shown: ${inner} times — confirms
  the <Suspense> element was lost in the halted chunk.)
`);
} else if (pageB === ITERS) {
  console.log(`
  All PAGE-B — cache always hit. Try clearing .next and restarting
  the dev server to trigger cache misses: rm -rf .next && npx next dev
`);
}

process.exit(skel > 0 ? 0 : 1);
