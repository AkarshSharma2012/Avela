import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  resolveMx: vi.fn(),
  resolveTxt: vi.fn(),
}));
vi.mock("@/lib/osint/connectors/rdap", async () => {
  const actual = await vi.importActual<typeof import("@/lib/osint/connectors/rdap")>("@/lib/osint/connectors/rdap");
  return { ...actual, fetchDomainRegistrationContext: vi.fn() };
});

import { resolveMx, resolveTxt } from "node:dns/promises";
import { fetchDomainRegistrationContext } from "@/lib/osint/connectors/rdap";
import {
  extractEmailDomain,
  extractEmailLocalPart,
  gatherDomainContext,
  hasDmarcRecord,
  hasMxRecords,
  hasSpfRecord,
  isDisposableEmailDomain,
  isFreeEmailProvider,
  isRoleMailboxLocalPart,
  normalizeOrganizationName,
  organizationNameMatchesDomain,
} from "@/lib/verification/domain-context";

const mockResolveMx = vi.mocked(resolveMx);
const mockResolveTxt = vi.mocked(resolveTxt);
const mockFetchDomainRegistrationContext = vi.mocked(fetchDomainRegistrationContext);

afterEach(() => {
  vi.clearAllMocks();
});

describe("extractEmailDomain / extractEmailLocalPart", () => {
  it("splits a normal address", () => {
    expect(extractEmailDomain("Coach@Example.ORG")).toBe("example.org");
    expect(extractEmailLocalPart("Coach@Example.ORG")).toBe("coach");
  });

  it("returns null for an address with no @", () => {
    expect(extractEmailDomain("not-an-email")).toBeNull();
    expect(extractEmailLocalPart("not-an-email")).toBeNull();
  });
});

describe("isFreeEmailProvider / isDisposableEmailDomain / isRoleMailboxLocalPart", () => {
  it("classifies known free-webmail domains without treating them as suspicious", () => {
    expect(isFreeEmailProvider("gmail.com")).toBe(true);
    expect(isFreeEmailProvider("myschool.edu")).toBe(false);
  });

  it("classifies known disposable domains", () => {
    expect(isDisposableEmailDomain("mailinator.com")).toBe(true);
  });

  it("classifies generic role-mailbox local parts", () => {
    expect(isRoleMailboxLocalPart("info")).toBe(true);
    expect(isRoleMailboxLocalPart("jane.smith")).toBe(false);
  });
});

describe("normalizeOrganizationName / organizationNameMatchesDomain", () => {
  it("strips common legal suffixes and non-alphanumerics", () => {
    expect(normalizeOrganizationName("Red Cross, Inc.")).toBe("redcross");
  });

  it("matches when the normalized org name appears in the domain", () => {
    expect(organizationNameMatchesDomain("American Red Cross", "redcross.org")).toBe(true);
  });

  it("does not match unrelated organizations — a non-match is neutral, not negative", () => {
    expect(organizationNameMatchesDomain("Chess Club", "redcross.org")).toBe(false);
  });
});

describe("DNS-backed checks fail closed on any lookup error", () => {
  it("hasMxRecords returns false on a rejected lookup rather than throwing", async () => {
    mockResolveMx.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await hasMxRecords("nonexistent.example")).toBe(false);
  });

  it("hasSpfRecord returns false when no TXT record starts with v=spf1", async () => {
    mockResolveTxt.mockResolvedValueOnce([["some-other-txt-record"]]);
    expect(await hasSpfRecord("example.org")).toBe(false);
  });

  it("hasSpfRecord returns true when a TXT record starts with v=spf1", async () => {
    mockResolveTxt.mockResolvedValueOnce([["v=spf1 include:_spf.example.org ~all"]]);
    expect(await hasSpfRecord("example.org")).toBe(true);
  });

  it("hasDmarcRecord checks the _dmarc subdomain", async () => {
    mockResolveTxt.mockResolvedValueOnce([["v=DMARC1; p=none;"]]);
    expect(await hasDmarcRecord("example.org")).toBe(true);
    expect(mockResolveTxt).toHaveBeenCalledWith("_dmarc.example.org");
  });
});

describe("gatherDomainContext", () => {
  it("gathers every signal in parallel and never throws when sub-checks fail", async () => {
    mockResolveMx.mockRejectedValueOnce(new Error("fail"));
    mockResolveTxt.mockRejectedValue(new Error("fail"));
    mockFetchDomainRegistrationContext.mockResolvedValueOnce(null);

    const context = await gatherDomainContext("someone@unknown-domain.example", null);
    expect(context).toEqual({
      domain: "unknown-domain.example",
      hasMx: false,
      hasSpf: false,
      hasDmarc: false,
      isFreeEmailProvider: false,
      isDisposable: false,
      isRoleMailbox: false,
      domainRegisteredAt: null,
      organizationDomainMatch: false,
    });
  });

  it("returns null for an unparseable email address", async () => {
    expect(await gatherDomainContext("not-an-email", null)).toBeNull();
  });
});
