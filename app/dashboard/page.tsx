"use client";

// The actual page — a client component, trivially small RSC payload.
// Should render instantly on client navigation.
// But in SKELETON case, it never renders because the entire prop chunk
// (which includes this page's LayoutRouter slot) was halted.
export default function DashboardPage() {
  return (
    <div data-testid="PAGE-B" style={{ background: "#efe", padding: 10 }}>
      ✅ Dashboard page rendered successfully.
    </div>
  );
}
