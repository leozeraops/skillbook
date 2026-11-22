function getProjectHealthStatus() {
  return {
    healthy: true,
    runtimeVersion: "V8",
    timeZone: "America/Sao_Paulo",
  };
}

function checkProjectHealth() {
  const status = getProjectHealthStatus();
  if (!status.healthy) {
    SpreadsheetApp.getUi().alert("Falha no ambiente do projeto.");
    return false;
  }
  SpreadsheetApp.getUi().alert(
    "Projeto saudável: runtime " + status.runtimeVersion + ", timezone " + status.timeZone,
  );
  return true;
}
