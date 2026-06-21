export default function AdminPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell min-h-screen font-sans" dir="rtl" lang="ar">
      {children}
    </div>
  );
}
