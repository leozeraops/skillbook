# Documento de Arquitetura & Roadmap de Execução
## Middleware de Gestão de Habilidades de Colaboradores (Salesforce <-> Google Sheets via Apps Script)

---

## 1. Visão Geral & Contexto do Projeto

Para garantir que o **algoritmo de otimização de agendamento do Salesforce (Field Service / FSL)** respeite a disponibilidade e as habilidades variáveis dos colaboradores por turno, a equipe operacional precisa manipular dezenas a centenas de registros de habilidades (`ServiceResourceSkill`) diariamente.

A interface padrão do Salesforce exige edições individuais ou navegação por registros, tornando inviável o ajuste rápido em lote (*bulk*) para múltiplos colaboradores. 

### Solução Proposta
Uma aplicação middleware desenvolvida no **Google Apps Script** (gerenciada localmente via **`clasp`**), conectada ao **Salesforce REST API** utilizando um **Connected App** com OAuth 2.0. A aplicação utilizará uma **Planilha Estática do Google Sheets** composta por:
1. **Aba de Mapeamento Dinâmico:** Dicionário legível pelo script para traduzir colunas do Sheets em campos API do Salesforce.
2. **Aba de Colaboradores (`ServiceResource`):** Carga completa de técnicos da org com filtros visuais e agrupamentos (Supervisão/Departamento).
3. **Aba de Matriz/Manipulação de Habilidades (`ServiceResourceSkill`):** Interface otimizada para inserção, atualização e remoção rápida de habilidades com datas de vigência e níveis.

---

## 2. Matriz de Decisões de Design Reconstruída

| Dimensão Técnica | Decisão Final | Justificativa Arquitetural |
| :--- | :--- | :--- |
| **Ambiente de Execução** | Google Apps Script (GAS) | Permite execução nativa dentro do Google Sheets sem infraestrutura de servidor externa (Serverless). |
| **Desenvolvimento Local** | `@google/clasp` + VS Code / IDE | Garante versionamento em Git, modularidade em TypeScript/JS e ciclo de feedback rápido local. |
| **Ciclo de Atualização** | Planilha Estática (ID Fixo) | Preserva a estrutura de abas, formatações visuais, validações de dados e fórmulas personalizadas. O script apenas limpa e re-popula as células de dados. |
| **Autenticação Google** | OAuth 2.0 Usuário Padrão | Escopo de execução atrelado à conta do operador com prompt de consentimento do Apps Script. |
| **Autenticação Salesforce** | Connected App (Client ID / Secret + Refresh Token) | Conexão REST segura, renovável sem intervenção do usuário final e sem expor credenciais puras de login. |
| **Carga de Dados** | SOQL via Salesforce REST API | Extração dos registros de `ServiceResource` e `ServiceResourceSkill` em requisições otimizadas. |
| **Escrita de Dados (Bulk)** | Custom Apex REST Endpoint / Composite API | Processamento transacional de múltiplos registros em um único `POST`, evitando limites de API (`API Request Limits`). |
| **Mapeamento de Campos** | Aba de Configuração Dinâmica | Permite alterar a relação de campos/colunas sem necessidade de alterar o código-fonte do Apps Script. |

---

## 3. Mapeamento de Campos Extraído dos Prints (Dicionário de Dados)

### 3.1. Objeto `ServiceResource` (Colaborador)
Baseado no layout capturado no Salesforce (`image_b66425.png`):

| Campo no Salesforce (API Name) | Nome de Exibição (Label) | Tipo de Dado | Função no Middleware |
| :--- | :--- | :--- | :--- |
| `Id` | ID do Recurso | ID (18 char) | Chave primária para vinculação |
| `Name` | Nome | String | Identificação visual do colaborador |
| `RelatedRecordId` | Usuário | Lookup (User) | Vínculo com o usuário do Salesforce |
| `ResourceType` | Tipo de recurso | Picklist | Filtro (ex: Técnico) |
| `IsCapacityBased` | Baseado em capacidade | Boolean | Configuração de capacidade |
| `LocationId` | Local | Lookup (Location) | Base operacional do técnico |
| `Description` | Descrição | String/Text Area | Anotações adicionais |
| `SchedulingConstraintId` | ID da restrição do agendamento | Lookup | Regra de agendamento FSL |
| `ID_Prestador_Friday__c` | ID Lavador (Friday) | String (Custom) | Integração de sistemasLegados |
| `Departamento__c` | Departamento | Picklist / String | Agrupamento/Filtro visual |
| `Supervis_o__c` | Supervisão | Picklist / String | Agrupamento/Filtro visual |
| `Coordena_o__c` | Coordenação | Picklist / String | Agrupamento/Filtro visual |
| `Admiss_o__c` | Admissão | Date | Controle temporal de contrato |
| `Desligamento__c` | Desligamento | Date | Controle temporal de contrato |
| `Matricula_Turbi__c` | Matricula Turbi | String (Custom) | Identificador interno |
| `ID_Usu_rio_Friday__c` | ID Usuário (Friday) | String (Custom) | Integração de sistemas |
| `IsActive` | Ativo | Boolean | Filtro de colaboradores ativos |
| `IsOptimizationCapable` | Incluído em otimização de agendamento | Boolean | **Crítico:** Indica se entra no algoritmo de otimização |
| `FSL__GanttLabel__c` | Rótulo de Gantt | String (Custom) | Visualização na tela do Dispatcher |
| `HourlyValue__c` | Valor da hora | Currency | Custo por hora do colaborador |
| `CreatedById` | Criado por | Lookup (User) | Auditoria de sistema |
| `LastModifiedById` | Modificado pela última vez por | Lookup (User) | Auditoria de sistema |
| `OwnerId` | Proprietário | Lookup (User/Queue) | Proprietário do registro |

