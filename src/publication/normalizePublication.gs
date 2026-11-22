function normalizePublicationForAppsScript(selectedRows, salesforceRows) {
  const insertions = [];
  const updates = [];
  const errors = [];

  function dateOnly(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    const text = String(value).trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  function error(row, code, message) {
    errors.push({
      rowNumber: row.rowNumber,
      rowId: row.salesforceId || `${row.serviceResourceId}|${row.skillId}|${dateOnly(row.effectiveStartDate)}`,
      code,
      message,
    });
  }

  const validRows = [];
  for (const row of selectedRows) {
    const startDate = dateOnly(row.effectiveStartDate);
    const endDate = dateOnly(row.effectiveEndDate);
    let valid = true;

    if (!row.effectiveStartDate) {
      error(row, "START_DATE_REQUIRED", "EffectiveStartDate is required.");
      valid = false;
    } else if (!startDate) {
      error(row, "INVALID_START_DATE", "EffectiveStartDate is invalid.");
      valid = false;
    }
    if (row.effectiveEndDate && !endDate) {
      error(row, "INVALID_END_DATE", "EffectiveEndDate is invalid.");
      valid = false;
    }
    if (startDate && endDate && endDate < startDate) {
      error(row, "END_DATE_BEFORE_START", "EffectiveEndDate cannot precede EffectiveStartDate.");
      valid = false;
    }
    const level = Number(row.skillLevel);
    if (!Number.isFinite(level) || level <= 0) {
      error(row, "INVALID_SKILL_LEVEL", "SkillLevel must be a decimal greater than zero.");
      valid = false;
    }
    if (!row.serviceResourceId || !row.skillId) {
      error(row, "MISSING_IDENTITY", "ServiceResourceId and SkillId are required.");
      valid = false;
    }
    if (!valid) continue;

    const normalized = {
      rowNumber: row.rowNumber,
      operation: row.salesforceId ? "update" : "insert",
      id: row.salesforceId || undefined,
      rowId: row.salesforceId || `${row.serviceResourceId}|${row.skillId}|${startDate}`,
      serviceResourceId: String(row.serviceResourceId),
      skillId: String(row.skillId),
      skillLevel: level,
      effectiveStartDate: startDate,
      effectiveEndDate: endDate,
    };
    if (row.salesforceId) updates.push(normalized);
    else insertions.push(normalized);
    validRows.push(normalized);
  }

  for (let i = 0; i < validRows.length; i++) {
    for (let j = i + 1; j < validRows.length; j++) {
      const left = validRows[i];
      const right = validRows[j];
      if (left.operation !== "insert" || right.operation !== "insert") continue;
      if (left.serviceResourceId !== right.serviceResourceId || left.skillId !== right.skillId) continue;
      const leftEnd = left.effectiveEndDate || "9999-12-31";
      const rightEnd = right.effectiveEndDate || "9999-12-31";
      if (left.effectiveStartDate <= rightEnd && right.effectiveStartDate <= leftEnd) {
        if (left.effectiveStartDate === right.effectiveStartDate && left.effectiveEndDate === right.effectiveEndDate) {
          error(right, "EXACT_DUPLICATE", "An exact duplicate vigency is present.");
        } else {
          error(right, "VIGENCY_OVERLAP", "Vigencies overlap for the same collaborator and skill.");
        }
      }
    }
  }

  insertions.sort((a, b) => a.rowNumber - b.rowNumber);
  updates.sort((a, b) => a.rowNumber - b.rowNumber);
  errors.sort((a, b) => a.rowNumber - b.rowNumber);
  return { insertions, updates, errors };
}
