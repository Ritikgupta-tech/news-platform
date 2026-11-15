import type { Metadata } from "next";
import { CampaignForm } from "@/components/admin/CampaignForm";
import { requirePageAccess } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "New campaign", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewCampaign() {
  const access = await requirePageAccess("/admin/newsletters/campaigns/new", "newsletter:manage");
  if ("denied" in access) return access.denied;
  return (
    <div className="stack narrow">
      <div className="page-head"><h1>New campaign</h1><p className="muted">You can send yourself a test and choose when to send after saving the draft.</p></div>
      <CampaignForm />
    </div>
  );
}