---

### 3.2. Objeto `ServiceResourceSkill` (Habilidade do Recurso)
Baseado no layout capturado no Salesforce (`image_b5f2a9.png` e `image_b663c4.png`):

| Campo no Salesforce (API Name) | Nome de Exibição (Label) | Tipo de Dado | Função no Middleware |
| :--- | :--- | :--- | :--- |
| `Id` | ID da Habilidade do Recurso | ID (18 char) | Chave primária para Update/Delete |
| `SkillNumber` | Número da habilidade do recurso | Auto-Number | Identificador amigável (ex: SRS-58) |
| `ServiceResourceId` | Recurso de serviço | Lookup (ServiceResource) | Chave estrangeira para o Colaborador |
| `SkillId` | Habilidade | Lookup (Skill) | ID da Habilidade cadastrada (ex: Rastreadores, Patio desmobilização) |
| `SkillLevel` | Nível de habilidade | Double (Decimal) | Nível técnico da habilidade (ex: 1.0, 5.0) |
| `EffectiveStartDate` | Data de início | Datetime | **Crítico:** Início da vigência da habilidade no otimizador |
| `EffectiveEndDate` | Data de término | Datetime | **Crítico:** Fim da vigência da habilidade no otimizador |
| `CreatedById` | Criado por | Lookup (User) | Auditoria de sistema |
| `LastModifiedById` | Modificado pela última vez por | Lookup (User) | Auditoria de sistema |

---

## 4. Arquitetura da Aba de Mapeamento Dinâmico (Configuração)

Para garantir flexibilidade, a planilha conterá uma aba chamada `__Config_Mapping`. O script lerá essa aba dinamicamente antes de executar qualquer sincronização.

### Estrutura da Tabela de Mapeamento no Sheets

| Coluna no Sheets | Objeto Salesforce | Campo Salesforce (API Name) | Tipo de Dados | Chave Primária? | Atualizável? |
| :--- | :--- | :--- | :--- | :---: | :---: |
| ID Colaborador | `ServiceResource` | `Id` | String | SIM | NÃO |
| Colaborador | `ServiceResource` | `Name` | String | NÃO | NÃO |
| Ativo | `ServiceResource` | `IsActive` | Boolean | NÃO | SIM |
| Inserido na Otimização | `ServiceResource` | `IsOptimizationCapable` | Boolean | NÃO | SIM |
| Departamento | `ServiceResource` | `Departamento__c` | String | NÃO | SIM |
| Supervisão | `ServiceResource` | `Supervis_o__c` | String | NÃO | SIM |
| ID Habilidade Recurso | `ServiceResourceSkill` | `Id` | String | SIM | NÃO |
| ID Habilidade | `ServiceResourceSkill` | `SkillId` | String | NÃO | SIM |
| Habilidade | `Skill` | `MasterLabel` | String | NÃO | NÃO |
| Nível Habilidade | `ServiceResourceSkill` | `SkillLevel` | Number | NÃO | SIM |
| Data Início | `ServiceResourceSkill` | `EffectiveStartDate` | ISO Datetime | NÃO | SIM |
| Data Término | `ServiceResourceSkill` | `EffectiveEndDate` | ISO Datetime | NÃO | SIM |

---

## 5. Roadmap de Execução Vertical (Módulo a Módulo)

O desenvolvimento será realizado iterativamente via `clasp`, permitindo testar cada camada funcional antes de avançar para a próxima.

