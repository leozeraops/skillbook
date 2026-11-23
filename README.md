# Skillbook

Middleware entre Salesforce e Google Sheets para publicar habilidades de colaboradores em lote.

## Desenvolvimento local

1. Instale o Clasp e autentique:
   ```powershell
   npm install -g @google/clasp
   clasp login
   ```
2. Copie `.clasp.json.example` para `.clasp.json` e substitua `SEU_SCRIPT_ID` pelo ID do projeto Apps Script. `.clasp.json` e credenciais locais ficam fora do Git.
3. Configure `SALESFORCE_CLIENT_ID` e `SALESFORCE_CALLBACK_URL` em Script Properties.
4. Configure também `SALESFORCE_CLIENT_SECRET` em Script Properties.
5. Produção é o ambiente padrão. Antes de entrar no Salesforce, use “Usar Salesforce Sandbox” no menu para selecionar explicitamente o ambiente de testes.

Os tokens de acesso e refresh ficam nas Properties do usuário autenticado, nunca em Script Properties. A sessão só é aceita após um ping real ao Salesforce. Sessões expiradas são removidas para o usuário atual e um novo link OAuth é exibido.

### Push e implantação

Execute a verificação sintática antes de enviar o código:

```powershell
npm run check
clasp push
```

`clasp push` envia o código atual para o projeto associado como `@HEAD`; ele não cria nem altera por si só uma implantação fixa.

Para trazer alterações feitas no editor ou no ambiente remoto para o projeto local:

```powershell
clasp pull
npm run check
```

Crie uma versão explícita e implante essa versão pinada:

```powershell
clasp version "Versão do ticket"
clasp deployments
clasp deploy --versionNumber <numero-da-versao> --description "Skillbook"
clasp deployments
```

Use o ID da implantação fixa exibido por `clasp deployments` para executar ou validar o web app. Uma alteração feita por `clasp push` só aparecerá em uma implantação fixa depois que uma nova versão for criada e implantada.

## Cenário ponta a ponta

Executar esta verificação antes de fechar uma entrega:

1. Em Produção, selecione uma unidade e execute `Sincronizar colaboradores` e `Sincronizar habilidades`.
2. Confirme explicitamente o ambiente usado e execute `Verificar ambiente`.
3. Edite ou selecione pelo menos uma linha válida, visualize a publicação e confirme o envio.
4. Verifique no Salesforce que uma inserção ou atualização foi aplicada e confira o registro correspondente em `Publicacoes`.
5. Repita uma publicação com uma linha válida e uma linha rejeitada para demonstrar o resultado parcial.
6. Execute a seleção explícita `Usar Salesforce Sandbox`, autentique novamente e repita a verificação de carregamento e publicação no ambiente de testes.
7. Confirme que a aba `Publicacoes` registra usuário, timestamp, ambiente, contagens e o resumo reduzido.

`clasp push` atualiza o código em `@HEAD`; não cria nem altera uma implantação fixa. Use `clasp version` e `clasp deploy --versionNumber <numero-da-versao>` para criar e apontar uma versão pinada. Valide sempre o ID da implantação mostrada por `clasp deployments`, não um endereço antigo da versão anterior.

## Testes

```powershell
node --test
npm run check
npm run verify:release
```
