export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "monospace", padding: 20 }}>{children}</body>
    </html>
  );
}
