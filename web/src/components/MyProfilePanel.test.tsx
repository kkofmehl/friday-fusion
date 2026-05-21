import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyProfilePanel } from "./MyProfilePanel";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("MyProfilePanel", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("creates and links a profile", async () => {
    const send = vi.fn();
    const onProfileAuthChange = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "",
        aboutMe: "",
        favorites: [],
        dreamJob: "",
        avatar: { type: "none", avatarUrl: null }
      })
    });

    render(
      <MyProfilePanel
        apiBase="http://localhost:3000"
        sessionId="s1"
        send={send}
        hasLinkedProfile={false}
        profileAuth={null}
        onProfileAuthChange={onProfileAuthChange}
      />
    );

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "sam_user" } });
    fireEvent.click(screen.getByRole("button", { name: "Create/Load profile" }));

    await waitFor(() => expect(onProfileAuthChange).toHaveBeenCalledWith({ username: "sam_user" }));
    expect(send).toHaveBeenCalledWith({
      type: "session:linkProfile",
      payload: { username: "sam_user" }
    });
  });

  it("adds and removes favorites while editing", async () => {
    const send = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Sam",
        aboutMe: "About",
        favorites: ["Pizza"],
        dreamJob: "Writer",
        avatar: { type: "none", avatarUrl: null }
      })
    });

    render(
      <MyProfilePanel
        apiBase="http://localhost:3000"
        sessionId="s1"
        send={send}
        hasLinkedProfile
        profileAuth={{ username: "sam_user" }}
        onProfileAuthChange={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText("Pizza")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Add favorite"), { target: { value: "Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("Coffee")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    expect(screen.queryByText("Pizza")).toBeNull();
  });
});
