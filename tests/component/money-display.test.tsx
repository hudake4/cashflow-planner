import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Balance, EventAmount } from "@/components/ui/money";
import { kindMoney, signedMoney } from "@/lib/format";

describe("money display", () => {
  it("negative balance is flagged with more than color", () => {
    render(<Balance cents={-5000} currency="USD" testId="bal" />);
    const el = screen.getByTestId("bal");
    expect(el).toHaveAttribute("data-negative", "true");
    expect(el).toHaveTextContent("negative balance");
    expect(el).toHaveTextContent("-$50.00");
  });

  it("positive and zero balances are not flagged", () => {
    render(<Balance cents={0} currency="USD" testId="zero" />);
    expect(screen.getByTestId("zero")).not.toHaveAttribute("data-negative");
    expect(screen.getByTestId("zero")).toHaveTextContent("$0.00");
  });

  it("event amounts carry an explicit sign from their kind", () => {
    render(
      <>
        <EventAmount kind="INCOME" amountCents={123456} currency="USD" />
        <EventAmount kind="BILL" amountCents={1299} currency="USD" />
      </>,
    );
    expect(screen.getByText("+$1,234.56")).toBeInTheDocument();
    expect(screen.getByText("−$12.99")).toBeInTheDocument();
  });

  it("format helpers", () => {
    expect(signedMoney(-1299)).toBe("−$12.99");
    expect(signedMoney(1299)).toBe("+$12.99");
    expect(signedMoney(0)).toBe("$0.00");
    expect(kindMoney("BILL", 10)).toBe("−$0.10");
  });
});
