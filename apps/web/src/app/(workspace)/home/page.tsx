import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { SystemStatus } from "../../../components/system-status";
import { getSection } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <SectionPage section={getSection("home")}>
      <div className="mb-10">
        <SystemStatus />
      </div>
    </SectionPage>
  );
}
