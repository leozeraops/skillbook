const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  if (!match) {
    return null;
  }

  const dateOnly = match[1];
  const parsed = new Date(`${dateOnly}T00:00:00Z`);
  if (
    !DATE_PATTERN.test(dateOnly)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== dateOnly
  ) {
    return null;
  }

  return dateOnly;
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

function addError(errors, row, code, message) {
  errors.push({
    rowNumber: row.rowNumber,
    rowId: row.salesforceId
      ? String(row.salesforceId)
      : `${row.serviceResourceId || ""}|${row.skillId || ""}|${normalizeDate(row.effectiveStartDate) || ""}`,
    code,
    message,
  });
}

function compareRows(left, right) {
  return (left.rowNumber || 0) - (right.rowNumber || 0);
}

function periodsOverlap(left, right) {
  const leftStart = left.effectiveStartDate;
  const rightStart = right.effectiveStartDate;
  const leftEnd = left.effectiveEndDate || "9999-12-31";
  const rightEnd = right.effectiveEndDate || "9999-12-31";
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function normalizePublication({ selectedRows = [], salesforceRows = [] }) {
  const insertions = [];
  const updates = [];
  const errors = [];
  const validRows = [];

  for (const row of selectedRows) {
    const startDate = normalizeDate(row.effectiveStartDate);
    const endDate = normalizeDate(row.effectiveEndDate);
    let rowValid = true;

    if (!row.effectiveStartDate || String(row.effectiveStartDate).trim() === "") {
      addError(errors, row, "START_DATE_REQUIRED", "EffectiveStartDate is required.");
      rowValid = false;
    } else if (!startDate) {
      addError(errors, row, "INVALID_START_DATE", "EffectiveStartDate is invalid.");
      rowValid = false;
    }

    if (row.effectiveEndDate && String(row.effectiveEndDate).trim() !== "" && !endDate) {
      addError(errors, row, "INVALID_END_DATE", "EffectiveEndDate is invalid.");
      rowValid = false;
    }

    if (startDate && endDate && endDate < startDate) {
      addError(errors, row, "END_DATE_BEFORE_START", "EffectiveEndDate cannot precede EffectiveStartDate.");
      rowValid = false;
    }

    if (!isPositiveDecimal(row.skillLevel)) {
      addError(errors, row, "INVALID_SKILL_LEVEL", "SkillLevel must be a decimal greater than zero.");
      rowValid = false;
    }

    if (!row.serviceResourceId || !row.skillId) {
      addError(errors, row, "MISSING_IDENTITY", "ServiceResourceId and SkillId are required.");
      rowValid = false;
    }

    if (!rowValid) {
      continue;
    }

    const normalized = {
      rowNumber: row.rowNumber,
      operation: row.salesforceId ? "update" : "insert",
      serviceResourceId: String(row.serviceResourceId),
      skillId: String(row.skillId),
      skillLevel: Number(row.skillLevel),
      effectiveStartDate: startDate,
      effectiveEndDate: endDate,
    };

    if (row.salesforceId) {
      normalized.id = String(row.salesforceId);
      normalized.rowId = String(row.salesforceId);
      updates.push(normalized);
    } else {
      normalized.rowId = `${normalized.serviceResourceId}|${normalized.skillId}|${normalized.effectiveStartDate}`;
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
        addError(errors, row, "EXACT_DUPLICATE", "The Salesforce record is selected more than once.");
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
      addError(errors, row, "EXACT_DUPLICATE", "An exact duplicate vigency is present in the selected rows.");
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
        addError(errors, right, "VIGENCY_OVERLAP", "Vigencies overlap for the same collaborator and skill.");
      }
    }
  }

  const sfIdentityRows = salesforceRows.map((row) => ({
    id: row.Id || row.id,
    serviceResourceId: row.ServiceResourceId || row.serviceResourceId,
    skillId: row.SkillId || row.skillId,
    effectiveStartDate: normalizeDate(row.EffectiveStartDate || row.effectiveStartDate),
    effectiveEndDate: normalizeDate(row.EffectiveEndDate || row.effectiveEndDate),
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
      addError(errors, selectedRow, "EXACT_DUPLICATE", "The vigency already exists in Salesforce.");
    }

    if (conflictingSalesforceRows.length > 0) {
      addError(errors, selectedRow, "VIGENCY_OVERLAP", "The vigency overlaps a Salesforce assignment.");
    }
  }

  const rejectedRowNumbers = new Set(errors.map((error) => error.rowNumber));
  const acceptedInsertions = insertions.filter((row) => !rejectedRowNumbers.has(row.rowNumber));
  const acceptedUpdates = updates.filter((row) => !rejectedRowNumbers.has(row.rowNumber));

  acceptedInsertions.sort(compareRows);
  acceptedUpdates.sort(compareRows);
  errors.sort((left, right) => (left.rowNumber || 0) - (right.rowNumber || 0));

  return { insertions: acceptedInsertions, updates: acceptedUpdates, errors };
}

export function summarizePublicationResponse(response) {
  const records = response?.records || [];
  const succeededRowNumbers = [];
  const failedRows = [];

  for (const record of records) {
    if (record.success) {
      succeededRowNumbers.push(record.rowNumber);
    } else {
      failedRows.push({
        rowNumber: record.rowNumber,
        errors: record.errors || [],
      });
    }
  }

  succeededRowNumbers.sort((left, right) => left - right);
  failedRows.sort((left, right) => left.rowNumber - right.rowNumber);

  return {
    successCount: succeededRowNumbers.length,
    failureCount: failedRows.length,
    succeededRowNumbers,
    failedRows,
  };
}

export function buildPublicationAuditRow({
  timestamp,
  user,
  environment,
  preview = {},
  response = {},
}) {
  const records = response.records || [];
  const successCount = records.filter((record) => record.success).length;
  const salesforceFailureCount = records.filter((record) => !record.success).length;
  const previewFailureCount = (preview.errors || []).length;
  const selectedCount = preview.selectedRowCount
    || (preview.insertions || []).length + (preview.updates || []).length;

  return {
    timestamp,
    user,
    environment,
    selectedCount,
    successCount,
    failureCount: previewFailureCount + salesforceFailureCount,
    summary: {
      insertions: (preview.insertions || []).map((row) => row.rowId),
      updates: (preview.updates || []).map((row) => row.rowId),
      previewErrors: (preview.errors || []).map((error) => ({
        rowNumber: error.rowNumber,
        code: error.code,
      })),
    },
  };
}

export function formatPublicationPreview(preview) {
  const insertions = preview?.insertions || [];
  const updates = preview?.updates || [];
  const errors = preview?.errors || [];
  const lines = [
    "Prévia da publicação",
    `Inserções: ${insertions.length}`,
  ];

  insertions.forEach((row) => {
    lines.push(`Linha ${row.rowNumber}: ${row.rowId}`);
  });
  lines.push(`Atualizações: ${updates.length}`);
  updates.forEach((row) => {
    lines.push(`Linha ${row.rowNumber}: ${row.rowId}`);
  });
  lines.push(`Erros: ${errors.length}`);
  errors.forEach((error) => {
    lines.push(`Linha ${error.rowNumber} (${error.code}): ${error.rowId} - ${error.message}`);
  });

  return lines.join("\n");
}

export function formatPublicationResult(response) {
  const records = response?.records || [];
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
