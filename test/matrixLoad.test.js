import test from "node:test";
import assert from "node:assert/strict";

import {
  mergePaginatedRecords,
  parseFieldMapping,
  buildRefreshPlan,
  buildMappedSoqlField,
  findMappedHeader,
  validatePublicationMapping,
  classifyVigencyState,
  buildSheetColumnLetter,
} from "../src/sheet/matrixLoad.js";

test("gera letras de coluna configuráveis além da coluna Z", () => {
  assert.equal(buildSheetColumnLetter(0), "A");
  assert.equal(buildSheetColumnLetter(25), "Z");
  assert.equal(buildSheetColumnLetter(26), "AA");
  assert.equal(buildSheetColumnLetter(27), "AB");
});

test("classifica vigências vencidas, próximas do vencimento e vigentes", () => {
  assert.equal(classifyVigencyState("2026-11-22", "2026-11-23", 30), "expired");
  assert.equal(classifyVigencyState("2026-12-10", "2026-11-23", 30), "expiring");
  assert.equal(classifyVigencyState("2027-01-31", "2026-11-23", 30), "active");
  assert.equal(classifyVigencyState("", "invalid", 30), "unknown");
});

test("resolve campos publicados pelo objeto Salesforce correto", () => {
  const mapping = {
    IdentificadorSkill: { objectName: "Skill", apiName: "Id" },
    IdentificadorAtribuicao: { objectName: "ServiceResourceSkill", apiName: "Id" },
  };

  assert.equal(
    findMappedHeader(mapping, "ServiceResourceSkill", "Id"),
    "IdentificadorAtribuicao",
  );
});

test("valida objeto e campo obrigatórios do mapeamento de publicação", () => {
  assert.equal(validatePublicationMapping({
    Identificador: { objectName: "ServiceResourceSkill", apiName: "Id" },
    Colaborador: { objectName: "ServiceResourceSkill", apiName: "ServiceResourceId" },
    Habilidade: { objectName: "ServiceResourceSkill", apiName: "SkillId" },
    Nivel: { objectName: "ServiceResourceSkill", apiName: "SkillLevel" },
    Inicio: { objectName: "ServiceResourceSkill", apiName: "EffectiveStartDate" },
  }), true);

  assert.equal(validatePublicationMapping({
    Identificador: { objectName: "Skill", apiName: "Id" },
    Colaborador: { objectName: "ServiceResourceSkill", apiName: "ServiceResourceId" },
  }), false);
});

test("concatena páginas SOQL sem perder registros", () => {
  const records = mergePaginatedRecords([
    { records: [{ Id: "R1" }], done: false },
    { records: [{ Id: "R2" }], done: false },
    { records: [{ Id: "R3" }], done: true },
  ]);

  assert.deepEqual(records.map((record) => record.Id), ["R1", "R2", "R3"]);
});

test("traduz o __Config_Mapping pelas colunas configuradas", () => {
  const mapping = parseFieldMapping([
    ["Coluna no Sheets", "Objeto Salesforce", "Campo Salesforce", "Tipo", "Chave", "Atualizável"],
    ["Identificador", "ServiceResource", "Id", "String", "SIM", "NÃO"],
    ["Nome exibido", "ServiceResource", "Name", "String", "NÃO", "NÃO"],
  ]);

  assert.deepEqual(mapping, {
    Identificador: {
      objectName: "ServiceResource",
      apiName: "Id",
      primaryKey: true,
      updatable: false,
    },
    "Nome exibido": {
      objectName: "ServiceResource",
      apiName: "Name",
      primaryKey: false,
      updatable: false,
    },
  });
});

test("prepara refresh somente nas colunas mapeadas e preserva fórmulas adjacentes", () => {
  const plan = buildRefreshPlan({
    headers: ["ID", "Nome", "Formula"],
    existingValues: [
      ["ID", "Nome", "Formula"],
      ["R1", "Colaborador antigo", "=1"],
      ["R2", "Remover", "=2"],
    ],
    dataHeaders: ["ID", "Nome"],
    dataRows: [
      ["R1", "Colaborador atual"],
    ],
  });

  assert.deepEqual(plan.columnsToWrite, [
    { header: "ID", index: 0 },
    { header: "Nome", index: 1 },
  ]);
  assert.deepEqual(plan.rows, [["R1", "Colaborador atual"]]);
  assert.equal(plan.writeStartRow, 2);
  assert.equal(plan.staleRowCount, 1);
  assert.equal(plan.preservedColumns.includes(2), true);
});

test("qualifica campos relacionados no SOQL de habilidades", () => {
  assert.equal(buildMappedSoqlField({
    objectName: "ServiceResource",
    apiName: "Supervis_o__c",
  }), "ServiceResource.Supervis_o__c");
  assert.equal(buildMappedSoqlField({
    objectName: "Skill",
    apiName: "MasterLabel",
  }), "Skill.MasterLabel");
  assert.equal(buildMappedSoqlField({
    objectName: "ServiceResourceSkill",
    apiName: "EffectiveStartDate",
  }), "EffectiveStartDate");
});
