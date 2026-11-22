function readSelectedRows(ranges) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const columnIndex = new Map(headerRow.map((header, index) => [String(header).trim(), index]));
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
        salesforceId: get("ID Habilidade Recurso"),
        serviceResourceId: get("ID Colaborador"),
        skillId: get("ID Habilidade"),
        skillLevel: get("Nível Habilidade"),
        effectiveStartDate: get("Data Início"),
        effectiveEndDate: get("Data Término"),
      });
    }
  }
  return rows;
}

function buildPublicationPreview(ranges) {
  const selectedRows = readSelectedRows(ranges);
  const salesforceRows = readLoadedSalesforceRows();
  return normalizePublicationForAppsScript(selectedRows, salesforceRows);
}

function formatPublicationResult(response) {
  const records = response && response.records ? response.records : [];
  const successes = records.filter((record) => record.success).length;
  const failures = records.length - successes;
  return `Publicação concluída\nSucessos: ${successes}\nFalhas: ${failures}`;
}
