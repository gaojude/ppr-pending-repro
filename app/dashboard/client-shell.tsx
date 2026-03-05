"use client";

// A trivial client component that wraps children — like CompatRouterAllowed
// or SWRConfig in vercel-site. The key is that this creates a CLIENT
// COMPONENT BOUNDARY. Flight must serialize {children} as a prop chunk.
//
// If anything inside children postpones during serialization via
// setTimeout(0), the ENTIRE prop chunk halts — not just the suspended
// component. The inner <Suspense> element hasn't been emitted yet,
// so it can't catch anything.

export function ClientShell({ children }: { children: React.ReactNode }) {
  return <div data-testid="CLIENT-SHELL">{children}</div>;
}
