import Link from "next/link";

// PAGE A — entry point. Navigate to /dashboard to trigger the bug.
export default function PageA() {
  return (
    <main>
      <h1>Page A (entry)</h1>
      <p>
        <Link href="/dashboard" data-testid="nav-link">
          → Navigate to /dashboard
        </Link>
      </p>
      <div data-testid="PAGE-A" style={{ background: "#eef", padding: 10 }}>
        This is the entry page. Click the link above to client-navigate to the
        dashboard.
      </div>
    </main>
  );
}
