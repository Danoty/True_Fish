# Branded payment receipts

The system now produces payment acknowledgements with your True Fish logo, business name, receipt number, date, payer, Cash/M-Pesa/Bank method, reference, description, exact amount received and the user who recorded it.

## Produce a receipt

1. Save the money received in the cashbook. For an invoice, record its payment under Customers & bills. For boat/fuel collections, use Finances → Boat & fuel amounts to account for → Post actual receipt. For other receipts, enter the appropriate income, owner capital or loan receipt.
2. Open **Receipts**, find the payment and select **View / Print**. You can also open its saved financial entry and choose **Receipt / Print PDF**.
3. Select **Print / Save as PDF**. In the browser's print dialog, choose a printer or Save as PDF. Only the receipt prints; the navigation and record controls are excluded. Browser print settings control paper size, margins and optional browser headers/footers.

An invoice's details and linked boat/fuel records also list their saved payment receipts. Partial collections each have a receipt for that payment only, not the full invoice or source amount. If the payer or payment reference was not entered, the document says so; correct the underlying financial entry if needed.

## What qualifies

Receipts come from positive saved incoming cashbook entries: business income, actual boat/fuel receipts, invoice receipts, owner capital and loan proceeds. Opening balances, account transfers, expenses, unpaid invoices, fuel credit issues and operational sales without a cashbook posting do not qualify. This prevents issuing a second payment acknowledgement from the same operational source and its accounting posting.

## Numbers, corrections and reprints

The receipt number combines the payment date and full saved ledger ID. It is stable and unique within the ledger, rather than a sequential fiscal counter. Reprinting retains this number and changes no balances. Printing is not recorded as another cash transaction.

Correcting a payment keeps the original voided record and produces a new numbered receipt for the replacement. The old receipt is clearly marked VOIDED and points to the replacement. The replacement points back to the original. A previously downloaded or printed copy cannot update itself; retrieve the current receipt from the system to check its status.

The register includes voided receipts for history. Its money-received total excludes voided entries and includes capital and loan proceeds as well as operating receipts. Filters apply to payment date, payer/reference text and linked boat. Export receipt register produces a branded HTML document with an embedded logo, not additional accounting entries. Open it to print or save as PDF.

These documents acknowledge recorded payments; they are labelled **not a tax invoice**. No fiscal/e-invoicing certification or submission is added. All signed-in users who can view the business records can view and print receipts.

The logo is included as the local file true-fish-logo.png. It loads without any external image service in local HTML, GitHub Pages and the shared-server edition.
