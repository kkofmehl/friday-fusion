import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppFooter } from "./AppFooter";

describe("AppFooter", () => {
  it("shows hosting note, Venmo link, PayPal email, and copyright", () => {
    render(<AppFooter />);
    expect(screen.getByRole("contentinfo")).toBeDefined();
    expect(
      screen.getByText(/Feel no obligation, but if you want to help offset hosting costs/i)
    ).toBeDefined();
    const venmo = screen.getByRole("link", { name: /Venmo @kmozzler/i });
    expect(venmo.getAttribute("href")).toBe("https://venmo.com/kmozzler");
    expect(screen.getByText(/Paypal kkash2206@gmail.com/i)).toBeDefined();
    expect(screen.getByText(/© 2026 Kmofy Consulting/i)).toBeDefined();
  });
});
