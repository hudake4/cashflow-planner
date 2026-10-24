import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, it } from "vitest";
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
});
