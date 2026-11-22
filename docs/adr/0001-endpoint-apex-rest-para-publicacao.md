# Endpoint Apex REST para publicacao em lote

O middleware usara um endpoint Apex REST proprio para publicar insercoes e atualizacoes de `ServiceResourceSkill`. Essa escolha permite validar dados, aplicar regras de vigencia e processar resultados por registro em uma transacao controlada, em vez de depender apenas da escrita direta pela Composite API.
