import { describe, expect, it, vi, beforeEach } from "vitest";

const lookupMock = vi.fn();

vi.mock("node:dns/promises", () => ({
  default: { lookup: (...args: unknown[]) => lookupMock(...args) },
}));

import { assertSafeHost, validateUrlShape, SsrfBlockedError } from "./ssrf";

describe("validateUrlShape", () => {
  it("accepts a normal https URL", () => {
    expect(() => validateUrlShape("https://example.com/path")).not.toThrow();
  });

  it("accepts http on default port", () => {
    expect(() => validateUrlShape("http://example.com")).not.toThrow();
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => validateUrlShape("file:///etc/passwd")).toThrow(SsrfBlockedError);
    expect(() => validateUrlShape("ftp://example.com")).toThrow(SsrfBlockedError);
    expect(() => validateUrlShape("gopher://example.com")).toThrow(SsrfBlockedError);
  });

  it("rejects non-standard ports", () => {
    expect(() => validateUrlShape("http://example.com:8080")).toThrow(SsrfBlockedError);
    expect(() => validateUrlShape("http://example.com:22")).toThrow(SsrfBlockedError);
  });

  it("rejects malformed URLs", () => {
    expect(() => validateUrlShape("not a url")).toThrow(SsrfBlockedError);
  });
});

describe("assertSafeHost", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("blocks 'localhost' without even resolving DNS", async () => {
    await expect(assertSafeHost("localhost")).rejects.toThrow(SsrfBlockedError);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("blocks the cloud metadata link-local address", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(assertSafeHost("metadata.example")).rejects.toThrow(SsrfBlockedError);
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["10.0.0.5", "private 10.0.0.0/8"],
    ["172.16.0.1", "private 172.16.0.0/12"],
    ["192.168.1.1", "private 192.168.0.0/16"],
    ["169.254.169.254", "AWS/GCP metadata"],
    ["0.0.0.0", "unspecified"],
    ["100.64.0.1", "CGNAT"],
  ])("blocks IPv4 %s (%s)", async (address) => {
    lookupMock.mockResolvedValue([{ address, family: 4 }]);
    await expect(assertSafeHost("attacker.example")).rejects.toThrow(SsrfBlockedError);
  });

  it.each([
    ["::1", "loopback"],
    ["fc00::1", "unique local"],
    ["fe80::1", "link-local"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
  ])("blocks IPv6 %s (%s)", async (address) => {
    lookupMock.mockResolvedValue([{ address, family: 6 }]);
    await expect(assertSafeHost("attacker.example")).rejects.toThrow(SsrfBlockedError);
  });

  it("allows a public IPv4 address", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeHost("example.com")).resolves.toBeUndefined();
  });

  it("allows a public IPv6 address", async () => {
    lookupMock.mockResolvedValue([{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }]);
    await expect(assertSafeHost("example.com")).resolves.toBeUndefined();
  });

  it("blocks when any one of multiple resolved addresses is private", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertSafeHost("multi.example")).rejects.toThrow(SsrfBlockedError);
  });

  it("throws if DNS resolves to nothing", async () => {
    lookupMock.mockResolvedValue([]);
    await expect(assertSafeHost("nowhere.example")).rejects.toThrow(SsrfBlockedError);
  });
});
