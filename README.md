# Skillbook

Middleware entre Salesforce e Google Sheets para publicar habilidades de colaboradores em lote.

## Desenvolvimento local

1. Configure `scriptId` em `.clasp.json`.
2. Configure `SALESFORCE_CLIENT_ID` e `SALESFORCE_CALLBACK_URL` em Script Properties.
3. Instale o Clasp e autentique: `npm install -g @google/clasp && clasp login`.
4. Envie a versão: `clasp push`.
5. Um push com `clasp push` atualiza o script associado ao projeto (`@HEAD`). O código publicado como web app continua associado ao deployment escolhido até uma nova implantação/pinada ser criada.

## Testes

```powershell
node --test
node --check src/publication/normalizePublication.js
```
