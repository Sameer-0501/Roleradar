/**
 * Phase 6 — Canonical Role Resolver Unit Tests.
 *
 * Tests resolveCanonicalRoleIds() and mergeEffectiveRoles() in isolation.
 * No DB access required. All 30 Phase 6 test cases are covered here plus
 * safety-net cases for role-filter override and fresher safety (those live
 * in matching-service.test.ts / matching-experience.test.ts).
 */

import { describe, it, expect } from "vitest";
import {
  resolveCanonicalRoleIds,
  mergeEffectiveRoles,
} from "../matching/canonical-role-resolver.js";
import { matchRole } from "../matching/role-matcher.js";

// ---------------------------------------------------------------------------
// resolveCanonicalRoleIds
// ---------------------------------------------------------------------------
describe("resolveCanonicalRoleIds", () => {
  it("returns empty array for empty input", () => {
    expect(resolveCanonicalRoleIds([])).toEqual([]);
  });

  it("resolves ROLE_SOFTWARE_ENGINEER -> Software Engineer", () => {
    const result = resolveCanonicalRoleIds(["ROLE_SOFTWARE_ENGINEER"]);
    expect(result).toContain("Software Engineer");
  });

  it("resolves ROLE_JAVA_DEV -> Java Developer", () => {
    expect(resolveCanonicalRoleIds(["ROLE_JAVA_DEV"])).toContain(
      "Java Developer"
    );
  });

  it("resolves ROLE_PYTHON_DEV -> Python Developer", () => {
    expect(resolveCanonicalRoleIds(["ROLE_PYTHON_DEV"])).toContain(
      "Python Developer"
    );
  });

  it("resolves ROLE_ENG_MANAGER -> Engineering Manager", () => {
    expect(resolveCanonicalRoleIds(["ROLE_ENG_MANAGER"])).toContain(
      "Engineering Manager"
    );
  });

  it("resolves ROLE_CUSTOMER_SUCCESS -> Customer Success Manager", () => {
    expect(resolveCanonicalRoleIds(["ROLE_CUSTOMER_SUCCESS"])).toContain(
      "Customer Success Manager"
    );
  });

  it("resolves ROLE_IT_SUPPORT -> IT Support Specialist", () => {
    expect(resolveCanonicalRoleIds(["ROLE_IT_SUPPORT"])).toContain(
      "IT Support Specialist"
    );
  });

  it("resolves ROLE_DATA_ANALYST correctly", () => {
    const result = resolveCanonicalRoleIds(["ROLE_DATA_ANALYST"]);
    expect(result.length).toBeGreaterThan(0);
  });

  it("resolves ROLE_ML_ENG -> Machine Learning Engineer", () => {
    expect(resolveCanonicalRoleIds(["ROLE_ML_ENG"])).toContain(
      "Machine Learning Engineer"
    );
  });

  it("silently ignores invalid canonical IDs", () => {
    const result = resolveCanonicalRoleIds(["ROLE_DOES_NOT_EXIST"]);
    expect(result).toEqual([]);
  });

  it("resolves multiple canonical IDs", () => {
    const result = resolveCanonicalRoleIds([
      "ROLE_SOFTWARE_ENGINEER",
      "ROLE_JAVA_DEV",
    ]);
    expect(result).toContain("Software Engineer");
    expect(result).toContain("Java Developer");
    expect(result).toHaveLength(2);
  });

  it("Customer Success resolves separately from Sales roles", () => {
    const cs = resolveCanonicalRoleIds(["ROLE_CUSTOMER_SUCCESS"]);
    const sales = resolveCanonicalRoleIds(["ROLE_ACCOUNT_EXECUTIVE"]);
    expect(cs).not.toEqual(sales);
    expect(cs[0]).not.toEqual(sales[0]);
  });

  it("Engineering Manager resolves to Engineering Manager, not Director/VP/Head", () => {
    const result = resolveCanonicalRoleIds(["ROLE_ENG_MANAGER"]);
    expect(result[0]).toBe("Engineering Manager");
    expect(result[0]).not.toMatch(/director|vp|head|chief/i);
  });
});

