export function mergePaginatedRecords(pages) {
  const records = [];
  for (const page of pages || []) {
    records.push(...(page.records || []));
  }
  return records;
}

export function parseFieldMapping(rows) {
  const mapping = {};
  for (const row of rows.slice(1)) {
    if (!row[0]) continue;
    const column = String(row[0]).trim();
    mapping[column] = {
      objectName: row[1],
      apiName: row[2],
      primaryKey: row[4] === true || String(row[4]).trim().toLowerCase() === "sim",
      updatable: row[5] === true || String(row[5]).trim().toLowerCase() === "sim",
    };
  }
  return mapping;
}

export function buildRefreshPlan({ headers = [], existingValues = [], dataHeaders = [], dataRows = [] }) {
  const header = existingValues[0] || headers;
  const columnsToWrite = [];
  for (const dataHeader of dataHeaders) {
    const index = header.findIndex((value) => String(value).trim() === dataHeader);
    if (index >= 0) {
      columnsToWrite.push({ header: dataHeader, index });
    }
  }
  const mappedIndexes = new Set(columnsToWrite.map((column) => column.index));
  const preservedColumns = header
    .map((_, index) => index)
    .filter((index) => !mappedIndexes.has(index));

  return {
    columnsToWrite,
    rows: dataRows,
    writeStartRow: 2,
    staleRowCount: Math.max((existingValues.length - 1) - dataRows.length, 0),
    preservedColumns,
  };
}

export function buildMappedSoqlField(column) {
  const apiName = String(column?.apiName || "").trim();
  if (!apiName) return "";
  if (apiName.includes(".")) return apiName;
  if (column?.objectName === "ServiceResource" || column?.objectName === "Skill") {
    return `${column.objectName}.${apiName}`;
  }
  return apiName;
}

export function validatePublicationMapping(mapping) {
  const requiredFields = [
    "Id",
    "ServiceResourceId",
    "SkillId",
    "SkillLevel",
    "EffectiveStartDate",
  ];
  const values = Object.values(mapping || {});
  return requiredFields.every((apiName) =>
    values.some((column) =>
      column.objectName === "ServiceResourceSkill"
      && column.apiName === apiName
    )
  );
}

export function findMappedHeader(mapping, objectName, apiName) {
  for (const header of Object.keys(mapping || {})) {
    const column = mapping[header];
    if (column.objectName === objectName && column.apiName === apiName) {
      return header;
    }
  }
  return null;
}

export function buildSheetColumnLetter(index) {
  let number = Number(index);
  if (!Number.isInteger(number) || number < 0) return "";
  let letter = "";
  number += 1;
  while (number > 0) {
    const remainder = (number - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    number = Math.floor((number - 1) / 26);
  }
  return letter;
}

export function classifyVigencyState(endDate, referenceDate = new Date(), warningDays = 30) {
  const referenceText = typeof referenceDate === "string"
    ? referenceDate
    : referenceDate.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceText)) return "unknown";
  const reference = new Date(`${referenceText}T00:00:00Z`);
  if (Number.isNaN(reference.getTime())) return "unknown";

  if (!endDate) return "active";
  const endText = String(endDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endText)) return "unknown";

  const end = new Date(`${endText}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return "unknown";

  if (end < reference) return "expired";
  const warningLimit = reference.getTime() + Number(warningDays) * 24 * 60 * 60 * 1000;
  return end.getTime() <= warningLimit ? "expiring" : "active";
}
