import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { getSection } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Agents" };

export default function AgentsPage() {
  return <SectionPage section={getSection("agents")} />;
}
