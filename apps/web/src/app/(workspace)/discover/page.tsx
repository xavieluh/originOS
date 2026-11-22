import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { getSection } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return <SectionPage section={getSection("discover")} />;
}
