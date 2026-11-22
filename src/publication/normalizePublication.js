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

  const number = Number(value);
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

  const seen = new Map();
  for (const row of validRows) {
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
      if (
        left.operation === "insert"
        && right.operation === "insert"
        && left.serviceResourceId === right.serviceResourceId
        && left.skillId === right.skillId
        && periodsOverlap(left, right)
      ) {
        addError(
          errors,
          right,
          "VIGENCY_OVERLAP",
          "Vigencies overlap for the same collaborator and skill.",
        );
      }
    }
  }

  const sfIdentityRows = salesforceRows.map((row) => ({
    serviceResourceId: row.ServiceResourceId || row.serviceResourceId,
    skillId: row.SkillId || row.skillId,
    effectiveStartDate: normalizeDate(row.EffectiveStartDate || row.effectiveStartDate),
  }));

  for (const insertion of insertions) {
    const exists = sfIdentityRows.some((row) =>
      row.serviceResourceId === insertion.serviceResourceId
      && row.skillId === insertion.skillId
      && row.effectiveStartDate === insertion.effectiveStartDate
    );
    if (exists) {
      addError(errors, insertion, "EXACT_DUPLICATE", "The vigency already exists in Salesforce.");
    }
  }

  insertions.sort(compareRows);
  updates.sort(compareRows);
  errors.sort((left, right) => (left.rowNumber || 0) - (right.rowNumber || 0));

  return { insertions, updates, errors };
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
