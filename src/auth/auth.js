function getSalesforceAuthService() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const userProperties = PropertiesService.getUserProperties();
  const accessToken = userProperties.getProperty("SALESFORCE_ACCESS_TOKEN");
  if (!accessToken) return null;
  return {
    hasAccess: function() {
      return Boolean(accessToken);
    },
    getAccessToken: function() {
      return accessToken;
    },
    validateSession: function() {
      const instanceUrl = userProperties.getProperty("SALESFORCE_INSTANCE_URL");
      if (!instanceUrl) return { valid: false };
      const response = UrlFetchApp.fetch(instanceUrl + "/services/oauth2/userinfo", {
        headers: { Authorization: "Bearer " + accessToken },
        muteHttpExceptions: true,
      });
      return { valid: response.getResponseCode() >= 200 && response.getResponseCode() < 300 };
    },
  };
}

function setSalesforceEnvironment(environment) {
  PropertiesService.getUserProperties().setProperty(
    "SALESFORCE_ENVIRONMENT",
    environment === "sandbox" ? "sandbox" : "production",
  );
}

function startSalesforceLogin() {
  const environment = getSalesforceEnvironment();
  const scriptProperties = PropertiesService.getScriptProperties();
  const clientId = scriptProperties.getProperty("SALESFORCE_CLIENT_ID");
  const callbackUrl = scriptProperties.getProperty("SALESFORCE_CALLBACK_URL");
  if (!clientId || !callbackUrl) {
    SpreadsheetApp.getUi().alert("Configure SALESFORCE_CLIENT_ID e SALESFORCE_CALLBACK_URL em Script Properties.");
    return null;
  }
  const loginUrl = environment === "sandbox"
    ? "https://test.salesforce.com/services/oauth2/authorize"
    : "https://login.salesforce.com/services/oauth2/authorize";
  const authorizationUrl = loginUrl
    + "?response_type=code"
    + "&client_id=" + encodeURIComponent(clientId)
    + "&redirect_uri=" + encodeURIComponent(callbackUrl)
    + "&scope=" + encodeURIComponent("api refresh_token");
  const html = HtmlService.createHtmlOutput(
    '<p>Abra o link para autenticar no Salesforce:</p><a target="_blank" href="' +
    authorizationUrl +
    '">Entrar no Salesforce</a>',
  );
  SpreadsheetApp.getUi().showModalDialog(html, "Autenticação Salesforce");
  return authorizationUrl;
}

function clearInvalidSalesforceSession() {
  const properties = PropertiesService.getUserProperties();
  properties.deleteProperty("SALESFORCE_ACCESS_TOKEN");
  properties.deleteProperty("SALESFORCE_REFRESH_TOKEN");
  properties.deleteProperty("SALESFORCE_INSTANCE_URL");
}

function logoutSalesforce() {
  const properties = PropertiesService.getUserProperties();
  const instanceUrl = properties.getProperty("SALESFORCE_INSTANCE_URL");
  const accessToken = properties.getProperty("SALESFORCE_ACCESS_TOKEN");
  if (instanceUrl && accessToken) {
    try {
      UrlFetchApp.fetch(instanceUrl + "/services/oauth2/revoke", {
        method: "post",
        payload: "token=" + encodeURIComponent(accessToken),
        contentType: "application/x-www-form-urlencoded",
        muteHttpExceptions: true,
      });
    } catch (error) {
      Logger.log(error);
    }
  }
  clearInvalidSalesforceSession();
  SpreadsheetApp.getUi().alert("Sessão do Salesforce encerrada.");
}

function checkSalesforceHealth() {
  try {
    const environment = getSalesforceEnvironment();
    const service = getSalesforceAuthService();
    if (!service || !service.hasAccess()) {
      throw new Error("Não autenticado");
    }
    const session = service.validateSession();
    if (!session.valid) throw new Error("Sessão inválida");
    SpreadsheetApp.getUi().alert("Ambiente saudável: " + environment);
    return true;
  } catch (error) {
    SpreadsheetApp.getUi().alert("Falha no ambiente: " + error.message);
    return false;
  }
}
