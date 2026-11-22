import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSalesforceAuthorizationUrl,
  getSalesforceEnvironment,
  getSalesforceSessionDecision,
  getSalesforceLogoutPlan,
  formatSalesforceAdapterFailure,
} from "../src/auth/auth.js";

test("uses production by default and builds its authorization URL", () => {
  const environment = getSalesforceEnvironment({});

  assert.equal(environment, "production");
  assert.match(
    buildSalesforceAuthorizationUrl({
      environment,
      clientId: "client-1",
      callbackUrl: "https://example.test/oauth",
      codeChallenge: "challenge-1",
    }),
    /^https:\/\/login\.salesforce\.com\/services\/oauth2\/authorize\?/,
  );
});

test("allows an explicit sandbox selection", () => {
  const environment = getSalesforceEnvironment({
    SALESFORCE_ENVIRONMENT: "sandbox",
  });

  assert.equal(environment, "sandbox");
  assert.match(
    buildSalesforceAuthorizationUrl({
      environment,
      clientId: "client-1",
      callbackUrl: "https://example.test/oauth",
      codeChallenge: "challenge-1",
    }),
    /^https:\/\/test\.salesforce\.com\/services\/oauth2\/authorize\?/,
  );
});

test("accepts only a successful real Salesforce ping", () => {
  assert.deepEqual(getSalesforceSessionDecision({ pingStatus: 200 }), {
    valid: true,
    reason: "valid",
  });
  assert.deepEqual(getSalesforceSessionDecision({ pingStatus: 401, refreshStatus: null }), {
    valid: false,
    reason: "refresh-failed",
  });
  assert.deepEqual(getSalesforceSessionDecision({ pingStatus: 401, refreshStatus: 200 }), {
    valid: true,
    reason: "valid",
  });
  assert.deepEqual(getSalesforceSessionDecision({ pingStatus: 403 }), {
    valid: false,
    reason: "ping-rejected",
  });
});

test("plans logout revocation and user-only cache and property cleanup", () => {
  const plan = getSalesforceLogoutPlan({
    instanceUrl: "https://example.my.salesforce.com",
    accessToken: "token-1",
  });

  assert.equal(plan.revokeUrl, "https://example.my.salesforce.com/services/oauth2/revoke");
  assert.deepEqual(plan.propertyNames, [
    "SALESFORCE_ACCESS_TOKEN",
    "SALESFORCE_REFRESH_TOKEN",
    "SALESFORCE_INSTANCE_URL",
    "SALESFORCE_PKCE_VERIFIER",
  ]);
  assert.deepEqual(plan.cacheKeys, [
    "SALESFORCE_SESSION_VALID",
    "SALESFORCE_SYNC_LOCK",
  ]);
});

test("formats adapter failures so menu handlers do not remain in a loading state", () => {
  assert.deepEqual(formatSalesforceAdapterFailure(new Error("Sessão expirada")), {
    success: false,
    message: "Falha no Salesforce: Sessão expirada",
  });
});
