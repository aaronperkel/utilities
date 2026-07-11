import PortalTabs from "@/app/portal/PortalTabs";

// Instant shell for /portal/email: real tab bar + form skeleton.
export default function EmailLoading() {
  return (
    <main aria-busy="true">
      <PortalTabs active="email" />

      <div className="mb-2 flex items-center gap-3">
        <div className="skeleton h-3 w-36" />
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
      <div className="skeleton mb-4 h-4 w-72 max-w-full" />
      <div className="panel space-y-4 p-5">
        <div className="skeleton h-9 w-full" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-9 w-28" />
      </div>
    </main>
  );
}
