# True Fish Business Suite — hybrid intelligence edition

## GitHub Pages layout fix — version 7.2.1

Upload **all extracted ZIP contents** into the folder GitHub Pages publishes, keeping index.html at that folder's root. The app now loads one complete `app.styles.css` bundle, with versioned asset URLs and an essential layout fallback. This prevents a missing/stale base stylesheet from leaving oversized navigation and pushing the workspace below the page. After uploading, refresh with Ctrl+F5. Keep the existing browser/path to retain its saved records and accounts.

After changing any of the four source CSS files, run `npm run build` to refresh the published CSS bundle as well as JavaScript.

Boat operations, fuel, finances, customer/supplier documents, crew, maintenance and review controls. No Cloudflare and no automatic external backup service are used.

Version 6 adds a financial business overview, grouped role-centred navigation, activity tiles, global workspace/record search (Ctrl+K), and the True Fish Assistant. The original boat and accounting methods remain available.

## Assistant and intelligence

Open **Assistant** or select **Ask True Fish** on the overview. Built-in record analysis works immediately on local HTML and GitHub Pages: cash explanations, month-to-date profit, unpaid documents, fuel cover, maintenance checks and a 30-day cash scenario. This mode uses deterministic calculations, not a generative AI model, and makes no network requests.

For model-generated answers, the optional server can connect to **Ollama running locally on the same server**. A model must be installed and configured separately. See AI-GUIDE.md. No cloud AI provider or API key is required. The assistant never changes records or executes payments. Verify model answers against the linked reports.

## Two modes

**GitHub Pages / local HTML:** no installation. On first opening, create your device super administrator. Later visits show sign-in. Accounts and data stay in that browser. This is a local convenience lock, not enforced shared-user security; someone with access to the device/browser storage can bypass it.

**Optional Node.js server:** authenticated staff accounts, enforced permissions and a shared SQLite ledger. Requires Node.js 24 and persistent server disk. See SERVER.md. It does not run inside GitHub Pages.

## Login and user management

Version 7 opens with an aquatic sign-in screen. The protected owner is the **Super administrator** and always has all system rights. Open **Review & staff → Create user** to add accounts, assign a role and adjust individual action permissions. You can deactivate accounts and reset their passwords. See USERS.md for setup, rights and recovery details. No default password is bundled.

## Logo and payment receipts

Version 7.2 embeds the True Fish fish-and-wave logo on the login screen, workspace sidebar and receipts. Open **Receipts** to view the receipt register, then choose **View / Print → Print / Save as PDF**. The same receipt option appears in saved incoming cashbook payment details. Receipts use existing saved payments and do not add cash again. See RECEIPTS.md.

## Publish on GitHub Pages

1. Extract the ZIP and upload its contents into the repository root, with index.html at the top level.
2. Include config.js, app.bundle.js, styles.css, theme.css and .nojekyll. Keep the supplied static configuration.
3. In Settings > Pages select Deploy from a branch, main and /(root), then Save.
4. Open the published website. You can also double-click index.html locally.

Official guide: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

Never publish real credentials, .env.local, database files or financial backups in a public repository. Original workbook figures are not bundled into the public app.

## Workspaces

- Overview: daily close and income/profit trends.
- Boat records and fuel: daily performance, stock, debts and donations.
- Finances: Cash/M-Pesa/Bank cashbook, actual payments, transfers, owner funds, loans and balance checks.
- Customers & bills: contacts, invoices, supplier bills, overdue balances and partial settlement.
- Accounting: P&L, balance sheet, full trial balance, weighted-average fuel valuation and asset depreciation.
- Crew & maintenance: assignments, wages earned/paid and planned/completed service work.
- Imports & matching: CSV/XLSX mapping, preview, atomic imports and account-statement matching.
- Review & staff: user accounts, custom permissions, approvals, period closing and reopening.
- Activity and Settings: correction history, preferences and manual backup/restore.

## Getting started

Confirm original dates and the meanings of Uganda, Gowi, Charging Home, Amali and Boss. Enter opening fuel and its cost valuation, then starting financial balances. Add contacts and opening unpaid documents before ongoing invoices, bills and payments. Review figures, approve the selected period and close it. Keep manual downloaded backups.

Read BUSINESS-GUIDE.md for posting methods and safeguards. Existing schema-1 backups remain supported; use the updated app to restore newer business records. Imported browser data is not silently uploaded to an optional server.

## Spreadsheet imports

Files are read locally. Choose worksheet, header, column mapping and text date format, then inspect the preview. Explicit date override and optional previous-row date carry-forward are available. Import at most 1000 source rows per batch. Missing dates, required amounts, duplicates and formulas without cached results are flagged rather than guessed. Some wide debt/donation sheets require restructuring or additional actual prices/cash amounts.

Statements can use a signed amount or separate money-in/money-out columns. Matching suggests equal signed account movements; you must review a match. It does not create cash transactions automatically.

## Data and accounting scope

Static storage is browser/path-specific. Clearing site data or changing device/path can make it unavailable. JSON backups restore a full ledger; CSVs are reports. Automatic external backups remain excluded.

Accounting reports reflect recorded data and documented assumptions. Boat financial revenue uses actual posted receipts until ownership/allocation rules are confirmed. Tax amounts and recoverability are entered manually. There is no automatic tax return, payroll withholding calculation, bank feed or M-Pesa API connection. See BUSINESS-GUIDE.md.

## Editing and checks

HTML pages are index.html and login.html. Appearance is in styles.css/theme.css. app.js/business-ui.js provide the interface; ledger.js, finance.js, business.js, workflow.js and imports.js provide calculations and controls. storage.js saves local records; server-client.js connects optional server mode. app.bundle.js is prebuilt.

After JavaScript edits run `npm run build`. The published static app needs no Node.js. Developer tests and optional server mode require Node.js 24. Run `npm test` for calculations, forms, documents, imports, permissions, closing and local server authentication checks.
