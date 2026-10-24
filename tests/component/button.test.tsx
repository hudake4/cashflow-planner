import { fireEvent, render, screen } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("supports asChild with a Next Link", () => {
    render(
      <Button asChild variant="primary" size="lg">
        <Link href="/calendar">Open calendar</Link>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Open calendar" });
    expect(link).toHaveAttribute("href", "/calendar");
    expect(link).toHaveAttribute("data-slot", "button");
    expect(link).toHaveClass("rounded-control");
  });

  it("keeps loading state for native buttons", () => {
    render(<Button loading>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("prevents a loading asChild link from activating by click or keyboard", () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <Button asChild loading>
        <Link href="/calendar" onClick={onClick} onKeyDown={onKeyDown}>
          Open calendar
        </Link>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Open calendar" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("aria-busy", "true");

    const click = fireEvent.click(link);
    const keyDown = fireEvent.keyDown(link, { key: "Enter", code: "Enter" });

    expect(click).toBe(false);
    expect(keyDown).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
