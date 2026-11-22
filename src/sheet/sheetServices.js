function replaceDataRange(sheetName, values) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  if (values.length === 0) return;

  const existingValues = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues()
    : [];
  const dataHeaders = values[0];
  let nextColumn = sheet.getLastColumn() + 1;
  const mappedIndexes = dataHeaders.map((header) => {
    const index = existingValues[0]
      ? existingValues[0].findIndex((existing) => String(existing).trim() === String(header).trim())
      : -1;
    if (index >= 0) return index + 1;
    const column = nextColumn;
    nextColumn += 1;
    return column;
  });

  for (let index = 0; index < dataHeaders.length; index += 1) {
    const column = mappedIndexes[index];
    sheet.getRange(1, column, 1, 1).setValue(dataHeaders[index]);
  }

  const lastDataRow = sheet.getLastRow();
  if (lastDataRow > 1) {
    for (const column of mappedIndexes) {
      sheet.getRange(2, column, lastDataRow - 1, 1).clearContent();
    }
  }

  for (let index = 0; index < dataHeaders.length; index += 1) {
    const column = mappedIndexes[index];
    const columnValues = values.slice(1).map((row) => [row[index]]);
    if (columnValues.length > 0) {
      sheet.getRange(2, column, columnValues.length, 1).setValues(columnValues);
    }
  }
  if (!sheet.getFilter()) {
    sheet.createFilter();
  }
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
    preview.selectedRowCount || preview.insertions.length + preview.updates.length,
    successes,
    failures,
    JSON.stringify({
      insertions: preview.insertions.map((row) => row.rowId),
      updates: preview.updates.map((row) => row.rowId),
    }),
  ]);
}
