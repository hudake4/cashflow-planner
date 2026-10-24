import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "@/components/ui/field";

describe("Switch", () => {
  it("keeps a 44x44 mobile hit region around the compact visual track", () => {
    render(<Switch checked={false} onChange={vi.fn()} label="Included" />);

    const input = screen.getByRole("switch");
    const hitRegion = input.parentElement;
    const track = input.nextElementSibling;

    expect(hitRegion).toHaveClass("h-11", "w-11", "items-center", "justify-center", "sm:h-6");
    expect(input).toHaveClass("absolute", "inset-0", "h-full", "w-full");
    expect(track).toHaveClass("h-6", "w-11", "pointer-events-none");
  });

  it("reports changes from the actual switch input", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Included" />);

    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});
