# Skillbook

Middleware em Google Apps Script e Google Sheets para consultar e publicar, de forma manual e auditável, habilidades de colaboradores no Salesforce Field Service.

## O que está implementado

- Autenticação Salesforce individual por operador; Produção é o padrão e Sandbox pode ser selecionado explicitamente.
- Carga paginada de colaboradores e da Matriz de Habilidades a partir dos campos definidos em `__Config_Mapping`.
- Filtros nativos da planilha e realce visual de habilidades vencidas ou próximas do vencimento.
- Prévia das linhas selecionadas, com inserções, atualizações e erros de validação antes de qualquer escrita.
- Publicação confirmada pelo operador pelo endpoint Apex REST `SkillPublication`; suporta inserções e atualizações parciais, nunca exclusões.
- Feedback por linha e auditoria na aba `Publicacoes`, incluindo usuário, data/hora, ambiente, contagens e resumo reduzido.
- Fluxo local com Clasp, verificação sintática, testes Node.js e instruções para implantações `@HEAD` e pinadas.

Os tickets de implementação do projeto são [#2–#8](https://github.com/leozeraops/skillbook/issues). O ticket [#9](https://github.com/leozeraops/skillbook/issues/9) também requer uma demonstração operacional em organizações Salesforce reais. O código e o checklist estão no repositório, mas a execução com credenciais em Produção e Sandbox não foi realizada por este projeto local; não considere essa evidência operacional concluída apenas porque os testes locais passaram.

## Como funciona

1. A pessoa operadora escolhe Produção ou Sandbox e autentica-se no Salesforce.
2. No menu **Salesforce Habilidades**, sincroniza os colaboradores e a Matriz de Habilidades.
3. Usa os filtros da planilha para localizar a unidade e seleciona as linhas que deseja publicar.
4. Visualiza a prévia; datas, nível, identidade, duplicatas e conflitos de vigência são validados antes da confirmação.
5. Confirma a publicação. O Salesforce processa as linhas válidas e retorna sucesso ou erro individualmente para cada linha.
6. O middleware apresenta o resultado e registra a publicação em `Publicacoes`.

A planilha é a fonte dos valores para as linhas selecionadas. Registros existentes são identificados pelo `Id` do Salesforce; inserções usam colaborador, habilidade e data de início. `EffectiveStartDate` é obrigatório, `EffectiveEndDate` é opcional e `SkillLevel` precisa ser um decimal positivo. Exclusões, publicação automática e agendamento não fazem parte do MVP.

## Pré-requisitos

- Node.js para executar os testes e a verificação local.
- Acesso ao projeto Google Apps Script e ao Google Sheets usado como matriz.
- Clasp autenticado para a conta que administra o projeto Apps Script.
- Um Connected App OAuth do Salesforce configurado para o callback usado pelo web app.
- Acesso do usuário Salesforce aos objetos e campos do Field Service usados na matriz e no endpoint.
- A classe Apex `SkillPublication` implantada na organização Salesforce antes de publicar alterações.

O manifest usa Apps Script V8, fuso `America/Sao_Paulo` e execução como a pessoa que acessa o web app. A implantação do Apps Script e a implantação da classe Apex são etapas distintas.

## Configuração inicial

1. Instale e autentique o Clasp:

   ```powershell
   npm install -g @google/clasp
   clasp login
   ```

2. Copie `.clasp.json.example` para `.clasp.json` e substitua `SEU_SCRIPT_ID` pelo ID do projeto Apps Script. O arquivo local de configuração e as credenciais do Clasp não devem ser commitados.
3. Configure estas Script Properties no projeto Apps Script:
   - `SALESFORCE_CLIENT_ID`
   - `SALESFORCE_CLIENT_SECRET`
   - `SALESFORCE_CALLBACK_URL`
4. Implante o projeto como web app conforme a política da organização Google e cadastre a URL de callback correspondente no Connected App Salesforce.
5. Na planilha, crie e preencha `__Config_Mapping`. Cada linha mapeia uma coluna da planilha a um objeto/campo Salesforce, com estas colunas:

   | Coluna | Conteúdo |
   | --- | --- |
   | A | Cabeçalho da coluna na planilha |
   | B | Objeto Salesforce |
   | C | API name do campo (pode referenciar campos relacionados, como `Skill.MasterLabel`) |
   | D | Tipo/documentação do campo |
   | E | Chave primária (`SIM` quando aplicável) |
   | F | Campo atualizável (`SIM` quando aplicável) |

   O mapeamento de `ServiceResourceSkill` precisa incluir `Id`, `ServiceResourceId`, `SkillId`, `SkillLevel` e `EffectiveStartDate`. Inclua também `EffectiveEndDate` e os campos de exibição necessários à operação. O mapeamento define os cabeçalhos usados nas abas `Colaboradores` e `Matriz de Habilidades`.
6. Antes de autenticar, escolha **Usar Salesforce Produção** ou **Usar Salesforce Sandbox** no menu. Produção é o padrão. A troca de ambiente limpa os tokens da pessoa usuária atual, que precisará autenticar novamente.

As credenciais OAuth ficam nas Script Properties; tokens de acesso, refresh e URL da instância ficam nas propriedades da pessoa usuária. O middleware valida a sessão por uma chamada real ao Salesforce, tenta refresh quando aplicável e limpa apenas a sessão do usuário atual quando ela é inválida. Logout revoga o token e limpa os dados de sessão desse usuário.

## Operação na planilha

O menu **Salesforce Habilidades** oferece:

- **Verificar projeto**: confere as informações básicas do projeto Apps Script.
- **Sincronizar colaboradores** e **Sincronizar habilidades**: carrega os dados Salesforce mapeados; consultas percorrem as páginas disponíveis da API.
- **Visualizar publicação**: mostra a prévia das linhas selecionadas, sem escrever no Salesforce.
- **Publicar seleção**: exige confirmação explícita, publica inserções e atualizações e apresenta o resultado por linha.
- **Entrar no Salesforce**, **Usar Salesforce Produção/Sandbox**, **Sair do Salesforce** e **Verificar ambiente**: gerenciam a sessão individual e verificam sua disponibilidade.

As abas de dados mantêm cabeçalhos e colunas não mapeadas durante a atualização; filtros nativos são criados quando necessário. A coluna de fim de vigência pode destacar itens vencidos e itens que vencem nos próximos 30 dias. A aba `Publicacoes` é criada na primeira publicação e recebe as contagens e o resumo reduzido do lote.

## Desenvolvimento e testes

Verifique a sintaxe e execute todos os testes Node.js:

```powershell
npm run check
npm test
```

O comando combinado usado antes de uma entrega é:

```powershell
npm run verify:release
```

Os testes locais exercitam autenticação e seleção de ambiente, regras de carga/mapeamento, normalização e validação da publicação, respostas parciais, auditoria, manifest e documentação de release. Os testes Apex em `src/salesforce/SkillPublicationTest.cls` precisam ser executados em uma organização Salesforce com a configuração necessária; eles não são executados pelo `node --test`.

## Push e implantações do Apps Script

Execute os testes antes de enviar o projeto local ao Apps Script:

```powershell
npm run verify:release
clasp push
```

`clasp push` atualiza o código associado a `@HEAD`; não cria uma versão nem cria ou reaponta uma implantação fixa. Para trazer alterações remotas ao diretório local:

```powershell
clasp pull
npm run verify:release
```

Para criar uma versão e uma nova implantação pinada:

```powershell
clasp version "Descrição da versão"
clasp deployments
clasp deploy --versionNumber <numero-da-versao> --description "Skillbook"
clasp deployments
```

Para reapontar uma implantação pinada existente para uma nova versão:

```powershell
clasp version "Descrição da versão"
clasp deploy --deploymentId <id-da-implantacao> --versionNumber <numero-da-versao> --description "Skillbook"
clasp deployments
```

Confira o ID e a versão com `clasp deployments` e valide a implantação efetivamente usada pelo web app. Um push para `@HEAD` não atualiza automaticamente uma implantação pinada. A classe Apex deve ser implantada separadamente no Salesforce pelo fluxo de release da organização.

## Cenário ponta a ponta: validação operacional de release

Antes de declarar concluída a validação ponta a ponta de uma entrega, uma pessoa com acesso aos orgs deve:

1. Em Produção, autenticar, filtrar a matriz para uma unidade, carregar os dados, selecionar uma linha válida e confirmar uma inserção ou atualização.
2. Confirmar no Salesforce a alteração e conferir a linha correspondente em `Publicacoes`, incluindo usuário, horário, ambiente, totais e resumo reduzido.
3. Demonstrar um resultado parcial com ao menos uma linha aceita e uma rejeitada, confirmando o resultado individual e a auditoria.
4. Selecionar explicitamente Sandbox, autenticar novamente e repetir a validação de carga e publicação no ambiente de testes.
5. Registrar separadamente qual implantação pinada foi validada; não inferir que uma implantação fixa contém o código mais recente apenas porque houve `clasp push`.

Essa validação depende das organizações, permissões, dados e credenciais Salesforce e não é substituída pelos testes locais.
