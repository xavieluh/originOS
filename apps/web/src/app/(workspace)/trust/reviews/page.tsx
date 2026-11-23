import type { ReviewView } from "@originos/contracts";
import { Button, ErrorState, PageHeader } from "@originos/ui";
import type { Metadata } from "next";
import { ReviewList } from "../../../../components/identity";
import { apiFetch } from "../../../../lib/api";
import { requireWorkspace } from "../../../../lib/session";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string }>;
}) {
  const { active } = await requireWorkspace();
  const status = (await searchParams).status === "decided" ? "decided" : "pending";
  const reviews = await apiFetch<ReviewView[]>(`/v1/identity/reviews?status=${status}`);
  const isAdmin = active.role === "owner" || active.role === "admin";
  return (
    <>
      <PageHeader
        eyebrow="IdentityMesh"
        title="Review queue"
        description={
          isAdmin
            ? "Claims and ownership requests waiting for a human decision. You cannot decide your own requests. Every decision records who, when, why and the evidence fingerprint."
            : "Your review requests and requests about profiles you own. Owners and admins decide them."
        }
      />
      <div className="mb-4 flex gap-2">
        <Button
          action="identity.reviews-pending"
          href="/trust/reviews"
          size="sm"
          variant={status === "pending" ? "primary" : "ghost"}
        >
          Waiting
        </Button>
        <Button
          action="identity.reviews-decided"
          href="/trust/reviews?status=decided"
          size="sm"
          variant={status === "decided" ? "primary" : "ghost"}
        >
          Decided
        </Button>
      </div>
      {reviews.ok ? (
        <ReviewList
          reviews={reviews.data}
          showProfile
          canRevoke={isAdmin}
          emptyTitle={status === "pending" ? "Nothing waiting" : "Nothing decided yet"}
          emptyText={
            status === "pending"
              ? "Requests appear here when someone asks for a claim to be reviewed or for ownership of a profile."
              : "Approved, rejected, withdrawn and revoked requests appear here."
          }
        />
      ) : (
        <ErrorState title="Could not load the review queue">{reviews.message}</ErrorState>
      )}
    </>
  );
}
