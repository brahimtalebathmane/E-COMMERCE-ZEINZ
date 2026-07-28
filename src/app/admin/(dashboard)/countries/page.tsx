import { redirect } from "next/navigation";
import { assertOwnerUser } from "@/lib/auth/admin";
import { listCountriesAction } from "./actions";
import { CountriesAdminView } from "./CountriesAdminView";

export const dynamic = "force-dynamic";

export default async function CountriesAdminPage() {
  try {
    await assertOwnerUser();
  } catch {
    redirect("/admin?error=forbidden");
  }

  const countries = await listCountriesAction();
  return <CountriesAdminView initialCountries={countries} />;
}
