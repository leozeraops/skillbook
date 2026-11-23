function readSelectedRows(ranges) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const columnIndex = new Map(headerRow.map((header, index) => [String(header).trim(), index]));
  let mapping = {};
  try {
    mapping = getFieldMapping();
  } catch (error) {
    mapping = {};
  }
  const headerForApiName = (apiName) => {
    for (const header of Object.keys(mapping)) {
      if (
        mapping[header].objectName === "ServiceResourceSkill"
        && mapping[header].apiName === apiName
      ) return header;
    }
    return null;
  };
  const headers = {
    salesforceId: headerForApiName("Id"),
    serviceResourceId: headerForApiName("ServiceResourceId"),
    skillId: headerForApiName("SkillId"),
    skillLevel: headerForApiName("SkillLevel"),
    effectiveStartDate: headerForApiName("EffectiveStartDate"),
    effectiveEndDate: headerForApiName("EffectiveEndDate"),
  };
  const rows = [];

  for (const range of ranges) {
    for (let row = range.getRow(); row < range.getRow() + range.getNumRows(); row += 1) {
      if (row === 1) {
        continue;
      }
      const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
      const get = (name) => {
        const index = columnIndex.get(name);
        return index === undefined ? null : values[index];
      };
      rows.push({
        rowNumber: row,
        salesforceId: get(headers.salesforceId),
        serviceResourceId: get(headers.serviceResourceId),
        skillId: get(headers.skillId),
        skillLevel: get(headers.skillLevel),
        effectiveStartDate: get(headers.effectiveStartDate),
        effectiveEndDate: get(headers.effectiveEndDate),
      });
    }
  }
  return rows;
}

function buildPublicationPreview(ranges) {
  const selectedRows = readSelectedRows(ranges);
  const salesforceRows = readLoadedSalesforceRows();
  const result = normalizePublicationForAppsScript(selectedRows, salesforceRows);
  let mappingValid = true;
  try {
    const mapping = getFieldMapping();
    const requiredFields = [
      "Id",
      "ServiceResourceId",
      "SkillId",
      "SkillLevel",
      "EffectiveStartDate",
    ];
    mappingValid = requiredFields.every((apiName) =>
      Object.values(mapping).some((column) =>
        column.objectName === "ServiceResourceSkill"
        && column.apiName === apiName
      )
    );
  } catch (error) {
    mappingValid = false;
  }
  result.mappingValid = mappingValid;
  result.selectedRowCount = selectedRows.length;
  return result;
}

function formatPublicationResult(response) {
  const records = response && response.records ? response.records : [];
  const successes = records.filter((record) => record.success);
  const failures = records.filter((record) => !record.success);
  const lines = [
    "Publicação concluída",
    `Sucessos: ${successes.length}`,
    `Falhas: ${failures.length}`,
  ];

  successes.forEach((record) => {
    lines.push(`Linha ${record.rowNumber}: sucesso (${record.id || "sem ID"})`);
  });
  failures.forEach((record) => {
    const errors = record.errors && record.errors.length > 0
      ? record.errors.join(", ")
      : "ERRO_DESCONHECIDO";
    lines.push(`Linha ${record.rowNumber}: falha (${errors})`);
  });
  return lines.join("\n");
}
