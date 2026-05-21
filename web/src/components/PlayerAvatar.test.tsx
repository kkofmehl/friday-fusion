import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerAvatar } from "./PlayerAvatar";

describe("PlayerAvatar", () => {
  it("renders stock avatars", () => {
    render(<PlayerAvatar avatar={{ type: "stock", id: "avatar-astronaut", avatarUrl: "/avatars/avatar-astronaut.png" }} />);
    expect(screen.getByText("🧑‍🚀")).toBeTruthy();
  });

  it("renders uploaded avatars", () => {
    render(
      <PlayerAvatar
        apiBase="http://localhost:3000"
        decorative={false}
        label="Sam avatar"
        avatar={{
          type: "upload",
          avatarUrl: "/api/profiles/avatar/sam/file.png",
          fileId: "file.png",
          crop: { x: 0.5, y: 0.5, zoom: 1 }
        }}
      />
    );
    expect(screen.getByLabelText("Sam avatar")).toBeTruthy();
  });
});
