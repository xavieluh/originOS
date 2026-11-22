import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { getSection } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Research" };

export default function ResearchPage() {
  return <SectionPage section={getSection("research")} />;
}
