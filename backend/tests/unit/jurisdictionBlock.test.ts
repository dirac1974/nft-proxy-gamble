import type { Request, Response } from "express";
import {
  createJurisdictionGuard,
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
  it("passes when no country header is present and GEO_HEADER_REQUIRED is off (test default)", () => {
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

// Red-team HIGH (geo-block fails open): with no edge country header the money
// path used to be allowed; a direct-to-origin request minted a cash-out.
describe("createJurisdictionGuard fail-closed (GEO_HEADER_REQUIRED)", () => {
  const strict = createJurisdictionGuard({ headerRequired: true });

  it("returns 403 GEO_UNVERIFIED when no trusted country header is present", () => {
    const next = jest.fn();
    const { res, status, json } = mockRes();
    strict(mockReq({}), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "We couldn't confirm your location", code: "GEO_UNVERIFIED" });
  });

  it("does not accept X-Country-Override as a substitute outside the test runner", () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      const next = jest.fn();
      const { res, status } = mockRes();
      strict(mockReq({ "x-country-override": "US" }), res, next);
      expect(status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });

  it("ignores malformed header values (fail closed)", () => {
    const next = jest.fn();
    const { res, status } = mockRes();
    strict(mockReq({ "cf-ipcountry": "XXX" }), res, next);
    expect(status).toHaveBeenCalledWith(403);
  });

  it("passes an allowed country and still 451s a blocked one", () => {
    const next = jest.fn();
    const ok = mockRes();
    strict(mockReq({ "cf-ipcountry": "US" }), ok.res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const blocked = mockRes();
    strict(mockReq({ "x-vercel-ip-country": "KP" }), blocked.res, next);
    expect(blocked.status).toHaveBeenCalledWith(451);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("GEO_HEADER_REQUIRED config default", () => {
  function loadConfig(env: Record<string, string | undefined>): { GEO_HEADER_REQUIRED: boolean } {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    try {
      let cfg: { GEO_HEADER_REQUIRED: boolean } | undefined;
      jest.isolateModules(() => {
        cfg = (require("../../src/config/index.js") as { config: { GEO_HEADER_REQUIRED: boolean } }).config;
      });
      return cfg!;
    } finally {
      process.env = saved;
    }
  }

  it("defaults to true in production", () => {
    expect(loadConfig({ NODE_ENV: "production", SIWE_DOMAIN: "api.example.com", GEO_HEADER_REQUIRED: undefined }).GEO_HEADER_REQUIRED).toBe(true);
  });

  it("defaults to false in test/development", () => {
    expect(loadConfig({ NODE_ENV: "development", GEO_HEADER_REQUIRED: undefined }).GEO_HEADER_REQUIRED).toBe(false);
  });

  it("parses the string 'false' as false (no Boolean('false') inversion)", () => {
    expect(loadConfig({ NODE_ENV: "production", SIWE_DOMAIN: "api.example.com", GEO_HEADER_REQUIRED: "false" }).GEO_HEADER_REQUIRED).toBe(false);
  });
});
