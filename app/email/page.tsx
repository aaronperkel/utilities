import { requireAdmin } from "@/lib/auth";
import CustomEmailForm from "@/app/email/CustomEmailForm";

export default async function EmailPage() {
  await requireAdmin();

  return (
    <main>
      <h2 className="section-title">Send Custom Email to All Users</h2>
      <CustomEmailForm />
    </main>
  );
}
