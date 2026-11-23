import test from "node:test";
import assert from "node:assert/strict";

import {
  getSalesforceEnvironment,
  getSalesforceSessionDecision,
} from "../src/auth/auth.js";
import {
  buildPublicationAuditRow,
  normalizePublication,
  summarizePublicationResponse,
} from "../src/publication/normalizePublication.js";

test("demonstrates a production partial-publication release slice", () => {
  const production = getSalesforceEnvironment({
    SALESFORCE_ENVIRONMENT: "production",
  });
  assert.equal(getSalesforceSessionDecision({ pingStatus: 200 }).valid, true);

  const preview = normalizePublication({
    selectedRows: [
      {
        rowNumber: 2,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "2.5",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "",
      },
      {
        rowNumber: 3,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "0",
        effectiveStartDate: "",
        effectiveEndDate: "",
      },
    ],
    salesforceRows: [],
  });
  preview.selectedRowCount = 2;

  assert.equal(preview.insertions.length, 1);
  assert.equal(preview.errors.length, 2);

  const response = {
    records: [
      { rowNumber: 2, success: true, id: "SRS-NEW" },
      { rowNumber: 3, success: false, id: null, errors: ["INVALID_SKILL_LEVEL", "START_DATE_REQUIRED"] },
    ],
  };
  const summary = summarizePublicationResponse(response);
  const audit = buildPublicationAuditRow({
    timestamp: "2026-11-23T04:58:59Z",
    user: "operador@example.com",
    environment: production,
    preview,
    response,
  });

  assert.deepEqual(summary, {
    successCount: 1,
    failureCount: 1,
    succeededRowNumbers: [2],
    failedRows: [{ rowNumber: 3, errors: ["INVALID_SKILL_LEVEL", "START_DATE_REQUIRED"] }],
  });
  assert.equal(audit.environment, "production");
  assert.equal(audit.selectedCount, 2);
  assert.equal(audit.successCount, 1);
  assert.equal(audit.failureCount, 3);
});

test("requires an explicit sandbox environment selection", () => {
  assert.equal(getSalesforceEnvironment({
    SALESFORCE_ENVIRONMENT: "sandbox",
  }), "sandbox");
  assert.equal(getSalesforceSessionDecision({ pingStatus: 401, refreshStatus: 200 }).valid, true);
});
