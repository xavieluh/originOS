import type { Metadata } from "next";
import { SectionPage } from "../../components/section-page";
import { developerSection } from "../../lib/navigation";

export const metadata: Metadata = { title: "Developer console" };

export default function DevelopersPage() {
  return <SectionPage section={developerSection} />;
}
