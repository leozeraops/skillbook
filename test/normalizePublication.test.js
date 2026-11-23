import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePublication,
  summarizePublicationResponse,
} from "../src/publication/normalizePublication.js";

test("normaliza uma inserção nova usando colaborador, habilidade e data de início", () => {
  const result = normalizePublication({
    selectedRows: [
      {
        rowNumber: 5,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "2.5",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "",
      },
    ],
    salesforceRows: [],
  });

  assert.deepEqual(result.insertions, [
    {
      rowNumber: 5,
      rowId: "R1|K1|2026-12-01",
      operation: "insert",
      serviceResourceId: "R1",
      skillId: "K1",
      skillLevel: 2.5,
      effectiveStartDate: "2026-12-01",
      effectiveEndDate: null,
    },
  ]);
  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.errors, []);
});

test("identifica uma atualização pelo ID do registro do Salesforce", () => {
  const result = normalizePublication({
    selectedRows: [
      {
        rowNumber: 9,
        salesforceId: "SRS-1",
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "3",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "2027-01-31",
      },
    ],
    salesforceRows: [
      {
        Id: "SRS-1",
        ServiceResourceId: "R1",
        SkillId: "K1",
        EffectiveStartDate: "2026-12-01",
        EffectiveEndDate: "2027-12-31",
      },
    ],
  });

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].id, "SRS-1");
  assert.equal(result.updates[0].rowId, "SRS-1");
  assert.equal(result.updates[0].operation, "update");
});

test("rejeita duplicatas exatas e sobreposições de vigência", () => {
  const result = normalizePublication({
    selectedRows: [
      {
        rowNumber: 2,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "1",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "2026-12-31",
      },
      {
        rowNumber: 3,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "2",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "2026-12-31",
      },
      {
        rowNumber: 4,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "2",
        effectiveStartDate: "2026-12-15",
        effectiveEndDate: "",
      },
    ],
    salesforceRows: [],
  });

  assert.equal(result.errors.some((error) => error.code === "EXACT_DUPLICATE"), true);
  assert.equal(result.errors.some((error) => error.code === "VIGENCY_OVERLAP"), true);
  assert.deepEqual(result.insertions.map((row) => row.rowNumber), [2]);
});

test("rejeita datas inválidas e níveis que não são decimais positivos", () => {
  const result = normalizePublication({
    selectedRows: [
      {
        rowNumber: 7,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "0",
        effectiveStartDate: "",
        effectiveEndDate: "2026-01-01",
      },
      {
        rowNumber: 8,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "abc",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "2026-11-01",
      },
    ],
    salesforceRows: [],
  });

  assert.equal(result.errors.some((error) => error.code === "START_DATE_REQUIRED"), true);
  assert.equal(result.errors.some((error) => error.code === "INVALID_SKILL_LEVEL"), true);
  assert.equal(result.errors.some((error) => error.code === "END_DATE_BEFORE_START"), true);
});

test("não produz operação de exclusão e mantém os resultados determinísticos", () => {
  const result = normalizePublication({
    selectedRows: [
      {
        rowNumber: 12,
        salesforceId: "SRS-2",
        serviceResourceId: "R2",
        skillId: "K2",
        skillLevel: "1.5",
        effectiveStartDate: "2027-01-01",
        effectiveEndDate: "",
      },
      {
        rowNumber: 11,
        salesforceId: "",
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "1",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "",
      },
    ],
    salesforceRows: [],
  });

  assert.deepEqual(
    result.insertions.map((record) => record.rowNumber),
    [11],
  );
  assert.deepEqual(
    result.updates.map((record) => record.rowNumber),
    [12],
  );
  assert.equal(JSON.stringify(result).includes('"operation":"delete"'), false);
});

test("resume uma resposta parcial sem perder linhas aprovadas ou falhadas", () => {
  const summary = summarizePublicationResponse({
    records: [
      { rowNumber: 3, success: true, id: "SRS-3" },
      { rowNumber: 4, success: false, id: null, errors: ["VALIDATION_ERROR"] },
    ],
  });

  assert.deepEqual(summary, {
    successCount: 1,
    failureCount: 1,
    succeededRowNumbers: [3],
    failedRows: [{ rowNumber: 4, errors: ["VALIDATION_ERROR"] }],
  });
});

test("rejeita sobreposição contra uma vigência já carregada do Salesforce", () => {
  const result = normalizePublication({
    selectedRows: [
      {
        rowNumber: 15,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "2",
        effectiveStartDate: "2027-02-01",
        effectiveEndDate: "",
      },
    ],
    salesforceRows: [
      {
        ServiceResourceId: "R1",
        SkillId: "K1",
        EffectiveStartDate: "2027-01-01",
        EffectiveEndDate: "2027-03-31",
      },
    ],
  });

  assert.equal(result.errors.some((error) => error.code === "VIGENCY_OVERLAP"), true);
  assert.deepEqual(result.insertions, []);
});

test("rejeita atualização que se sobrepõe a outro registro existente", () => {
  const result = normalizePublication({
    selectedRows: [
      {
        rowNumber: 16,
        salesforceId: "SRS-1",
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "2",
        effectiveStartDate: "2027-02-01",
        effectiveEndDate: "",
      },
    ],
    salesforceRows: [
      {
        Id: "SRS-1",
        ServiceResourceId: "R1",
        SkillId: "K1",
        EffectiveStartDate: "2026-01-01",
        EffectiveEndDate: "2026-12-31",
      },
      {
        Id: "SRS-2",
        ServiceResourceId: "R1",
        SkillId: "K1",
        EffectiveStartDate: "2027-01-01",
        EffectiveEndDate: "2027-03-31",
      },
    ],
  });

  assert.equal(result.errors.some((error) => error.code === "VIGENCY_OVERLAP"), true);
  assert.deepEqual(result.updates, []);
});
