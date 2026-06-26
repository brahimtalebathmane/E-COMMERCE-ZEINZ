import { Toaster } from "sonner";
import { redirect } from "next/navigation";
import { OneSignalAdminInit } from "@/components/admin/OneSignalAdminInit";
import { AdminAssistant } from "@/components/admin/AdminAssistant";
import { AdminAssistantProvider } from "@/components/admin/AdminAssistantContext";
import { AdminPermissionsProvider } from "@/components/admin/AdminPermissionsContext";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession } from "@/lib/auth/admin";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="admin-shell min-h-screen font-sans" dir="rtl" lang="ar">
      <OneSignalAdminInit />
      <AdminPermissionsProvider access={session.access}>
        <AdminAssistantProvider>
          <AdminShell>{children}</AdminShell>
          {session.access.isOwner ? <AdminAssistant /> : null}
        </AdminAssistantProvider>
      </AdminPermissionsProvider>
      <Toaster position="top-center" richColors theme="dark" dir="rtl" />
    </div>
  );
}
