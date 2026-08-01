import { Toaster } from "sonner";
import { redirect } from "next/navigation";
import { OneSignalAdminInit } from "@/components/admin/OneSignalAdminInit";
import { AdminAssistantLazy } from "@/components/admin/AdminAssistantLazy";
import { AdminAssistantProvider } from "@/components/admin/AdminAssistantContext";
import { AdminPermissionsProvider } from "@/components/admin/AdminPermissionsContext";
import { AdminCountryProvider } from "@/components/admin/AdminCountryContext";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession } from "@/lib/auth/admin";
import { getCountryScope } from "@/lib/auth/country-scope";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getCountryScope() doesn't depend on the session, so resolve both
  // concurrently instead of paying for two sequential Supabase round-trips
  // on every single /admin/* navigation.
  const [session, countryScope] = await Promise.all([getAdminSession(), getCountryScope()]);
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="admin-shell min-h-screen font-sans" dir="rtl" lang="ar">
      <OneSignalAdminInit />
      <AdminPermissionsProvider access={session.access}>
        <AdminCountryProvider
          countries={countryScope.countries}
          selectedCountryId={countryScope.selectedCountryId}
        >
          <AdminAssistantProvider>
            <AdminShell>{children}</AdminShell>
            {session.access.isOwner ? <AdminAssistantLazy /> : null}
          </AdminAssistantProvider>
        </AdminCountryProvider>
      </AdminPermissionsProvider>
      <Toaster position="top-center" richColors theme="dark" dir="rtl" />
    </div>
  );
}