```
+-----------------------------------------------------------------------+
|                       ROADMAP DE EXECUÇÃO VERTICAL                    |
+-----------------------------------------------------------------------+
| Módulo 1: Setup Local (`clasp` + VS Code + Configuração Inicial)       |
|    └─ Feedback Loop: Push local -> Execução de helloWorld no GAS       |
+-----------------------------------------------------------------------+
| Módulo 2: Autenticação OAuth2 / Connected App Salesforce              |
|    └─ Feedback Loop: Obtenção e renovação de Access Token com sucesso |
+-----------------------------------------------------------------------+
| Módulo 3: Motor de Consulta & População da Aba `Colaboradores`        |
|    └─ Feedback Loop: SOQL query -> População de dados sem apagar estilo|
+-----------------------------------------------------------------------+
| Módulo 4: Leitor da Aba de Mapeamento Dinâmico                        |
|    └─ Feedback Loop: Parser JSON da estrutura de colunas              |
+-----------------------------------------------------------------------+
| Módulo 5: Endpoint Apex REST + Carga em Massa de Habilidades          |
|    └─ Feedback Loop: POST de teste altera registros no Salesforce     |
+-----------------------------------------------------------------------+
| Módulo 6: UI, Filtros Visuais & Otimização da Operação                 |
|    └─ Feedback Loop: Menu customizado no Sheets operável pelo time    |
+-----------------------------------------------------------------------+
```

---

### Módulo 1: Setup Local (`clasp` + VS Code)
**Objetivo:** Configurar o ambiente local de desenvolvimento com sincronização bidirecional entre o VS Code e o Google Apps Script.

#### Passos de Execução:
1. Instalar o `clasp` globalmente:
   ```bash
   npm install -g @google/clasp
   ```
2. Realizar login na conta Google via CLI:
   ```bash
   clasp login
   ```
3. Inicializar a pasta do projeto local vinculada à planilha estática:
   ```bash
   clasp clone <SCRIPT_ID_DO_APPS_SCRIPT>
   ```
4. Estruturar diretórios locais:
   ```
   ├── .clasp.json
   ├── appsscript.json
   └── src/
       ├── main.js
       ├── auth.js
       ├── sfService.js
       ├── sheetService.js
       └── config.js
   ```

**Feedback Loop 1:** Criar uma função `testConnection()` em `main.js`, rodar `clasp push` e validar a gravação de um log no painel do Apps Script.

---

### Módulo 2: Autenticação Salesforce via Connected App
**Objetivo:** Estabelecer canal seguro de comunicação entre Google Apps Script e Salesforce via OAuth 2.0 Web Server Flow / Refresh Token.

#### Passos de Execução:
1. **Configuração no Salesforce:**
   - Criar um *Connected App* no Salesforce.
   - Habilitar configurações OAuth (`api`, `refresh_token`, `offline_access`).
   - Definir URL de Callback do Apps Script: `https://script.google.com/macros/d/{SCRIPT_ID}/usercallback`.
   - Obter `Consumer Key` (Client ID) e `Consumer Secret` (Client Secret).
2. **Implementação da biblioteca OAuth2 no Apps Script:**
   - Incluir a biblioteca `OAuth2` para GAS (`1B7FSrk5Zi6L1rSxxTDgDEUsPzDguSmVGEUiDxsnSfM-Structure`).
3. **Escrita do serviço de autenticação (`auth.js`):**
   ```javascript
   function getSalesforceService() {
     return OAuth2.createService('Salesforce')
       .setAuthorizationBaseUrl(PROD_INSTANCE_URL + '/services/oauth2/authorize')
       .setTokenUrl(PROD_INSTANCE_URL + '/services/oauth2/token')
       .setClientId(CLIENT_ID)
       .setClientSecret(CLIENT_SECRET)
       .setCallbackFunction('authCallback')
       .setPropertyStore(PropertiesService.getUserProperties())
       .setScope('api refresh_token');
   }
   ```

**Feedback Loop 2:** Executar a função de autenticação no Apps Script, aprovar a tela de consentimento e verificar a emissão do `Access Token` válido.

---

### Módulo 3: Motor de Consulta & População da Aba `Colaboradores`
**Objetivo:** Extrair todos os registros de `ServiceResource` do Salesforce e popular a aba correspondente no Google Sheets preservando estilos e fórmulas.

#### Passos de Execução:
1. **Construção da Consulta SOQL (`sfService.js`):**
   ```sql
   SELECT Id, Name, IsActive, IsOptimizationCapable, Departamento__c, 
          Supervis_o__c, Coordena_o__c, LocationId, ResourceType, 
          ID_Prestador_Friday__c, Matricula_Turbi__c
   FROM ServiceResource
   ORDER BY Supervis_o__c, Departamento__c, Name
   ```
