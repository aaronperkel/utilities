import { requireAdmin } from "@/lib/auth";
import PortalTabs from "@/app/portal/PortalTabs";
import CustomEmailForm from "@/app/portal/email/CustomEmailForm";

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  await requireAdmin();
  const { ok } = await searchParams;

  return (
    <main>
      <PortalTabs active="email" />
      {ok && <div className="flash flash-ok">{ok}</div>}
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">Email all residents</span>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        Sends to everyone in the household, formatted like the reminder emails.
      </p>
      <CustomEmailForm />
    </main>
  );
}
