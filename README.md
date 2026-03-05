# "use cache" inside Suspense blocks client navigation (dev-only)

## The Bug

A server component using `"use cache"` wrapped in `<Suspense>` can block
an **entire client navigation** in dev mode — even though Suspense should
contain the suspension.

```
Page A  →  router.push('/dashboard')  →  Page B (blocked!)
```

## Expected vs Actual

**Expected:**
```
<Suspense fallback={<Loading/>}>     catches any suspension
  <CachedThing/>                      "use cache" component
</Suspense>
{children}                            page renders independently
```

**Actual (dev, cache miss):**
```
<ClientShell>                         client component boundary
  <div>                                Flight serializes as ONE prop chunk
    <Suspense>                         never emitted (chunk halted first)
      <CachedThing/>                   setTimeout(0) from "use cache"
    </Suspense>
    {children}                         never reached (same chunk)
  </div>
</ClientShell>
→ entire chunk = HALTED Lazy → outer Suspense catches → SKELETON
```

## Root Cause

`next/src/server/use-cache/use-cache-wrapper.ts:756`:

```js
// DEV ONLY
if (process.env.NODE_ENV === 'development' && outerWorkUnitStore.cacheSignal) {
  await new Promise((resolve) => setTimeout(resolve))
}
```

On `"use cache"` miss in dev:
1. `setTimeout(0)` is awaited
2. PPR's abort timers (`_idleStart`-patched, same timer phase) fire first
3. Flight's serialization task aborts **at the chunk level**
4. Everything in that chunk — including `<Suspense>` and `{children}` — halts
5. Client receives a HALTED Lazy → suspension bubbles to the outer boundary

Flight has **no concept of Suspense** — it's just serializing a JSON-like tree.
When serialization aborts mid-tree, siblings are lost regardless of boundaries.

## Why Production Is Fine

In production, `"use cache"` misses don't go through `setTimeout(0)`.
Cache fills and postpones happen synchronously during Flight serialization,
so Suspense boundaries are emitted to the stream and properly contain
any suspended children on the client.

## Running

```bash
# Terminal 1
npx next dev --turbopack --port 3900

# Terminal 2
node test.mjs

# To force cache misses (more SKELETONs):
rm -rf .next && npx next dev --turbopack --port 3900
```

## What You'll See

```
  [ 1]  ✅ PAGE-B          @ 130ms
  [ 2]  ⏳ SKELETON        @ 340ms    ← BLOCKED despite Suspense!
  [ 3]  ✅ PAGE-B          @ 125ms
  [ 4]  ⏳ SKELETON        @ 335ms
  ...
  BUG REPRODUCED
  Inner Suspense fallback shown 0 times — it never makes it to the client.
```
