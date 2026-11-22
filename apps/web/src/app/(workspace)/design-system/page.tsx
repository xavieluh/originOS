import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  EventBadge,
  LoadingState,
  NotYetAvailable,
  PageHeader,
  StatusBadge,
  Timeline,
} from "@originos/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonDemo, DrawerDemo, FormDemo } from "../../../components/gallery-demos";
import { isGalleryEnabled, loadWebServerEnv } from "../../../lib/env";

export const metadata: Metadata = { title: "Design system" };
export const dynamic = "force-dynamic";

// Fixture rows for the gallery only. Not product data.
const FIXTURE_ROWS = [
  {
    id: "fixture_run_01",
    agent: "Example agent A",
    status: "Observed",
    at: "2026-01-01T09:00:00Z",
  },
  {
    id: "fixture_run_02",
    agent: "Example agent B",
    status: "Declared",
    at: "2026-01-01T09:05:00Z",
  },
];

export default function DesignSystemPage() {
  if (!isGalleryEnabled(loadWebServerEnv())) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Development tool"
        title="Design system"
        description="Every shared component in its states. All data on this page is labelled fixture data."
      />
      <div className="grid gap-6">
        <Card
          title="Buttons"
          description="Every button names its action and does something visible."
        >
          <ButtonDemo />
        </Card>
        <Card title="Badges" description="Meaning is in the words; colour only reinforces it.">
          <div className="flex flex-wrap gap-2">
            <Badge label="Neutral" tone="neutral" />
            <Badge label="Accent" tone="accent" />
            <Badge label="Positive" tone="positive" />
            <Badge label="Warning" tone="warning" />
            <Badge label="Negative" tone="negative" />
            <Badge label="Info" tone="info" />
            <StatusBadge label="Ready" tone="positive" />
          </div>
          <h3 className="mt-4 mb-2 text-sm font-semibold">Evidence basis</h3>
          <div className="flex flex-wrap gap-2">
            <EventBadge label="Observed" basis="observed" />
            <EventBadge label="Confirmed" basis="confirmed" />
            <EventBadge label="Validated" basis="validated" />
            <EventBadge label="Declared" basis="declared" />
            <EventBadge label="Assessed" basis="assessed" />
            <EventBadge label="Failed" basis="failed" />
          </div>
        </Card>
        <Card title="Table" description="Fixture data.">
          <DataTable
            caption="Example runs (fixture)"
            columns={[
              { key: "id", header: "ID", cell: (r) => r.id, mono: true },
              { key: "agent", header: "Agent", cell: (r) => r.agent },
              { key: "status", header: "Basis", cell: (r) => r.status },
              { key: "at", header: "Time", cell: (r) => r.at, mono: true },
            ]}
            rows={FIXTURE_ROWS}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No runs" />}
          />
        </Card>
        <Card title="Timeline" description="Fixture data.">
          <Timeline
            label="Example history (fixture)"
            items={[
              {
                id: "t1",
                at: "2026-01-01T09:00:00Z",
                title: "Draft created",
                badge: <EventBadge label="Observed" basis="observed" />,
              },
              {
                id: "t2",
                at: "2026-01-01T09:30:00Z",
                title: "Author declared AI assistance",
                badge: <EventBadge label="Declared" basis="declared" />,
              },
            ]}
          />
        </Card>
        <Card title="Forms">
          <FormDemo />
        </Card>
        <Card title="Drawer">
          <DrawerDemo />
        </Card>
        <Card title="States">
          <div className="grid gap-4 md:grid-cols-2">
            <EmptyState title="Nothing here yet">
              Empty states say what would appear and how.
            </EmptyState>
            <LoadingState label="Loading example" />
            <ErrorState title="Example error">
              Errors say what failed and what to do next.
            </ErrorState>
            <NotYetAvailable
              feature="Example feature"
              phase={99}
              description="The honest state for unbuilt features."
            />
          </div>
        </Card>
      </div>
    </>
  );
}
