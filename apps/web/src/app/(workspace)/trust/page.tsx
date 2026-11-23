import { Button } from "@originos/ui";
import type { Metadata } from "next";
import { SectionPage } from "../../../components/section-page";
import { getSection } from "../../../lib/navigation";
import { requireWorkspace } from "../../../lib/session";

export const metadata: Metadata = { title: "Trust" };

export default async function TrustPage() {
  await requireWorkspace();
  return (
    <SectionPage section={getSection("trust")}>
      <div className="mb-8 flex flex-col gap-3">
        <p className="max-w-3xl text-fg-muted">
          IdentityMesh: creator and organization profiles, with ownership proofs for domains and
          accounts and a human review queue for claims OriginOS cannot check itself. Each badge says
          what was checked, how and when, and what it does not show.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button action="trust.profiles" href="/trust/profiles" variant="primary">
            Profiles
          </Button>
          <Button action="trust.reviews" href="/trust/reviews">
            Review queue
          </Button>
        </div>
      </div>
    </SectionPage>
  );
}
