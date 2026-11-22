function getSalesforceAuthService() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const userProperties = PropertiesService.getUserProperties();
  let accessToken = userProperties.getProperty("SALESFORCE_ACCESS_TOKEN");
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
      const ping = function(token) {
        return UrlFetchApp.fetch(instanceUrl + "/services/oauth2/userinfo", {
          headers: { Authorization: "Bearer " + token },
          muteHttpExceptions: true,
        });
      };
      let response = ping(accessToken);
      if (response.getResponseCode() === 401) {
        const refreshed = refreshSalesforceToken();
        if (refreshed) {
          accessToken = userProperties.getProperty("SALESFORCE_ACCESS_TOKEN");
          response = ping(accessToken);
        }
      }
      return { valid: response.getResponseCode() >= 200 && response.getResponseCode() < 300 };
    },
  };
}

function refreshSalesforceToken() {
  const properties = PropertiesService.getUserProperties();
  const refreshToken = properties.getProperty("SALESFORCE_REFRESH_TOKEN");
  if (!refreshToken) return false;
  const environment = getSalesforceEnvironment();
  const scriptProperties = PropertiesService.getScriptProperties();
  const clientId = scriptProperties.getProperty("SALESFORCE_CLIENT_ID");
  const clientSecret = scriptProperties.getProperty("SALESFORCE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return false;
  const tokenUrl = environment === "sandbox"
    ? "https://test.salesforce.com/services/oauth2/token"
    : "https://login.salesforce.com/services/oauth2/token";
  const response = UrlFetchApp.fetch(tokenUrl, {
    method: "post",
    payload: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() >= 300) return false;
  const token = JSON.parse(response.getContentText());
  properties.setProperty("SALESFORCE_ACCESS_TOKEN", token.access_token);
  if (token.instance_url) properties.setProperty("SALESFORCE_INSTANCE_URL", token.instance_url);
  return true;
}

function authCallback(request) {
  if (!request || !request.parameter || !request.parameter.code) {
    return HtmlService.createHtmlOutput("Falha: código OAuth não recebido.");
  }

  const environment = getSalesforceEnvironment();
  const scriptProperties = PropertiesService.getScriptProperties();
  const clientId = scriptProperties.getProperty("SALESFORCE_CLIENT_ID");
  const clientSecret = scriptProperties.getProperty("SALESFORCE_CLIENT_SECRET");
  const callbackUrl = scriptProperties.getProperty("SALESFORCE_CALLBACK_URL");
  const tokenUrl = environment === "sandbox"
    ? "https://test.salesforce.com/services/oauth2/token"
    : "https://login.salesforce.com/services/oauth2/token";
  if (!clientId || !clientSecret || !callbackUrl) {
    return HtmlService.createHtmlOutput("Falha: credenciais OAuth não configuradas.");
  }

  const response = UrlFetchApp.fetch(tokenUrl, {
    method: "post",
    payload: {
      grant_type: "authorization_code",
      code: request.parameter.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      code_verifier: PropertiesService.getUserProperties().getProperty("SALESFORCE_PKCE_VERIFIER"),
    },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() >= 300) {
    return HtmlService.createHtmlOutput("Falha na troca do código OAuth.");
  }

  const token = JSON.parse(response.getContentText());
  const properties = PropertiesService.getUserProperties();
  properties.setProperty("SALESFORCE_ACCESS_TOKEN", token.access_token);
  properties.setProperty("SALESFORCE_REFRESH_TOKEN", token.refresh_token || "");
  properties.setProperty("SALESFORCE_INSTANCE_URL", token.instance_url);
  return HtmlService.createHtmlOutput("Autenticação concluída. Você já pode voltar à planilha.");
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
  const codeVerifier = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    codeVerifier,
  );
  const codeChallenge = Utilities.base64Encode(digest)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  PropertiesService.getUserProperties().setProperty("SALESFORCE_PKCE_VERIFIER", codeVerifier);
  const loginUrl = environment === "sandbox"
    ? "https://test.salesforce.com/services/oauth2/authorize"
    : "https://login.salesforce.com/services/oauth2/authorize";
  const authorizationUrl = loginUrl
    + "?response_type=code"
    + "&client_id=" + encodeURIComponent(clientId)
    + "&redirect_uri=" + encodeURIComponent(callbackUrl)
    + "&scope=" + encodeURIComponent("api refresh_token")
    + "&code_challenge=" + encodeURIComponent(codeChallenge)
    + "&code_challenge_method=S256";
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
  properties.deleteProperty("SALESFORCE_PKCE_VERIFIER");
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
