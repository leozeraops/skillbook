function normalizePublicationForAppsScript(selectedRows, salesforceRows) {
  const insertions = [];
  const updates = [];
  const errors = [];

  function dateOnly(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return null;
    }

    let text;
    if (Object.prototype.toString.call(value) === "[object Date]") {
      text = Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else {
      const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
      if (!match) return null;
      text = match[1];
    }

    const parsed = new Date(`${text}T00:00:00Z`);
    if (
      Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== text
    ) {
      return null;
    }
    return text;
  }

  function addError(row, code, message) {
    errors.push({
      rowNumber: row.rowNumber,
      rowId: row.salesforceId
        ? String(row.salesforceId)
        : `${row.serviceResourceId || ""}|${row.skillId || ""}|${dateOnly(row.effectiveStartDate) || ""}`,
      code,
      message,
    });
  }

  function compareRows(left, right) {
    return (left.rowNumber || 0) - (right.rowNumber || 0);
  }

  function periodsOverlap(left, right) {
    const leftEnd = left.effectiveEndDate || "9999-12-31";
    const rightEnd = right.effectiveEndDate || "9999-12-31";
    return left.effectiveStartDate <= rightEnd && right.effectiveStartDate <= leftEnd;
  }

  function isPositiveDecimal(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return false;
    }
    if (typeof value !== "number" && typeof value !== "string") {
      return false;
    }

    const text = String(value).trim();
    if (typeof value === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
      return false;
    }

    const number = Number(text);
    return Number.isFinite(number) && number > 0;
  }

  const validRows = [];
  for (const row of selectedRows || []) {
    const startDate = dateOnly(row.effectiveStartDate);
    const endDate = dateOnly(row.effectiveEndDate);
    let valid = true;

    if (!row.effectiveStartDate || String(row.effectiveStartDate).trim() === "") {
      addError(row, "START_DATE_REQUIRED", "EffectiveStartDate is required.");
      valid = false;
    } else if (!startDate) {
      addError(row, "INVALID_START_DATE", "EffectiveStartDate is invalid.");
      valid = false;
    }
    if (row.effectiveEndDate && String(row.effectiveEndDate).trim() !== "" && !endDate) {
      addError(row, "INVALID_END_DATE", "EffectiveEndDate is invalid.");
      valid = false;
    }
    if (startDate && endDate && endDate < startDate) {
      addError(row, "END_DATE_BEFORE_START", "EffectiveEndDate cannot precede EffectiveStartDate.");
      valid = false;
    }
    const level = Number(row.skillLevel);
    if (!isPositiveDecimal(row.skillLevel)) {
      addError(row, "INVALID_SKILL_LEVEL", "SkillLevel must be a decimal greater than zero.");
      valid = false;
    }
    if (!row.serviceResourceId || !row.skillId) {
      addError(row, "MISSING_IDENTITY", "ServiceResourceId and SkillId are required.");
      valid = false;
    }
    if (!valid) continue;

    const normalized = {
      rowNumber: row.rowNumber,
      operation: row.salesforceId ? "update" : "insert",
      rowId: row.salesforceId
        ? String(row.salesforceId)
        : `${row.serviceResourceId}|${row.skillId}|${startDate}`,
      serviceResourceId: String(row.serviceResourceId),
      skillId: String(row.skillId),
      skillLevel: level,
      effectiveStartDate: startDate,
      effectiveEndDate: endDate,
    };
    if (row.salesforceId) {
      normalized.id = String(row.salesforceId);
      updates.push(normalized);
    } else {
      insertions.push(normalized);
    }
    validRows.push(normalized);
  }

  validRows.sort(compareRows);

  const seen = new Map();
  const seenSalesforceIds = new Set();
  for (const row of validRows) {
    if (row.operation === "update") {
      if (seenSalesforceIds.has(row.id)) {
        addError(row, "EXACT_DUPLICATE", "The Salesforce record is selected more than once.");
      } else {
        seenSalesforceIds.add(row.id);
      }
      continue;
    }

    const identity = `${row.serviceResourceId}|${row.skillId}|${row.effectiveStartDate}`;
    if (!seen.has(identity)) {
      seen.set(identity, row);
      continue;
    }

    const duplicate = seen.get(identity);
    if (
      row.operation === "insert"
      && duplicate.operation === "insert"
      && row.effectiveEndDate === duplicate.effectiveEndDate
    ) {
      addError(row, "EXACT_DUPLICATE", "An exact duplicate vigency is present in the selected rows.");
    }
  }

  for (let index = 0; index < validRows.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < validRows.length; otherIndex += 1) {
      const left = validRows[index];
      const right = validRows[otherIndex];
      if (left.operation === "update" && left.id === right.id) {
        continue;
      }
      if (
        left.serviceResourceId === right.serviceResourceId
        && left.skillId === right.skillId
        && periodsOverlap(left, right)
      ) {
        addError(right, "VIGENCY_OVERLAP", "Vigencies overlap for the same collaborator and skill.");
      }
    }
  }

  const sfIdentityRows = (salesforceRows || []).map((row) => ({
    id: row.Id || row.id,
    serviceResourceId: row.ServiceResourceId || row.serviceResourceId,
    skillId: row.SkillId || row.skillId,
    effectiveStartDate: dateOnly(row.EffectiveStartDate || row.effectiveStartDate),
    effectiveEndDate: dateOnly(row.EffectiveEndDate || row.effectiveEndDate),
  }));

  for (const selectedRow of validRows) {
    const conflictingSalesforceRows = sfIdentityRows.filter((row) =>
      (selectedRow.operation !== "update" || row.id !== selectedRow.id)
      && row.serviceResourceId === selectedRow.serviceResourceId
      && row.skillId === selectedRow.skillId
      && row.effectiveStartDate
      && periodsOverlap(selectedRow, row)
    );

    if (selectedRow.operation === "insert" && conflictingSalesforceRows.some((row) =>
      row.effectiveStartDate === selectedRow.effectiveStartDate
    )) {
      addError(selectedRow, "EXACT_DUPLICATE", "The vigency already exists in Salesforce.");
    }
    if (conflictingSalesforceRows.length > 0) {
      addError(selectedRow, "VIGENCY_OVERLAP", "The vigency overlaps a Salesforce assignment.");
    }
  }

  const rejectedRowNumbers = new Set(errors.map((error) => error.rowNumber));
  const acceptedInsertions = insertions.filter((row) => !rejectedRowNumbers.has(row.rowNumber));
  const acceptedUpdates = updates.filter((row) => !rejectedRowNumbers.has(row.rowNumber));

  acceptedInsertions.sort(compareRows);
  acceptedUpdates.sort(compareRows);
  errors.sort(compareRows);
  return { insertions: acceptedInsertions, updates: acceptedUpdates, errors };
}

function formatPublicationPreview(preview) {
  const insertions = preview && preview.insertions ? preview.insertions : [];
  const updates = preview && preview.updates ? preview.updates : [];
  const errors = preview && preview.errors ? preview.errors : [];
  const lines = [
    "Prévia da publicação",
    `Inserções: ${insertions.length}`,
  ];

  for (const row of insertions) {
    lines.push(`Linha ${row.rowNumber}: ${row.rowId}`);
  }
  lines.push(`Atualizações: ${updates.length}`);
  for (const row of updates) {
    lines.push(`Linha ${row.rowNumber}: ${row.rowId}`);
  }
  lines.push(`Erros: ${errors.length}`);
  for (const error of errors) {
    lines.push(`Linha ${error.rowNumber} (${error.code}): ${error.rowId} - ${error.message}`);
  }
  return lines.join("\n");
}
