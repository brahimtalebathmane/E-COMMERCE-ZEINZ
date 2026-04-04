export default function AdminPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)] font-sans" dir="rtl" lang="ar">
      {children}
    </div>
  );
}
