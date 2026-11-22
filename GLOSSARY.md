# Gestao de Habilidades

Este contexto define a linguagem usada para administrar habilidades dos colaboradores de servico no Salesforce por meio da planilha operacional.

## Language

**Colaborador**:
Um `ServiceResource` que pode ser associado a habilidades e utilizado no agendamento de servicos.
_Avoid_: tecnico, recurso de servico, usuario

**Matriz de Habilidades**:
A colecao de habilidades associadas aos colaboradores, representada por registros `ServiceResourceSkill` e editada na planilha.
_Avoid_: matriz de colaboradores, tabela de recursos

**Habilidade**:
Uma capacidade cadastrada no Salesforce que pode ser atribuida a um colaborador por meio de uma vigencia e um nivel.
_Avoid_: servico, especialidade

**Vigencia**:
Periodo entre `EffectiveStartDate` e `EffectiveEndDate` durante o qual uma habilidade esta atribuida ao colaborador.
_Avoid_: periodo de validade, intervalo

**Publicacao**:
Um lote confirmado pelo usuario que envia insercoes e atualizacoes da planilha ao Salesforce.
_Avoid_: sincronizacao, carga, envio

**Lote**:
O conjunto de linhas selecionadas pelo operador para uma mesma publicacao.
_Avoid_: carga completa, transacao

**Conflito de Vigencia**:
Duas ou mais habilidades iguais atribuidas ao mesmo colaborador com periodos parcialmente sobrepostos.
_Avoid_: conflito de habilidade, duplicidade temporal
