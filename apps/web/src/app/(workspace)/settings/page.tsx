import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { SystemStatus } from "../../../components/system-status";
import { getSection } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <SectionPage section={getSection("settings")}>
      <div className="mb-10">
        <SystemStatus />
      </div>
    </SectionPage>
  );
}
