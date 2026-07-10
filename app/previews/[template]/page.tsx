import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  customEmailHtml,
  emailIdentity,
  newBillEmailHtml,
  reminderEmailHtml,
} from "@/lib/emails";

// Renders the real production template functions with sample data.
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  await requireUser();
  const { template } = await params;
  const id = emailIdentity();

  const sample = {
    personName: "Aaron",
    item: "Electric",
    total: 105.42,
    cost: 35.14,
    dueDate: "2026-08-01",
  };

  let html: string;
  switch (template) {
    case "reminder":
      html = reminderEmailHtml(sample, id);
      break;
    case "newbill":
      html = newBillEmailHtml(
        { ...sample, billViewLink: `${id.baseUrl}/files/2026/Electric/0623.pdf` },
        id,
      );
      break;
    case "custom":
      html = customEmailHtml(
        "Hey everyone,\n\nJust a heads up that the internet bill will be a few dollars higher this month.\n\nThanks!",
        id,
      );
      break;
    default:
      notFound();
  }

  return (
    <main>
      <h2 className="section-title">Preview: {template}</h2>
      <div className="rounded-(--radius-md) bg-white p-6">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </main>
  );
}
