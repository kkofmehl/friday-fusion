import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarShower } from "./AvatarShower";

describe("AvatarShower", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(
      <AvatarShower
        active={false}
        avatar={{ type: "stock", id: "avatar-mountain", avatarUrl: "/avatars/avatar-mountain.png" }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders celebratory particles when active", () => {
    render(
      <AvatarShower
        active
        avatar={{ type: "stock", id: "avatar-mountain", avatarUrl: "/avatars/avatar-mountain.png" }}
      />
    );
    expect(screen.getAllByText("🏔️").length).toBeGreaterThan(1);
  });
});
