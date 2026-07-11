import PortalTabs from "@/app/portal/PortalTabs";

// Instant shell for /portal/household: real tab bar + skeleton sections.
export default function HouseholdLoading() {
  return (
    <main aria-busy="true">
      <PortalTabs active="household" />

      {[0, 1, 2].map((section) => (
        <section key={section} className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <div className="skeleton h-3 w-24" />
            <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          </div>
          <div className="panel divide-y divide-line-soft">
            {[0, 1].map((row) => (
              <div key={row} className="flex items-center justify-between px-4 py-4">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton h-4 w-16" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
