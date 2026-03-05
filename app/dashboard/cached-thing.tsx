import { cacheLife } from "next/cache";

// A "use cache" function — exactly like @vercel/flags-core's evaluate().
// On cache miss in dev mode, Next.js's use-cache-wrapper.ts:756 does:
//
//   if (process.env.NODE_ENV === 'development' && outerWorkUnitStore.cacheSignal) {
//     await new Promise((resolve) => setTimeout(resolve))
//   }
//
// This setTimeout(0) lands in PPR's abort timer phase → the whole
// Flight serialization task that's encoding this component halts.
async function getCachedValue(): Promise<string> {
  "use cache";
  cacheLife({ revalidate: 0, expire: 0 });
  cacheLife({ stale: 60 });
  // Simulate a flag evaluation or any "use cache" computation.
  return "cached-data-" + Math.floor(performance.now());
}

// Server component that calls the "use cache" function.
// Wrapped in <Suspense> in the layout — you'd EXPECT the Suspense to
// contain any suspension. But it doesn't, because:
//
// 1. This component is inside a CLIENT component's children prop
//    (the layout renders <ClientShell>{children}</ClientShell>)
// 2. Flight serializes all children as ONE prop chunk
// 3. The "use cache" setTimeout(0) → PPR abort mid-serialization
// 4. The ENTIRE chunk halts — including the <Suspense> element itself
//    and any sibling content ({children} = page's LayoutRouter)
// 5. Client receives a HALTED Lazy for the whole chunk
// 6. Suspense never mounted → can't catch the suspension
// 7. Bubbles to outer Suspense → shows skeleton fallback
export async function CachedThing() {
  const value = await getCachedValue();
  return (
    <div data-testid="CACHED-THING" style={{ background: "#dfd", padding: 8 }}>
      ✅ CachedThing rendered: {value}
    </div>
  );
}
