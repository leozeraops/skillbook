function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Salesforce Habilidades")
    .addItem("Verificar projeto", "checkProjectHealth")
    .addSeparator()
    .addItem("Sincronizar colaboradores", "syncColaboradores")
    .addItem("Sincronizar habilidades", "syncSkills")
    .addSeparator()
    .addItem("Visualizar publicação", "previewPublication")
    .addItem("Publicar seleção", "publishSelectedRows")
    .addSeparator()
    .addItem("Entrar no Salesforce", "startSalesforceLogin")
    .addItem("Sair do Salesforce", "logoutSalesforce")
    .addItem("Verificar ambiente", "checkSalesforceHealth")
    .addToUi();
}

function previewPublication() {
  const selection = SpreadsheetApp.getActiveSheet().getSelection();
  const ranges = selection ? selection.getActiveRangeList().getRanges() : [];
  if (ranges.length === 0) {
    SpreadsheetApp.getUi().alert("Selecione uma ou mais linhas da matriz.");
    return null;
  }

  const result = buildPublicationPreview(ranges);
  const message = [
    `Inserções: ${result.insertions.length}`,
    `Atualizações: ${result.updates.length}`,
    `Erros: ${result.errors.length}`,
  ].join("\n");
  SpreadsheetApp.getUi().alert(message);
  return result;
}

function publishSelectedRows() {
  const preview = previewPublication();
  if (!preview) {
    return null;
  }
  if (!preview.mappingValid) {
    SpreadsheetApp.getUi().alert("A publicação foi interrompida: mapeamento obrigatório ausente ou inválido.");
    return null;
  }

  const confirmed = SpreadsheetApp.getUi().alert(
    "Confirmar publicação",
    `Deseja publicar ${preview.insertions.length + preview.updates.length} linha(s)?`,
    SpreadsheetApp.getUi().ButtonSet.YES_NO,
  );
  if (confirmed !== SpreadsheetApp.getUi().Button.YES) {
    return null;
  }

  const response = postPublication(preview);
  writePublicationAudit(preview, response);
  SpreadsheetApp.getUi().alert(formatPublicationResult(response));
  return response;
}
