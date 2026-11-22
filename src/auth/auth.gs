function getSalesforceEnvironment() {
  const environment = PropertiesService.getUserProperties().getProperty("SALESFORCE_ENVIRONMENT");
  return environment === "sandbox" ? "sandbox" : "production";
}

function getSalesforceAuthService() {
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
      if (!instanceUrl) return { valid: false, reason: "missing-instance-url" };
      const ping = function(token) {
        return UrlFetchApp.fetch(instanceUrl + "/services/oauth2/userinfo", {
          headers: { Authorization: "Bearer " + token },
          muteHttpExceptions: true,
        });
      };
      let response;
      try {
        response = ping(accessToken);
      } catch (error) {
        Logger.log(error);
        return { valid: false, reason: "ping-failed" };
      }
      if (response.getResponseCode() === 401) {
        const refreshed = refreshSalesforceToken();
        if (refreshed) {
          accessToken = userProperties.getProperty("SALESFORCE_ACCESS_TOKEN");
          try {
            response = ping(accessToken);
          } catch (error) {
            Logger.log(error);
            return { valid: false, reason: "ping-failed" };
          }
        } else {
          return { valid: false, reason: "refresh-failed" };
        }
      }
      const valid = response.getResponseCode() >= 200 && response.getResponseCode() < 300;
      return { valid: valid, reason: valid ? "valid" : "ping-rejected" };
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
  try {
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
    if (!token.access_token) return false;
    properties.setProperty("SALESFORCE_ACCESS_TOKEN", token.access_token);
    if (token.instance_url) properties.setProperty("SALESFORCE_INSTANCE_URL", token.instance_url);
    return true;
  } catch (error) {
    Logger.log(error);
    return false;
  }
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

  try {
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
    if (!token.access_token || !token.instance_url) {
      return HtmlService.createHtmlOutput("Falha na troca do código OAuth.");
    }
    const properties = PropertiesService.getUserProperties();
    properties.setProperty("SALESFORCE_ACCESS_TOKEN", token.access_token);
    properties.setProperty("SALESFORCE_REFRESH_TOKEN", token.refresh_token || "");
    properties.setProperty("SALESFORCE_INSTANCE_URL", token.instance_url);
    return HtmlService.createHtmlOutput("Autenticação concluída. Você já pode voltar à planilha.");
  } catch (error) {
    Logger.log(error);
    return HtmlService.createHtmlOutput("Falha na troca do código OAuth.");
  }
}

function doGet(request) {
  return authCallback(request);
}

function setSalesforceEnvironment(environment) {
  const properties = PropertiesService.getUserProperties();
  properties.setProperty(
    "SALESFORCE_ENVIRONMENT",
    environment === "sandbox" ? "sandbox" : "production",
  );
  properties.deleteProperty("SALESFORCE_ACCESS_TOKEN");
  properties.deleteProperty("SALESFORCE_REFRESH_TOKEN");
  properties.deleteProperty("SALESFORCE_INSTANCE_URL");
  properties.deleteProperty("SALESFORCE_PKCE_VERIFIER");
  CacheService.getUserCache().removeAll([
    "SALESFORCE_SESSION_VALID",
    "SALESFORCE_SYNC_LOCK",
  ]);
  const ui = SpreadsheetApp.getUi();
  ui.alert(environment === "sandbox"
    ? "Ambiente Salesforce: Sandbox."
    : "Ambiente Salesforce: Produção.");
  return getSalesforceEnvironment();
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
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, codeVerifier);
  const codeChallenge = Utilities.base64Encode(digest)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  PropertiesService.getUserProperties().setProperty("SALESFORCE_PKCE_VERIFIER", codeVerifier);
  const authorizationUrl =
    (environment === "sandbox"
      ? "https://test.salesforce.com/services/oauth2/authorize"
      : "https://login.salesforce.com/services/oauth2/authorize")
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
  CacheService.getUserCache().removeAll([
    "SALESFORCE_SESSION_VALID",
    "SALESFORCE_SYNC_LOCK",
  ]);
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
  return false;
}

function checkSalesforceHealth() {
  try {
    const environment = getSalesforceEnvironment();
    const service = getSalesforceAuthService();
    if (!service || !service.hasAccess()) {
      throw new Error("Não autenticado");
    }
    const session = service.validateSession();
    if (!session.valid) {
      clearInvalidSalesforceSession();
      const loginUrl = startSalesforceLogin();
      throw new Error("Sessão inválida. Abra o login fresco." + (loginUrl ? " " + loginUrl : ""));
    }
    SpreadsheetApp.getUi().alert("Ambiente saudável: " + environment);
    return true;
  } catch (error) {
    SpreadsheetApp.getUi().alert("Falha no ambiente: " + error.message);
    return false;
  }
}
