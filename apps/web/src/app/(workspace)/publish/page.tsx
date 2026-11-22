import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { getSection } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Publish" };

export default function PublishPage() {
  return <SectionPage section={getSection("publish")} />;
}
