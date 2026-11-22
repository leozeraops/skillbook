export function getSalesforceEnvironment(properties = {}) {
  const environment = properties.SALESFORCE_ENVIRONMENT;
  return environment === "sandbox" ? "sandbox" : "production";
}

export function buildSalesforceAuthorizationUrl({
  environment,
  clientId,
  callbackUrl,
  codeChallenge,
}) {
  const authorizationBaseUrl = environment === "sandbox"
    ? "https://test.salesforce.com/services/oauth2/authorize"
    : "https://login.salesforce.com/services/oauth2/authorize";
  return authorizationBaseUrl
    + "?response_type=code"
    + "&client_id=" + encodeURIComponent(clientId)
    + "&redirect_uri=" + encodeURIComponent(callbackUrl)
    + "&scope=" + encodeURIComponent("api refresh_token")
    + "&code_challenge=" + encodeURIComponent(codeChallenge)
    + "&code_challenge_method=S256";
}

export function getSalesforceSessionDecision({ pingStatus, refreshStatus = null }) {
  if (pingStatus >= 200 && pingStatus < 300) {
    return { valid: true, reason: "valid" };
  }
  if (pingStatus === 401 && refreshStatus === null) {
    return { valid: false, reason: "refresh-failed" };
  }
  if (pingStatus === 401 && refreshStatus >= 200 && refreshStatus < 300) {
    return { valid: true, reason: "valid" };
  }
  return { valid: false, reason: "ping-rejected" };
}

export function getSalesforceLogoutPlan({ instanceUrl, accessToken }) {
  return {
    revokeUrl: instanceUrl && accessToken
      ? `${instanceUrl}/services/oauth2/revoke`
      : null,
    propertyNames: [
      "SALESFORCE_ACCESS_TOKEN",
      "SALESFORCE_REFRESH_TOKEN",
      "SALESFORCE_INSTANCE_URL",
      "SALESFORCE_PKCE_VERIFIER",
    ],
    cacheKeys: [
      "SALESFORCE_SESSION_VALID",
      "SALESFORCE_SYNC_LOCK",
    ],
  };
}

export function formatSalesforceAdapterFailure(error) {
  const message = error && error.message ? error.message : "Falha desconhecida";
  return {
    success: false,
    message: `Falha no Salesforce: ${message}`,
  };
}
