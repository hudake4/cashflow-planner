import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";

const JUMP_DATE = "2026-11-05";

function renderToolbar() {
  const handlers = {
    onViewChange: vi.fn(),
    onStep: vi.fn(),
    onToday: vi.fn(),
    onJump: vi.fn(),
  };
  render(<CalendarToolbar view="month" title="October 2026" refreshing={false} {...handlers} />);
  return handlers;
}

/** Opens the jump form (it is hidden behind the toggle below `lg`) and types a date into it. */
async function typeJumpDate(user: ReturnType<typeof userEvent.setup>, date: string) {
  await user.click(screen.getByTestId("calendar-jump-toggle"));
  const input = screen.getByTestId("calendar-jump") as HTMLInputElement;
  fireEvent.change(input, { target: { value: date } });
  return input;
}

describe("calendar toolbar jump-to-date input", () => {
  it("passes a typed date to onJump and keeps it in the field", async () => {
    const user = userEvent.setup();
    const { onJump } = renderToolbar();

    const input = await typeJumpDate(user, JUMP_DATE);

    expect(onJump).toHaveBeenCalledWith(JUMP_DATE);
    expect(input).toHaveValue(JUMP_DATE);
  });

  it("clears the jump field when Today is clicked", async () => {
    const user = userEvent.setup();
    const { onToday } = renderToolbar();
    const input = await typeJumpDate(user, JUMP_DATE);

    await user.click(screen.getByTestId("calendar-today"));

    expect(onToday).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("");
  });

  it("clears the jump field when the previous button is clicked", async () => {
    const user = userEvent.setup();
    const { onStep } = renderToolbar();
    const input = await typeJumpDate(user, JUMP_DATE);

    await user.click(screen.getByTestId("calendar-prev"));

    expect(onStep).toHaveBeenCalledWith(-1);
    expect(input).toHaveValue("");
  });

  it("clears the jump field when the next button is clicked", async () => {
    const user = userEvent.setup();
    const { onStep } = renderToolbar();
    const input = await typeJumpDate(user, JUMP_DATE);

    await user.click(screen.getByTestId("calendar-next"));

    expect(onStep).toHaveBeenCalledWith(1);
    expect(input).toHaveValue("");
  });
});
