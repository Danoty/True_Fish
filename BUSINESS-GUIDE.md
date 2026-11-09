# Business and accounting guide

## Documents and payments

Add customer/supplier contacts before invoices or bills. Document numbers are unique per party/type. Amount is before separately entered tax. Mark genuine pre-existing unpaid balances as opening documents so they do not create new-period revenue/expense; opening documents cannot introduce new tax.

Receive/pay from the document itself. Partial settlement is allowed but capped to its total. Payments clear receivables/payables without repeating income/expense. Do not repeat a customer-invoice collection as separate boat income. Do not invoice fuel sales already in the fuel log again; fuel receivables are reported separately.

A fuel supplier bill must link to the stock purchase and equal its value, with zero separately added tax. Existing direct payments count against the bill. This assigns a supplier without duplicating inventory. Dates must be consistent with the purchase and payments; reopen historical periods when reassignment changes closed figures.

Other bill tax is included in cost by default. Mark it recoverable only when appropriate for the business. No tax eligibility, rates or filing obligations are inferred. Nonrecoverable equipment tax is part of its recorded cost.

## Statements and valuation

Finances is the actual-money cashbook. Accounting adds invoices/bills, physical fuel movements, wages earned, assets and depreciation. Cash surplus, accrual profit and the original boat net-profit calculation are different measures and are not added together.

Fuel sale/credit value creates revenue and a receivable; posted cash clears it. Litres repaid and cash received can differ, so review both. Boat revenue remains posted actual receipts until ownership/allocation rules are confirmed.

Fuel cost uses a perpetual weighted average of entered opening valuation and purchases. Issues remove cost; donations expense cost without sales. Purchases create inventory and a purchase payable until settled. Missing opening costs are flagged and block approval/closing. Explicit zero cost is allowed for genuinely free stock.

Opening assets establish equipment and opening equity. Linked assets use an existing equipment purchase/bill without recording cost twice. Straight-line depreciation starts at the month-end after the in-service date and runs over the entered life down to salvage value. Disposal, revaluation and tax depreciation are not automated.

P&L uses the selected period. Balance sheet/trial balance use all postings through the end date. A balanced report checks arithmetic, not completeness or correct business classification. These are management reports, not a claim of jurisdiction-specific statutory compliance.

## Crew and maintenance

Crew records store contact, role and boat assignment. Accrue wages once per crew member/month, then pay from that payroll record to avoid repeating expense. Withholding/tax rules are not inferred.

Maintenance stores boat, due date, status and estimated/logged cost. Work logs do not create expenses automatically; record actual bills/expenses separately. Overdue work is highlighted.

## Approvals and closing

Approve the exact figures through a chosen date, then close that period. Financial, boat and fuel changes through the closed date are blocked. Contacts, maintenance and statement matching are nonposting records. Historical accounting corrections require administrator reopening with a reason, then fresh review/closing.

Snapshots use SHA-256 to detect changed figures; hashes are not digital signatures. The static edition has a local-device sign-in lock; it is not a security boundary against browser/device access. In server mode identity and individual rights are enforced. See USERS.md. Role defaults are:

- Super administrator: protected owner with every right.
- Administrator: manage credentials, restore, reopen and all normal work by default.
- Reviewer: enter/review, approve and close; cannot manage credentials or reopen.
- Clerk: enter data and correct own entries in open periods.
- Viewer: view/export records and use the assistant.

The super administrator can customise individual action rights for other users. All users can view the business records; there is no confidential department or boat scope.

History preserves entry/correction attribution and review actions. Legacy records without attribution need a reviewer/administrator to correct.

## Imports and matching

Choose explicit columns, dates, account and boat defaults. Formula cells need cached values. Preview before saving; batches are atomic and duplicate-checked. Changing mappings requires a fresh preview. Bank/M-Pesa statements do not automatically create cash entries.

Matching is one statement line to one equal signed account movement. Transfers can match each account leg separately. Combined charges may need separate cashbook postings; no automatic fee allocation is assumed.

## Backups

Manual JSON backups include records and workflow history. Automatic external backups are excluded. Static and server storage are separate. Restore requires the Restore backups right and preserves current users, permissions and period controls. Credentials/sessions are not in financial backups.
