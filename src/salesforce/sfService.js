function getSalesforceEnvironment() {
  const userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty("SALESFORCE_ENVIRONMENT") || "production";
}

function getSalesforceInstanceUrl() {
  const service = getSalesforceAuthService();
  if (!service || !service.hasAccess()) {
    throw new Error("Autenticação do Salesforce ausente ou expirada.");
  }
  return PropertiesService.getUserProperties().getProperty("SALESFORCE_INSTANCE_URL");
}

function salesforceFetch(path, options) {
  const service = getSalesforceAuthService();
  if (!service || !service.hasAccess()) {
    throw new Error("Autenticação do Salesforce ausente ou expirada.");
  }
  if (!service.validateSession) {
    throw new Error("O adaptador de autenticação não expõe a validação real da sessão.");
  }
  const session = service.validateSession();
  if (!session.valid) {
    clearInvalidSalesforceSession();
    const loginUrl = startSalesforceLogin();
    throw new Error(
      "A sessão do Salesforce expirou. Entre novamente." +
      (loginUrl ? " Nova URL: " + loginUrl : ""),
    );
  }

  const baseUrl = PropertiesService.getUserProperties().getProperty("SALESFORCE_INSTANCE_URL");
  const response = UrlFetchApp.fetch(baseUrl + path, {
    method: options.method || "get",
    headers: {
      Authorization: `Bearer ${service.getAccessToken()}`,
      "Content-Type": "application/json",
    },
    payload: options.payload ? JSON.stringify(options.payload) : undefined,
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() >= 300) {
    throw new Error(`Salesforce API ${response.getResponseCode()}: ${response.getContentText()}`);
  }
  return JSON.parse(response.getContentText());
}

function querySalesforceAll(soql) {
  const records = [];
  let result = salesforceFetch(`/services/data/v62.0/query?q=${encodeURIComponent(soql)}`, {});
  records.push(...(result.records || []));
  while (!result.done && result.nextRecordsUrl) {
    result = salesforceFetch(result.nextRecordsUrl, {});
    records.push(...(result.records || []));
  }
  return records;
}

function getMappedColumns(objectNames) {
  const mapping = getFieldMapping();
  return Object.keys(mapping)
    .filter((header) => objectNames.indexOf(mapping[header].objectName) >= 0)
    .map((header) => ({
      header,
      objectName: mapping[header].objectName,
      apiName: mapping[header].apiName,
    }));
}

function readMappedValue(record, apiName) {
  if (!apiName) return "";
  if (apiName.indexOf(".") >= 0) {
    const parts = apiName.split(".");
    let value = record;
    for (const part of parts) {
      if (value === null || value === undefined) return "";
      value = value[part];
    }
    return value === null || value === undefined ? "" : value;
  }
  return record[apiName] === null || record[apiName] === undefined ? "" : record[apiName];
}

function syncColaboradores() {
  try {
    const columns = getMappedColumns(["ServiceResource"]);
    if (columns.length === 0) {
      throw new Error("Não há colunas de ServiceResource no mapeamento.");
    }
    const apiNames = Array.from(new Set(columns.map((column) => column.apiName)));
    const rows = querySalesforceAll(
      `SELECT ${apiNames.join(", ")} FROM ServiceResource ORDER BY Name`,
    );
    replaceDataRange("Colaboradores", [
      columns.map((column) => column.header),
      ...rows.map((row) => columns.map((column) => readMappedValue(row, column.apiName))),
    ]);
    return rows;
  } catch (error) {
    SpreadsheetApp.getUi().alert("Falha no Salesforce: " + (error.message || "Falha desconhecida"));
    return null;
  }
}

function syncSkills() {
  try {
    const columns = getMappedColumns(["ServiceResourceSkill", "Skill", "ServiceResource"]);
    if (columns.length === 0) {
      throw new Error("Não há colunas de habilidades no mapeamento.");
    }
    const apiNames = Array.from(new Set(columns.map((column) => {
      if (column.apiName && column.apiName.indexOf(".") >= 0) return column.apiName;
      if (column.objectName === "ServiceResource" || column.objectName === "Skill") {
        return `${column.objectName}.${column.apiName}`;
      }
      return column.apiName;
    }).filter((apiName) => apiName)));
    const rows = querySalesforceAll(
      `SELECT ${apiNames.join(", ")} FROM ServiceResourceSkill`,
    );
    replaceDataRange("Matriz de Habilidades", [
      columns.map((column) => column.header),
      ...rows.map((row) => columns.map((column) => {
        if (column.apiName && column.apiName.indexOf(".") >= 0) {
          return readMappedValue(row, column.apiName);
        }
        if (column.objectName === "ServiceResource" || column.objectName === "Skill") {
          return readMappedValue(row, `${column.objectName}.${column.apiName}`);
        }
        return readMappedValue(row, column.apiName);
      })),
    ]);
    readLoadedSalesforceRowsCache = rows;
    return rows;
  } catch (error) {
    SpreadsheetApp.getUi().alert("Falha no Salesforce: " + (error.message || "Falha desconhecida"));
    return null;
  }
}

let readLoadedSalesforceRowsCache = null;
function readLoadedSalesforceRows() {
  if (readLoadedSalesforceRowsCache) {
    return readLoadedSalesforceRowsCache;
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Matriz de Habilidades");
  if (!sheet) {
    return [];
  }
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }
  const headers = values[0].map((value) => String(value).trim());
  const index = (name) => headers.indexOf(name);
  let mapping = {};
  try {
    mapping = getFieldMapping();
  } catch (error) {
    mapping = {};
  }
  const headerForApiName = (apiName) => {
    for (const header of Object.keys(mapping)) {
      if (mapping[header].apiName === apiName) return header;
    }
    return null;
  };
  const idHeader = headerForApiName("Id");
  const resourceHeader = headerForApiName("ServiceResourceId");
  const skillHeader = headerForApiName("SkillId");
  const levelHeader = headerForApiName("SkillLevel");
  const startHeader = headerForApiName("EffectiveStartDate");
  const endHeader = headerForApiName("EffectiveEndDate");
  return values.slice(1).map((row) => ({
    Id: idHeader ? row[index(idHeader)] : "",
    ServiceResourceId: resourceHeader ? row[index(resourceHeader)] : "",
    SkillId: skillHeader ? row[index(skillHeader)] : "",
    SkillLevel: levelHeader ? row[index(levelHeader)] : "",
    EffectiveStartDate: startHeader ? row[index(startHeader)] : "",
    EffectiveEndDate: endHeader ? row[index(endHeader)] : "",
  }));
}

function postPublication(preview) {
  return salesforceFetch("/services/apexrest/SkillPublication", {
    method: "post",
    payload: {
      insertions: preview.insertions,
      updates: preview.updates,
    },
  });
}
