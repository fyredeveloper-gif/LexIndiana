/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/client", () => ({ apiRequest }));

import { FirmMembersPanel } from "@/components/forms/firm-admin";

const owner = {
  membershipId: "membership-owner",
  userId: "user-owner",
  name: "Quentin",
  email: "quentin@lexindiana.test",
  role: "OWNER" as const,
  title: null,
  joinedAt: "2026-11-18T12:00:00.000Z",
};

function renderPanel() {
  render(
    <FirmMembersPanel
      members={[owner]}
      invitations={[]}
      currentUserId={owner.userId}
      canManage
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("firm invitation form", () => {
  it("lists every invitable role and submits the selected role", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ ok: true, data: { url: "/join/test-token" } });
    renderPanel();

    const role = screen.getByRole("combobox", { name: "Role" }) as HTMLSelectElement;
    expect(Array.from(role.options, (option) => option.text)).toEqual([
      "Attorney",
      "Paralegal",
      "Practice manager",
      "Consultant",
    ]);
    expect(role.value).toBe("PARALEGAL");

    await user.selectOptions(role, "CLM");
    expect(role.value).toBe("CLM");
    expect(role.selectedOptions[0]?.text).toBe("Practice manager");

    await user.type(screen.getByRole("textbox", { name: "Email" }), "associate@example.com");
    await user.click(screen.getByRole("button", { name: "Create invite link" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith("/api/firm/invitations", {
      method: "POST",
      body: { email: "associate@example.com", role: "CLM", title: null },
    });
  });

  it("shows an ownership-transfer empty state when no eligible attorney exists", () => {
    renderPanel();

    expect(screen.getByRole("status").textContent).toContain("No eligible team member yet.");
    expect(screen.getByRole("status").textContent).toContain(
      "Invite an attorney above to enable ownership transfer.",
    );
    expect(screen.queryByRole("combobox", { name: "New owner" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Transfer ownership" })).toBeNull();
  });
});
