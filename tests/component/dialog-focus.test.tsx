import { useRef, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { EditSourceDialog } from "@/components/forms/edit-source-dialog";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function Confirmation({ remove = false }: { remove?: boolean }) {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const fallback = useRef<HTMLButtonElement>(null);
  return <><button ref={fallback}>Add</button>{!deleted && <button onClick={() => setOpen(true)}>Remove</button>}
    <ConfirmDialog open={open} onClose={() => setOpen(false)} title="Delete?" description="Remove row" confirmLabel="Delete"
      fallbackFocusTarget={() => fallback.current} onConfirm={async () => { if (remove) setDeleted(true); }} />
  </>;
}

describe("dialog restoration policy", () => {
  it("uses a connected fallback after the invoking row unmounts", async () => {
    const user = userEvent.setup();
    render(<Confirmation remove />);
    await user.click(screen.getByText("Remove"));
    await user.click(screen.getByTestId("confirm-submit"));
    await waitFor(() => expect(screen.getByText("Add")).toHaveFocus());
  });

  it.each(["Escape", "Cancel"])("captures confirmation openers without a DialogTrigger: %s", async (close) => {
    const user = userEvent.setup();
    render(<Confirmation />);
    await user.click(screen.getByText("Remove"));
    if (close === "Escape") await user.keyboard("{Escape}");
    else await user.click(screen.getByTestId("confirm-cancel"));
    await waitFor(() => expect(screen.getByText("Remove")).toHaveFocus());
  });

  it("restores a nested dialog to its ledger row exactly once", async () => {
    function Nested() {
      const [ledger, setLedger] = useState(false);
      const [event, setEvent] = useState(false);
      return <><button onClick={() => setLedger(true)}>Week</button>
        <Dialog open={ledger} onClose={() => setLedger(false)} title="Ledger" description="Week ledger"><button onClick={() => setEvent(true)}>Ledger row</button></Dialog>
        <Dialog open={event} onClose={() => setEvent(false)} title="Event" description="Event details">Details</Dialog></>;
    }
    const user = userEvent.setup();
    render(<Nested />);
    await user.click(screen.getByText("Week"));
    const row = screen.getByText("Ledger row");
    await user.click(row);
    const focus = vi.spyOn(row, "focus");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(row).toHaveFocus());
    expect(focus).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByText("Week")).toHaveFocus());
  });
});

it("does not confuse a closed row menu with a closed dialog", async () => {
  function Menu() {
    const [open, setOpen] = useState(false);
    return <><button data-state="closed" onClick={() => setOpen(true)}>Row actions</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit" description="Schedule">Form</Dialog></>;
  }
  const user = userEvent.setup();
  render(<Menu />);
  await user.click(screen.getByText("Row actions"));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByText("Row actions")).toHaveFocus());
});

it.each(["Escape", "Cancel"])("keeps the same source-edit dialog through async loading and restores after %s", async (close) => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
  function Source() {
    const [target, setTarget] = useState<{ kind: "bill"; id: string } | null>(null);
    const opener = useRef<HTMLButtonElement>(null);
    return <ToastProvider><button ref={opener} onClick={() => setTarget({ kind: "bill", id: "bill" })}>Calendar event</button>
      <EditSourceDialog target={target} restoreFocusTarget={() => opener.current} onClose={() => setTarget(null)} onSaved={() => {}} /></ToastProvider>;
  }
  try {
    const user = userEvent.setup();
    render(<Source />);
    await user.click(screen.getByText("Calendar event"));
    const dialog = screen.getByRole("dialog");
    await act(async () => resolve(new Response(JSON.stringify({ id: "bill", name: "Rent", amountCents: 10000, frequency: "MONTHLY", anchorDate: "2026-10-24", endDate: null, active: true, notes: null, category: null }))));
    await screen.findByTestId("bill-name");
    expect(screen.getByRole("dialog")).toBe(dialog);
    if (close === "Escape") await user.keyboard("{Escape}");
    else await user.click(screen.getByTestId("bill-form-cancel"));
    await waitFor(() => expect(screen.getByText("Calendar event")).toHaveFocus());
  } finally { vi.unstubAllGlobals(); }
});

it("hands restoration to the source editor when replacing both calendar dialogs", async () => {
  function Handoff() {
    const [ledger, setLedger] = useState(false);
    const [event, setEvent] = useState(false);
    const [edit, setEdit] = useState(false);
    const week = useRef<HTMLButtonElement>(null);
    return <><button ref={week} onClick={() => setLedger(true)}>Week opener</button>
      <Dialog open={ledger} restoreFocusOnClose={!edit} onClose={() => setLedger(false)} title="Ledger" description="Ledger"><button onClick={() => setEvent(true)}>Ledger event</button></Dialog>
      <Dialog open={event} restoreFocusOnClose={!edit} onClose={() => setEvent(false)} title="Event" description="Event"><button onClick={() => { setEdit(true); setEvent(false); setLedger(false); }}>Edit source</button></Dialog>
      <Dialog open={edit} restoreFocusTarget={() => week.current} onClose={() => setEdit(false)} title="Source" description="Source form">Fields</Dialog></>;
  }
  const user = userEvent.setup();
  render(<Handoff />);
  const week = screen.getByText("Week opener");
  await user.click(week);
  await user.click(screen.getByText("Ledger event"));
  await user.click(screen.getByText("Edit source"));
  const focus = vi.spyOn(week, "focus");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(week).toHaveFocus());
  expect(focus).toHaveBeenCalledTimes(1);
});
