import { Toaster } from "sonner";
import { OneSignalAdminInit } from "@/components/admin/OneSignalAdminInit";
import { AdminAssistant } from "@/components/admin/AdminAssistant";
import { AdminAssistantProvider } from "@/components/admin/AdminAssistantContext";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell min-h-screen font-sans" dir="rtl" lang="ar">
      <OneSignalAdminInit />
      <AdminAssistantProvider>
        <AdminShell>{children}</AdminShell>
        <AdminAssistant />
      </AdminAssistantProvider>
      <Toaster position="top-center" richColors theme="dark" dir="rtl" />
    </div>
  );
}
