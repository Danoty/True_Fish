# True Fish Assistant

## Available immediately

The Assistant workspace provides record analysis in both the static and shared-server editions. Ask questions or select a suggested prompt:

- “Summarise my business”
- “Explain my profit”
- “What needs attention?”
- “How much fuel is left?”
- “Show the 30-day cash scenario”

Built-in answers are rule-based explanations of calculated figures. They are labelled **Record analysis**, not presented as a generative AI model. The analysis is read-only and uses active records dated through today in Africa/Nairobi. Month-to-date means the first day of the current month through today, independently of other page filters.

Checks cover overdue invoices/bills, negative cash accounts, missing opening fuel costs, fuel cover below seven days, due maintenance, unmatched statement lines, loss-making boat days and a financial statement imbalance. These are limited checks of entered records, not an audit or proof that transactions are complete.

Fuel cover uses total physical issues in the last 30 calendar days divided by 30. A quiet or incomplete period can distort the estimate. No issues means no cover estimate.

The 30-day cash scenario is current recorded cash + unpaid invoices due through the horizon − unpaid bills due through the horizon − accrued unpaid crew wages. It includes overdue documents, assumes every included document settles in full, and excludes new trading, fuel receivables, loans and unrecorded costs. It is not a prediction.

## Optional local generative AI

This requires the **Node.js shared-server edition**; GitHub Pages cannot run a model or the server endpoint.

1. Set up the shared server following SERVER.md.
2. Install Ollama from its official website on the computer running that server. Download a model suitable for that computer through Ollama. Model storage, memory requirements and download size vary; follow the model's licence.
3. In the server's private `.env.local`, add `AI_MODEL=` followed by the exact installed model name. Add `AI_PORT=11434` if you use the normal Ollama port.
4. Start Ollama and restart the True Fish server.
5. Open Assistant and choose **Local AI** in Answer mode. Ask a question.

True Fish connects only to `127.0.0.1` on the application server. There is no browser-configurable AI host, cloud AI key, external AI provider or Cloudflare dependency. Choose a locally downloaded model; a remote/cloud-only Ollama model is outside this intended local setup. Keep the Ollama service listening locally.

For each question, the server calculates a fresh business summary. It sends the question, aggregate figures and fixed check descriptions to the local model. It excludes raw transaction rows, source IDs, customer/supplier/crew names, contact details and notes. Do not include private personal information in your question unless you intend the configured local model to process it.

The application does not save chat history in the ledger or browser storage. Chat remains in page memory until reload, and the last ten exchanges are shown. The local model's own logs/settings are separate. Each question is answered independently from the latest summary; previous chat is not sent as context.

The endpoint requires a signed-in staff account, honours the same-origin request check, limits question and response sizes, permits at most two concurrent generations and one per user, and times out after 90 seconds. AI runs separately from the ledger write queue. It has no tools to post entries, approve periods, pay bills or modify accounts.

If no model is configured, the model is missing or Ollama is unavailable, the app explains the problem. Switch back to built-in analysis for an immediate answer. A model is not bundled or silently installed. AI integration was tested with controlled responses; actual generation requires your installed model.

## Interface references

This is an independent True Fish interface inspired by financial dashboard and role-centred workspace patterns. It does not integrate with or claim affiliation with QuickBooks, Intuit or Microsoft Dynamics 365 Business Central.

Official references:

- [QuickBooks dashboards](https://quickbooks.intuit.com/learn-support/en-us/help-article/business-reports/create-dashboards-view-key-business-insights/L7C4Ftrzx_US_en_US)
- [Business Central Role Centers](https://learn.microsoft.com/en-au/dynamics365/business-central/dev-itpro/developer/devenv-designing-role-centers)
- [Ollama local chat API](https://docs.ollama.com/api/chat)
