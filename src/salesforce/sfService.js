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

function syncColaboradores() {
  try {
    const rows = querySalesforceAll(
      "SELECT Id, Name, IsActive, IsOptimizationCapable, Departamento__c, Supervis_o__c, " +
      "Coordena_o__c, LocationId, ResourceType, ID_Prestador_Friday__c, Matricula_Turbi__c " +
      "FROM ServiceResource ORDER BY Name",
    );
    replaceDataRange("Colaboradores", [
      ["ID Colaborador", "Colaborador", "Ativo", "Inserido na Otimização", "Departamento", "Supervisão", "Coordenação", "Local", "Tipo"],
      ...rows.map((row) => [
        row.Id,
        row.Name,
        row.IsActive,
        row.IsOptimizationCapable,
        row.Departamento__c,
        row.Supervis_o__c,
        row.Coordena_o__c,
        row.LocationId,
        row.ResourceType,
      ]),
    ]);
    return rows;
  } catch (error) {
    SpreadsheetApp.getUi().alert("Falha no Salesforce: " + (error.message || "Falha desconhecida"));
    return null;
  }
}

function syncSkills() {
  try {
    const rows = querySalesforceAll(
      "SELECT Id, ServiceResourceId, SkillId, Skill.MasterLabel, SkillLevel, " +
      "EffectiveStartDate, EffectiveEndDate, CreatedById, LastModifiedById " +
      "FROM ServiceResourceSkill",
    );
    replaceDataRange("Matriz de Habilidades", [
      ["ID Habilidade Recurso", "ID Colaborador", "ID Habilidade", "Habilidade", "Nível Habilidade", "Data Início", "Data Término"],
      ...rows.map((row) => [
        row.Id,
        row.ServiceResourceId,
        row.SkillId,
        row.Skill ? row.Skill.MasterLabel : "",
        row.SkillLevel,
        row.EffectiveStartDate,
        row.EffectiveEndDate,
      ]),
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
  return values.slice(1).map((row) => ({
    Id: row[index("ID Habilidade Recurso")],
    ServiceResourceId: row[index("ID Colaborador")],
    SkillId: row[index("ID Habilidade")],
    SkillLevel: row[index("Nível Habilidade")],
    EffectiveStartDate: row[index("Data Início")],
    EffectiveEndDate: row[index("Data Término")],
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
