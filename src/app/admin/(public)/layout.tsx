export default function AdminPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)]" dir="rtl" lang="ar">
      {children}
    </div>
  );
}
