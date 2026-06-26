import { redirect } from "next/navigation";
import { assertOwnerUser } from "@/lib/auth/admin";
import { listStaffAction } from "./actions";
import { StaffAdminView } from "./StaffAdminView";

export const dynamic = "force-dynamic";

export default async function StaffAdminPage() {
  try {
    await assertOwnerUser();
  } catch {
    redirect("/admin?error=forbidden");
  }

  const staff = await listStaffAction();
  return <StaffAdminView initialStaff={staff} />;
}
