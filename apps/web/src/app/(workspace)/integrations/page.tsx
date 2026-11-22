import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { getSection } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return <SectionPage section={getSection("integrations")} />;
}