2. **Manipulação do Google Sheets (`sheetService.js`):**
   - Abrir a aba `Colaboradores` da planilha estática pelo nome.
   - Determinar a última linha/coluna preenchida com dados.
   - Limpar apenas o intervalo de dados (`range.clearContent()`), mantendo os cabeçalhos, formatações e colunas calculadas.
   - Escrever a matriz de dados extraída em uma única chamada `setValues()`.

**Feedback Loop 3:** Rodar a função `syncColaboradores()`, validar se todas as linhas foram inseridas corretamente e garantir que estilos/fórmulas em abas adjacentes não foram corrompidos.

---

### Módulo 4: Leitor & Parser da Aba de Mapeamento Dinâmico
**Objetivo:** Criar um módulo capaz de traduzir a estrutura das abas da planilha baseado na aba `__Config_Mapping`.

#### Passos de Execução:
1. Criar a estrutura na aba `__Config_Mapping` na planilha estática conforme a tabela da Seção 4.
2. Criar função em `config.js` para ler a aba e retornar um objeto JSON de mapeamento em memória:
   ```javascript
   function getFieldMapping() {
     const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('__Config_Mapping');
     const data = sheet.getDataRange().getValues();
     // Converte as linhas em um dicionário: { NomeColunaSheets: { object: 'ServiceResource', apiName: 'Name' } }
   }
   ```

**Feedback Loop 4:** Alterar o nome de uma coluna no mapping do Sheets e verificar se a função em Apps Script reflete o novo mapeamento dinamicamente via `Logger.log()`.

---

### Módulo 5: Endpoint Apex REST + Carga em Massa de Habilidades (`ServiceResourceSkill`)
**Objetivo:** Criar um endpoint em Apex para receber o payload em lote do Sheets e efetuar inserções, atualizações e exclusões de habilidades (`ServiceResourceSkill`) em uma única transação.

#### Passos de Execução:
1. **Desenvolvimento da Classe Apex REST na org:**
   - Criar classe `@RestResource(urlMapping='/ServiceResourceSkillManager/*')`.
   - Implementar método `@HttpPost` para ler o lote JSON e rodar DML em massa (`insert`, `update`, `delete`).
2. **Execução de Testes Apex via Salesforce CLI:**
   ```bash
   sf apex run --file scripts/test_skill_payload.apex --target-org my-org-alias
   ```
3. **Integração no Apps Script:**
   - Ler os dados modificados pelo usuário no Sheets.
   - Montar o JSON estruturado e enviar via `UrlFetchApp.fetch()`.

**Feedback Loop 5:** Modificar datas e níveis de habilidades diretamente no Sheets, clicar no botão de sincronização e verificar a atualização imediata no Salesforce na lista relacionada do colaborador (conforme imagem `image_b5f2a9.png`).

---

### Módulo 6: UI, Filtros Visuais & Otimização Operacional
**Objetivo:** Entregar a interface final amigável para a equipe de planejamento e otimização de turnos.

#### Passos de Execução:
1. **Menu Customizado no Sheets (`main.js`):**
   ```javascript
   function onOpen() {
     const ui = SpreadsheetApp.getUi();
     ui.createMenu('🚀 Salesforce Middleware')
       .addItem('Sincronizar Colaboradores (Buscar SF)', 'syncColaboradores')
       .addItem('Sincronizar Habilidades (Buscar SF)', 'syncSkills')
       .addSeparator()
       .addItem('Publicar Alterações no Salesforce', 'pushChangesToSalesforce')
       .addToUi();
   }
   ```
2. **Filtros e Agrupamentos Visuais:**
   - Aplicar Filtros Nativos do Google Sheets por Supervisão (`Supervis_o__c`) e Departamento (`Departamento__c`).
   - Adicionar Formatação Condicional para destacar habilidades vencidas ou próximas do vencimento (`EffectiveEndDate`).

**Feedback Loop 6:** Simulação de uso ponta a ponta pela equipe operacional: consulta de um turno completo, alteração das habilidades em massa de 50 técnicos e publicação no Salesforce em menos de 10 segundos.

---

## 6. Próximos Passos Finais para Início do Desenvolvimento

1. Configurar o **Connected App** no ambiente Salesforce Dev/Sandbox.
2. Criar a planilha estática no Google Sheets e definir a aba `__Config_Mapping`.
3. Executar o Módulo 1 (Setup do `clasp` localmente no ambiente do desenvolvedor).