function replaceDataRange(sheetName, values) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  if (values.length === 0) return;

  const headerRange = sheet.getRange(1, 1, 1, sheet.getMaxColumns());
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getMaxColumns()).clearContent();
  }
  headerRange.clearContent();
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  sheet.createFilter();
}

function getFieldMapping() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("__Config_Mapping");
  if (!sheet) throw new Error("A aba __Config_Mapping é obrigatória.");
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error("O mapeamento obrigatório está vazio.");
  const mapping = {};
  for (const row of values.slice(1)) {
    if (!row[0]) continue;
    mapping[String(row[0]).trim()] = {
      objectName: row[1],
      apiName: row[2],
      primaryKey: row[4] === true || String(row[4]).toLowerCase() === "sim",
      updatable: row[5] === true || String(row[5]).toLowerCase() === "sim",
    };
  }
  return mapping;
}

function writePublicationAudit(preview, response) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName("Publicacoes");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("Publicacoes");
    sheet.appendRow([
      "Timestamp", "Usuário", "Ambiente", "Selecionadas", "Sucessos", "Falhas", "Resumo reduzido",
    ]);
  }
  const records = response && response.records ? response.records : [];
  const successes = records.filter((record) => record.success).length;
  const failures = records.filter((record) => !record.success).length;
  sheet.appendRow([
    new Date(),
    Session.getActiveUser().getEmail(),
    getSalesforceEnvironment(),
    preview.insertions.length + preview.updates.length,
    successes,
    failures,
    JSON.stringify({
      insertions: preview.insertions.map((row) => row.rowId),
      updates: preview.updates.map((row) => row.rowId),
    }),
  ]);
}
