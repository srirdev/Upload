import { describe, expect, it } from "vitest";
import { countdown, formatBytes, rupees } from "@/shared/utils/format";

describe("format helpers", () => {
  it("shows money exactly as the server sent it, with the rupee sign", () => {
    expect(rupees("102.60")).toBe("₹102.60");
  });

  it("formats file sizes", () => {
    expect(formatBytes(500)).toBe("1 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("counts down to a deadline and stops at zero", () => {
    const now = Date.parse("2026-11-26T10:00:00Z");
    expect(countdown("2026-11-26T12:05:30Z", now)).toBe("2h 05m");
    expect(countdown("2026-11-26T10:14:03Z", now)).toBe("14m 03s");
    expect(countdown("2026-11-26T09:59:59Z", now)).toBeNull();
  });
});
