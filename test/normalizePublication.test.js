import test from "node:test";
import assert from "node:assert/strict";

import {
  formatPublicationPreview,
  formatPublicationResult,
  normalizePublication,
  summarizePublicationResponse,
  buildPublicationAuditRow,
} from "../src/publication/normalizePublication.js";

test("gera uma linha de auditoria com contagens e resumo reduzido", () => {
  const row = buildPublicationAuditRow({
    timestamp: "2026-11-23T01:46:49Z",
    user: "operador@example.com",
    environment: "production",
    preview: {
      selectedRowCount: 3,
      insertions: [{ rowId: "R1|K1|2026-12-01" }],
      updates: [{ rowId: "SRS-2" }],
      errors: [{
        rowNumber: 8,
        rowId: "R9|K9|2026-12-15",
        code: "INVALID_SKILL_LEVEL",
      }],
    },
    response: {
      records: [
        { rowNumber: 2, success: true },
        { rowNumber: 3, success: false, errors: ["VALIDATION_ERROR"] },
      ],
    },
  });

  assert.equal(row.timestamp, "2026-11-23T01:46:49Z");
  assert.equal(row.user, "operador@example.com");
  assert.equal(row.environment, "production");
  assert.equal(row.selectedCount, 3);
  assert.equal(row.successCount, 1);
  assert.equal(row.failureCount, 2);
  assert.deepEqual(row.summary, {
    insertions: ["R1|K1|2026-12-01"],
    updates: ["SRS-2"],
    previewErrors: [{
      rowNumber: 8,
      code: "INVALID_SKILL_LEVEL",
    }],
  });
});

test("conta uma linha falhada uma única vez na auditoria", () => {
  const row = buildPublicationAuditRow({
    timestamp: "2026-11-23T01:46:49Z",
    user: "operador@example.com",
    environment: "production",
    preview: {
      selectedRowCount: 2,
      insertions: [{ rowId: "R1|K1|2026-12-01" }],
      updates: [],
      errors: [
        { rowNumber: 3, code: "INVALID_SKILL_LEVEL" },
        { rowNumber: 3, code: "START_DATE_REQUIRED" },
      ],
    },
    response: {
      records: [
        { rowNumber: 2, success: true },
        { rowNumber: 3, success: false, errors: ["VALIDATION_ERROR"] },
      ],
    },
  });

  assert.equal(row.successCount, 1);
  assert.equal(row.failureCount, 1);
});

test("formata a prévia com contagens e detalhes por linha", () => {
  const message = formatPublicationPreview({
    insertions: [{
      rowNumber: 5,
      rowId: "R1|K1|2026-12-01",
      operation: "insert",
    }],
    updates: [{
      rowNumber: 9,
      rowId: "SRS-1",
      operation: "update",
    }],
    errors: [{
      rowNumber: 7,
      rowId: "SRS-2",
      code: "VIGENCY_OVERLAP",
      message: "A vigência se sobrepõe a uma atribuição existente.",
    }],
  });

  assert.match(message, /Prévia da publicação/);
  assert.match(message, /Inserções: 1/);
  assert.match(message, /Linha 5: R1\|K1\|2026-12-01/);
  assert.match(message, /Atualizações: 1/);
  assert.match(message, /Linha 9: SRS-1/);
  assert.match(message, /Erros: 1/);
  assert.match(message, /Linha 7 \(VIGENCY_OVERLAP\): SRS-2/);
  assert.match(message, /A vigência se sobrepõe a uma atribuição existente/);
});

test("formata sucessos e falhas individuais após uma publicação parcial", () => {
  const message = formatPublicationResult({
    records: [
      { rowNumber: 3, success: true, id: "SRS-3", status: "UPDATED" },
      { rowNumber: 4, success: false, id: null, errors: ["VALIDATION_ERROR"] },
    ],
  });

  assert.match(message, /Publicação concluída/);
  assert.match(message, /Sucessos: 1/);
  assert.match(message, /Falhas: 1/);
  assert.match(message, /Linha 3: sucesso \(SRS-3\)/);
  assert.match(message, /Linha 4: falha \(VALIDATION_ERROR\)/);
});

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

test("rejeita linhas selecionadas mais de uma vez pelo mesmo ID do Salesforce", () => {
  const result = normalizePublication({
    selectedRows: [
      {
        rowNumber: 10,
        salesforceId: "SRS-1",
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "2",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "2027-01-31",
      },
      {
        rowNumber: 11,
        salesforceId: "SRS-1",
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "3",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "2027-01-31",
      },
    ],
    salesforceRows: [],
  });

  assert.equal(result.errors.some((error) =>
    error.rowNumber === 11 && error.code === "EXACT_DUPLICATE"
  ), true);
  assert.deepEqual(result.updates.map((row) => row.rowNumber), [10]);
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
      {
        rowNumber: 9,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "0x10",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "",
      },
      {
        rowNumber: 10,
        serviceResourceId: "R1",
        skillId: "K1",
        skillLevel: "1e3",
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "",
      },
    ],
    salesforceRows: [],
  });

  assert.equal(result.errors.some((error) => error.code === "START_DATE_REQUIRED"), true);
  assert.equal(result.errors.some((error) => error.code === "INVALID_SKILL_LEVEL"), true);
  assert.equal(result.errors.some((error) => error.code === "END_DATE_BEFORE_START"), true);
  assert.equal(result.errors.some((error) => error.rowNumber === 9 && error.code === "INVALID_SKILL_LEVEL"), true);
  assert.equal(result.errors.some((error) => error.rowNumber === 10 && error.code === "INVALID_SKILL_LEVEL"), true);
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