// ---------------------------------------------------------------------------
// mergeEffectiveRoles
// ---------------------------------------------------------------------------
describe("mergeEffectiveRoles", () => {
  it("returns canonical names when no legacy roles", () => {
    expect(mergeEffectiveRoles(["Software Engineer"], [])).toEqual([
      "Software Engineer",
    ]);
  });

  it("returns legacy roles when no canonical names", () => {
    expect(mergeEffectiveRoles([], ["Software Engineer"])).toEqual([
      "Software Engineer",
    ]);
  });

  it("deduplicates identical canonical + legacy role", () => {
    const result = mergeEffectiveRoles(
      ["Software Engineer"],
      ["Software Engineer"]
    );
    expect(result).toEqual(["Software Engineer"]);
    expect(result).toHaveLength(1);
  });

  it("deduplicates case-insensitively", () => {
    const result = mergeEffectiveRoles(
      ["Software Engineer"],
      ["software engineer"]
    );
    expect(result).toHaveLength(1);
  });

  it("preserves unmapped custom legacy roles", () => {
    const result = mergeEffectiveRoles(
      ["Software Engineer"],
      ["Software Engineer", "My Custom Role"]
    );
    expect(result).toContain("Software Engineer");
    expect(result).toContain("My Custom Role");
    expect(result).toHaveLength(2);
  });

  it("canonical-only user gets only canonical names", () => {
    const result = mergeEffectiveRoles(["Java Developer", "Python Developer"], []);
    expect(result).toEqual(["Java Developer", "Python Developer"]);
  });

  it("mixed user gets canonical first then unmapped legacy", () => {
    const result = mergeEffectiveRoles(
      ["Software Engineer"],
      ["Software Engineer", "Totally Custom Role"]
    );
    expect(result[0]).toBe("Software Engineer");
    expect(result[1]).toBe("Totally Custom Role");
  });

  it("empty canonical and empty legacy returns empty array", () => {
    expect(mergeEffectiveRoles([], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration: canonical role display names work with existing matchRole()
// ---------------------------------------------------------------------------
describe("Canonical roles feed into existing matchRole() correctly", () => {
  it("ROLE_SOFTWARE_ENGINEER display name matches 'Software Engineer' job title", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_SOFTWARE_ENGINEER"]);
    expect(matchRole("Software Engineer", roles).matched).toBe(true);
  });

  it("ROLE_SOFTWARE_ENGINEER matches SDE synonym", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_SOFTWARE_ENGINEER"]);
    expect(matchRole("SDE", roles).matched).toBe(true);
  });

  it("ROLE_JAVA_DEV matches Java Developer job title", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_JAVA_DEV"]);
    expect(matchRole("Java Developer", roles).matched).toBe(true);
  });

  it("ROLE_JAVA_DEV matches Spring Boot Developer synonym", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_JAVA_DEV"]);
    expect(matchRole("Spring Boot Developer", roles).matched).toBe(true);
  });

  it("ROLE_PYTHON_DEV matches Python Developer", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_PYTHON_DEV"]);
    expect(matchRole("Python Developer", roles).matched).toBe(true);
  });

  it("ROLE_ENG_MANAGER matches Engineering Manager", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_ENG_MANAGER"]);
    expect(matchRole("Engineering Manager", roles).matched).toBe(true);
  });

  it("ROLE_ENG_MANAGER does NOT match Director of Engineering", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_ENG_MANAGER"]);
    // Director contains disallowedToken 'director' in canonical entry
    expect(matchRole("Director of Engineering", roles).matched).toBe(false);
  });

  it("ROLE_ENG_MANAGER does NOT match VP Engineering", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_ENG_MANAGER"]);
    expect(matchRole("VP Engineering", roles).matched).toBe(false);
  });

  it("ROLE_CUSTOMER_SUCCESS matches Customer Success Manager", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_CUSTOMER_SUCCESS"]);
    expect(matchRole("Customer Success Manager", roles).matched).toBe(true);
  });

  it("ROLE_CUSTOMER_SUCCESS does NOT match Account Executive (Sales)", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_CUSTOMER_SUCCESS"]);
    expect(matchRole("Account Executive", roles).matched).toBe(false);
  });

  it("ROLE_CUSTOMER_SUCCESS does NOT match Business Development Rep (Sales)", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_CUSTOMER_SUCCESS"]);
    expect(matchRole("Business Development Representative", roles).matched).toBe(false);
  });

  it("canonical-only user: roles=[] + canonicalRoles=[ROLE_SOFTWARE_ENGINEER] matches correctly", () => {
    const canon = resolveCanonicalRoleIds(["ROLE_SOFTWARE_ENGINEER"]);
    const effective = mergeEffectiveRoles(canon, []);
    expect(matchRole("Software Engineer", effective).matched).toBe(true);
  });

  it("legacy-only user: roles=[Software Engineer] + canonicalRoles=[] unchanged", () => {
    const canon = resolveCanonicalRoleIds([]);
    const effective = mergeEffectiveRoles(canon, ["Software Engineer"]);
    expect(effective).toEqual(["Software Engineer"]);
    expect(matchRole("Software Engineer", effective).matched).toBe(true);
  });

  it("mixed user: canonicalRoles + equivalent legacy role does not duplicate", () => {
    const canon = resolveCanonicalRoleIds(["ROLE_SOFTWARE_ENGINEER"]);
    const effective = mergeEffectiveRoles(canon, ["Software Engineer"]);
    expect(effective).toHaveLength(1);
    expect(matchRole("Software Engineer", effective).matched).toBe(true);
  });

  it("mixed user: canonical + unrelated legacy preserves both intents", () => {
    const canon = resolveCanonicalRoleIds(["ROLE_SOFTWARE_ENGINEER"]);
    const effective = mergeEffectiveRoles(canon, ["My Custom Role"]);
    expect(effective).toContain("Software Engineer");
    expect(effective).toContain("My Custom Role");
  });

  it("ROLE_IT_SUPPORT display name matches IT support job titles", () => {
    const roles = resolveCanonicalRoleIds(["ROLE_IT_SUPPORT"]);
    // The canonical display name for ROLE_IT_SUPPORT is 'IT Support Specialist'
    // IT Support Specialist is itself a synonym in the legacy role-matcher for IT Support Engineer
    // So this should match via the custom-role fallback (substring)
    const result = matchRole("IT Support Specialist", roles);
    expect(result.matched).toBe(true);
  });
});
