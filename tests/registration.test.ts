import { afterEach, describe, expect, it } from "vitest";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import {
  parseRegistrationMode,
  registrationAllowed,
  REGISTRATION_CLOSED_REASON,
} from "@/lib/registration";

describe("registration mode", () => {
  it("parses the supported modes case-insensitively", () => {
    expect(parseRegistrationMode("open")).toBe("open");
    expect(parseRegistrationMode("BOOTSTRAP")).toBe("bootstrap");
    expect(parseRegistrationMode("closed")).toBe("closed");
  });

  it("defaults unknown or missing values to bootstrap", () => {
    expect(parseRegistrationMode("typo")).toBe("bootstrap");
    expect(parseRegistrationMode("")).toBe("bootstrap");
  });

  it("allows exactly the first firm in bootstrap mode", () => {
    expect(registrationAllowed("bootstrap", 0)).toBe(true);
    expect(registrationAllowed("bootstrap", 1)).toBe(false);
  });

  it("allows public registration only in open mode", () => {
    expect(registrationAllowed("open", 5)).toBe(true);
    expect(registrationAllowed("closed", 0)).toBe(false);
  });
});

describe("closed registration API", () => {
  afterEach(() => {
    delete process.env.REGISTRATION_MODE;
  });

  it("rejects a request before parsing the body or creating an account", async () => {
    process.env.REGISTRATION_MODE = "closed";

    const response = await registerRoute(
      new Request("http://localhost/api/auth/register", { method: "POST" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: REGISTRATION_CLOSED_REASON });
  });
});
