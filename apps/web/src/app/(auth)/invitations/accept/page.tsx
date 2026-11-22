import type { Metadata } from "next";
import { AuthPanel } from "../../../../components/auth/auth-panel";
import { InvitationAccept } from "../../../../components/invitation-accept";

export const metadata: Metadata = { title: "Accept invitation", referrer: "no-referrer" };

export default function AcceptInvitationPage() {
  return (
    <AuthPanel title="Join an organization">
      <InvitationAccept />
    </AuthPanel>
  );
}
