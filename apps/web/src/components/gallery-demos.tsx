"use client";

import { Button, Checkbox, Drawer, SelectField, TextArea, TextField } from "@originos/ui";
import { PanelRightOpen, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

/** Interactive gallery demos. Every control here does something visible; nothing is saved. */
export function ButtonDemo() {
  const [count, setCount] = useState(0);
  const press = () => setCount((c) => c + 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button action="gallery.primary" variant="primary" onClick={press} icon={Plus}>
          Primary
        </Button>
        <Button action="gallery.secondary" onClick={press}>
          Secondary
        </Button>
        <Button action="gallery.ghost" variant="ghost" onClick={press}>
          Ghost
        </Button>
        <Button action="gallery.danger" variant="danger" onClick={press}>
          Danger
        </Button>
        <Button action="gallery.small" size="sm" onClick={press}>
          Small
        </Button>
      </div>
      <p className="text-sm text-fg-muted" role="status" data-testid="press-count">
        Pressed {count} {count === 1 ? "time" : "times"}.
      </p>
      <Button
        action="gallery.disabled"
        onClick={press}
        disabled
        disabledReason="A disabled button always says why, like this."
      >
        Disabled
      </Button>
    </div>
  );
}

export function DrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button action="gallery.drawer-open" onClick={() => setOpen(true)} icon={PanelRightOpen}>
        Open drawer
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Example drawer">
        <p className="text-sm text-fg-muted">
          Drawers use the native dialog element, so focus stays inside and Escape closes it.
        </p>
      </Drawer>
    </>
  );
}

export function FormDemo() {
  const [errors, setErrors] = useState<{ handle?: string }>({});
  const [submitted, setSubmitted] = useState<string | null>(null);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const handle = String(new FormData(e.currentTarget).get("handle") ?? "").trim();
    if (!/^[a-z0-9-]{3,30}$/.test(handle)) {
      setErrors({ handle: "Use 3 to 30 lowercase letters, digits or hyphens." });
      setSubmitted(null);
      return;
    }
    setErrors({});
    setSubmitted(handle);
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <TextField
        id="gallery-handle"
        name="handle"
        label="Handle"
        description="Validation runs in the browser only. Nothing is saved."
        {...(errors.handle ? { error: errors.handle } : {})}
        required
      />
      <TextArea id="gallery-bio" name="bio" label="Short bio" />
      <SelectField
        id="gallery-role"
        name="role"
        label="Role"
        options={[
          { value: "creator", label: "Creator" },
          { value: "editor", label: "Editor" },
          { value: "researcher", label: "Researcher" },
        ]}
      />
      <Checkbox
        id="gallery-consent"
        name="consent"
        label="Example checkbox"
        description="Checkboxes carry their own label."
      />
      <div>
        <Button action="gallery.form-submit" type="submit" variant="primary">
          Check form
        </Button>
      </div>
      <p role="status" className="text-sm text-positive">
        {submitted ? `“${submitted}” is a valid handle. Nothing was saved.` : ""}
      </p>
    </form>
  );
}
