import type { Request, Response } from "express";
import {
  isJurisdictionBlocked,
  requireAllowedJurisdiction,
} from "../../src/middleware/jurisdictionBlock.js";

function mockReq(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

function mockRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe("isJurisdictionBlocked", () => {
  it.each([
    ["AE", true],
    ["CN", true],
    ["IR", true],
    ["KP", true],
    ["KW", true],
    ["QA", true],
    ["SA", true],
    ["CU", true],
    ["SY", true],
    ["SG", true],
  ])("blocks %s", (code, expected) => {
    expect(isJurisdictionBlocked(code)).toBe(expected);
  });

  it.each(["US", "GB", "DE", "JP", "CA", "AU", "IN", "BR"])(
    "does not block %s",
    (code) => {
      expect(isJurisdictionBlocked(code)).toBe(false);
    },
  );

  it("normalises lowercase input", () => {
    expect(isJurisdictionBlocked("cn")).toBe(true);
    expect(isJurisdictionBlocked("us")).toBe(false);
  });
});

describe("requireAllowedJurisdiction middleware", () => {
  it("passes when no country header is present (testnet beta default — not yet fail-closed)", () => {
    const next = jest.fn();
    const { res, status } = mockRes();
    requireAllowedJurisdiction(mockReq({}), res, next);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it("passes when CF-IPCountry is an allowed country", () => {
    const next = jest.fn();
    const { res, status } = mockRes();
    requireAllowedJurisdiction(mockReq({ "cf-ipcountry": "US" }), res, next);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it("returns 451 when CF-IPCountry is a blocked country", () => {
    const next = jest.fn();
    const { res, status, json } = mockRes();
    requireAllowedJurisdiction(mockReq({ "cf-ipcountry": "CN" }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(451);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("Service not available"),
        country: "CN",
      }),
    );
  });

  it("honors X-Vercel-IP-Country when CF header absent", () => {
    const next = jest.fn();
    const { res, status } = mockRes();
    requireAllowedJurisdiction(
      mockReq({ "x-vercel-ip-country": "IR" }),
      res,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(451);
  });

  it("respects X-Country-Override only outside production", () => {
    const next = jest.fn();
    const { res, status } = mockRes();
    process.env.NODE_ENV = "test";
    requireAllowedJurisdiction(mockReq({ "x-country-override": "CN" }), res, next);
    expect(status).toHaveBeenCalledWith(451);
    expect(next).not.toHaveBeenCalled();
  });

  it("ignores X-Country-Override in production (header cannot be used to bypass)", () => {
    const next = jest.fn();
    const { res, status } = mockRes();
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    requireAllowedJurisdiction(mockReq({ "x-country-override": "CN" }), res, next);
    // No real CF/Vercel header set → no country detected → pass-through
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
    (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
  });

  it("normalises lowercase country codes from headers", () => {
    const next = jest.fn();
    const { res, status } = mockRes();
    requireAllowedJurisdiction(mockReq({ "cf-ipcountry": "cn" }), res, next);
    expect(status).toHaveBeenCalledWith(451);
  });
});
