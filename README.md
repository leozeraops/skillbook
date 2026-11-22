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

## Testes

```powershell
node --test
npm run check
```
