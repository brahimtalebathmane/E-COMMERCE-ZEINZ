export default function AdminPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell admin-root" dir="rtl" lang="ar">
      {children}
    </div>
  );
}
