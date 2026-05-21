import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileViewModal } from "./ProfileViewModal";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ProfileViewModal", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("renders public profile fields without username", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Sam",
        aboutMe: "Runner and gamer",
        favorites: ["Coffee", "Books"],
        dreamJob: "Photographer",
        avatar: { type: "none", avatarUrl: null }
      })
    });

    render(
      <ProfileViewModal
        apiBase="http://localhost:3000"
        sessionId="s1"
        participantId="p1"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText("Sam")).toBeTruthy());
    expect(screen.getByText("Runner and gamer")).toBeTruthy();
    expect(screen.getByText("Coffee")).toBeTruthy();
    expect(screen.getByText("Photographer")).toBeTruthy();
    expect(screen.queryByText(/username/i)).toBeNull();
  });
});
