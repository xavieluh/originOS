import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { getSection } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Trust" };

export default function TrustPage() {
  return <SectionPage section={getSection("trust")} />;
}
