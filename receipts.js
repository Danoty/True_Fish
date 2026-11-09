import { cents, FINANCE_ACCOUNTS, FINANCE_TYPES, resolveSource } from './finance.js';
import { businessLookup } from './business.js';

export function isReceiptRecord(record) {
    return record?.kind === 'finance' && ['income', 'source_receipt', 'invoice_receipt', 'capital', 'loan_in'].includes(record.transactionType) && cents(record.amount) > 0;
}
export function receiptNumber(record) { return 'TF-R-' + record.date.replaceAll('-', '') + '-' + record.id; }
export function receiptFor(records, id, company) {
    const record = records.find(r => r.id === id);
    if (!isReceiptRecord(record)) throw Error('Receipts require a saved incoming cashbook payment. Opening balances, transfers and unpaid invoices are not payment receipts.');
    const source = record.sourceId ? resolveSource(records, record.sourceId) : null;
    const invoice = record.documentId ? businessLookup(records, record.documentId, 'invoice') : null;
    const party = invoice ? businessLookup(records, invoice.partyId, 'party') : null;
    const replacement = records.find(r => r.replaces === record.id);
    return { number: receiptNumber(record), recordId: record.id, date: record.date, company: String(company || 'True Fish Ent.'), payer: record.counterparty || party?.name || source?.boat || 'Not recorded', boat: source?.boat || '', amount: cents(record.amount), method: FINANCE_ACCOUNTS[record.account], reference: record.reference || '', description: invoice ? 'Payment towards invoice ' + invoice.number : source ? 'Payment towards ' + (source.kind === 'boat' ? 'boat income' : source.kind === 'sale' ? 'fuel sale' : 'fuel debt repayment') + (source.boat ? ' · ' + source.boat : '') + ' · ' + source.date : record.category || FINANCE_TYPES[record.transactionType], invoiceNumber: invoice?.number || '', note: record.note || '', receivedBy: record.enteredByName || 'Not recorded', recordedAt: record.correctedAt || record.created || '', voided: !!record.void, voidReason: record.voidReason || '', replaces: record.replaces ? receiptNumber(records.find(r => r.id === record.replaces) || record) : '', replacement: replacement && isReceiptRecord(replacement) ? receiptNumber(replacement) : '' };
}
