// Ready-to-run local / GitHub Pages app. No server build is required.
(()=>{
'use strict';
const ServerClient=(()=>{

class ServerLedger {
    constructor() { this.actorId = 'owner'; this.key = 'true-fish-shared'; this.cache = null; this.previous = null; }
    async request(path, body) {
        const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
        if (response.status === 401) {
            location.href = '/login.html';
            throw Error('Please sign in.');
        }
        const data = await response.json();
        if (!response.ok)
            throw Error(data.error || 'Request failed.');
        if (data.state) {
            this.cache = data.state;
            this.previous = data.previous || null;
            this.actorId = data.user.id;
            this.accounts = data.accounts || [];
            return this.cache;
        }
        return data;
    }
    async read() { return this.request('/api/state'); }
    readRecovery() { return this.previous; }
    async save(payload, version) { return this.request('/api/save', { payload, version }); }
    async saveBatch(inputs, version) { return this.request('/api/import', { inputs, version }); }
    async restore(backup, version) { return this.request('/api/restore', { backup, version }); }
    async setPreferences(preferences, version) { return this.request('/api/preferences', { preferences, version }); }
    async control(action, values, version) { return this.request('/api/control', { action, values, version }); }
}

return {ServerLedger};
})();
const Finance=(()=>{

const FINANCE_ACCOUNTS = { cash: 'Cash', mpesa: 'M-Pesa', bank: 'Bank' };
const FINANCE_TYPES = { opening: 'Opening account balance', income: 'Business income received', expense: 'Business expense paid', transfer: 'Account transfer', capital: 'Owner capital introduced', drawing: 'Owner withdrawal', loan_in: 'Loan received', loan_repay: 'Loan principal repaid', loan_opening: 'Opening loan liability', asset_buy: 'Equipment / asset purchase', source_receipt: 'Receipt from boat / fuel record', source_payment: 'Payment for fuel purchase', reconcile: 'Check account balance', invoice_receipt: 'Customer invoice receipt', bill_payment: 'Supplier bill payment', payroll_payment: 'Crew wages paid' };
const INCOME_CATEGORIES = ['Other business income', 'Fish sales', 'Services', 'Other sales'];
const EXPENSE_CATEGORIES = ['General expenses', 'Repairs & maintenance', 'Wages & crew', 'Rent', 'Charging', 'Transport', 'Fees & charges', 'Interest paid', 'Other operating expenses'];
const cents = value => Math.round(Number(value || 0) * 100);
const shillings = value => value / 100;
const cashTypes = ['opening', 'income', 'expense', 'transfer', 'capital', 'drawing', 'loan_in', 'loan_repay', 'asset_buy', 'source_receipt', 'source_payment', 'reconcile', 'invoice_receipt', 'bill_payment', 'payroll_payment'];
function validateFinance(r) {
    if (!Object.hasOwn(FINANCE_TYPES, r.transactionType))
        throw Error('Choose a financial transaction type.');
    const type = r.transactionType;
    if (cashTypes.includes(type) && !Object.hasOwn(FINANCE_ACCOUNTS, r.account))
        throw Error('Choose Cash, M-Pesa or Bank.');
    if (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || Math.abs(r.amount) > 1e10 || Math.abs(r.amount * 100 - Math.round(r.amount * 100)) > .0001)
        throw Error('Enter a valid KSh amount with at most two decimal places.');
    if (type !== 'reconcile' && (r.amount < 0 || (!['opening', 'loan_opening'].includes(type) && r.amount === 0)))
        throw Error('Enter an amount greater than zero.');
    if (type === 'transfer' && (!Object.hasOwn(FINANCE_ACCOUNTS, r.toAccount) || r.toAccount === r.account))
        throw Error('Choose a different destination account.');
    if (['source_receipt', 'source_payment'].includes(type) && (typeof r.sourceId !== 'string' || !r.sourceId))
        throw Error('Select the original boat or fuel record.');
    if (type === 'income' && !INCOME_CATEGORIES.includes(r.category))
        throw Error('Choose an income category.');
    if (type === 'expense' && !EXPENSE_CATEGORIES.includes(r.category))
        throw Error('Choose an expense category.');
    if (['invoice_receipt', 'bill_payment', 'payroll_payment'].includes(type) && !r.documentId)
        throw Error('Choose the invoice, bill or payroll record.');
    return { documentId: ['invoice_receipt', 'bill_payment', 'payroll_payment'].includes(type) ? String(r.documentId) : '', kind: 'finance', date: r.date, transactionType: type, account: type === 'loan_opening' ? '' : r.account, amount: Math.round(r.amount * 100) / 100, toAccount: type === 'transfer' ? r.toAccount : '', sourceId: ['source_receipt', 'source_payment'].includes(type) ? r.sourceId : '', category: ['income', 'expense'].includes(type) ? r.category : '', counterparty: String(r.counterparty || '').trim().slice(0, 120), reference: String(r.reference || '').trim().slice(0, 80), note: String(r.note || '').slice(0, 1000), boat: '' };
}
function resolveSource(records, id) {
    let source = records.find(r => r.id === id);
    const seen = new Set();
    while (source?.void && !seen.has(source.id)) {
        seen.add(source.id);
        source = records.find(r => r.replaces === source.id);
    }
    return source && !source.void ? source : null;
}
function sourceLimit(source) {
    if (!source)
        return 0;
    if (source.kind === 'purchase')
        return cents(source.litres * source.price);
    if (['sale', 'repayment'].includes(source.kind))
        return cents(source.cash);
    if (source.kind === 'boat')
        return cents(source.income);
    return 0;
}
function sourcePostings(records) {
    const posted = new Map();
    for (const r of records.filter(r => !r.void && r.kind === 'finance' && r.sourceId)) {
        const source = resolveSource(records, r.sourceId);
        if (source)
            posted.set(source.id, (posted.get(source.id) || 0) + cents(r.amount));
    }
    return posted;
}
function validateFinancialLinks(records) {
    const references = new Set(), openings = new Set(), used = new Map();
    for (const r of records.filter(r => !r.void && r.kind === 'finance')) {
        validateFinance(r);
        if (r.reference) {
            const key = r.reference.trim().toUpperCase();
            if (references.has(key))
                throw Error('That payment / receipt reference is already used. Use a unique transaction reference.');
            references.add(key);
        }
        if (['opening', 'loan_opening'].includes(r.transactionType)) {
            const key = r.transactionType + ':' + r.account;
            if (openings.has(key))
                throw Error('An opening balance already exists for this account. Correct the existing opening entry.');
            openings.add(key);
        }
        if (r.sourceId) {
            const source = resolveSource(records, r.sourceId);
            if (!source || !['boat', 'purchase', 'sale', 'repayment'].includes(source.kind))
                throw Error('This financial entry needs an active boat or fuel source. Void its financial posting before voiding the source.');
            if ((r.transactionType === 'source_payment') !== (source.kind === 'purchase'))
                throw Error('Use a payment for a purchase, and a receipt for boat / fuel collections.');
            if (r.date < source.date)
                throw Error('A source payment / receipt cannot be dated before its original record.');
            used.set(source.id, (used.get(source.id) || 0) + cents(r.amount));
            if (used.get(source.id) > sourceLimit(source))
                throw Error('Payments / receipts exceed the amount available on the original record. Review earlier postings first.');
        }
    }
    const ordered = records.filter(r => !r.void && r.kind === 'finance').slice().sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created));
    const touched = new Set();
    let loan = 0;
    for (const r of ordered) {
        if (['loan_in', 'loan_opening'].includes(r.transactionType))
            loan += cents(r.amount);
        if (r.transactionType === 'loan_repay') {
            loan -= cents(r.amount);
            if (loan < 0)
                throw Error('Loan principal repayment exceeds the recorded loan balance. Enter any pre-existing loan as an opening loan liability.');
        }
        if (r.transactionType === 'opening' && touched.has(r.account))
            throw Error('Opening balance must precede other transactions for that account. Correct its date or record it first.');
        if (r.transactionType !== 'loan_opening') {
            touched.add(r.account);
            if (r.transactionType === 'transfer')
                touched.add(r.toAccount);
        }
    }
}
function financeCategory(r, records) {
    if (['invoice_receipt', 'bill_payment', 'payroll_payment'].includes(r.transactionType)) {
        return { invoice_receipt: 'Customer collections', bill_payment: 'Supplier payments', payroll_payment: 'Crew payments' }[r.transactionType];
    }
    if (r.transactionType === 'source_payment')
        return 'Fuel purchases';
    if (r.transactionType === 'source_receipt') {
        const s = resolveSource(records, r.sourceId);
        return s?.kind === 'boat' ? 'Boat cash received' : s?.kind === 'repayment' ? 'Fuel credit collected' : 'Fuel cash sales';
    }
    return r.category || FINANCE_TYPES[r.transactionType];
}
function journalFor(r, records) {
    if (r.kind !== 'finance' || r.void || r.transactionType === 'reconcile')
        return [];
    const amount = cents(r.amount), account = 'A:' + r.account, category = financeCategory(r, records);
    let debit, credit;
    switch (r.transactionType) {
        case 'invoice_receipt': {
            const doc = resolveSource(records, r.documentId);
            debit = account;
            credit = 'A:Customers:' + resolveSource(records, doc?.partyId)?.id;
            break;
        }
        case 'bill_payment': {
            const doc = resolveSource(records, r.documentId);
            debit = 'L:Suppliers:' + resolveSource(records, doc?.partyId)?.id;
            credit = account;
            break;
        }
        case 'payroll_payment': {
            const doc = resolveSource(records, r.documentId);
            debit = 'L:Crew:' + resolveSource(records, doc?.crewId)?.id;
            credit = account;
            break;
        }
        case 'opening':
            debit = account;
            credit = 'E:Opening balances';
            break;
        case 'income':
        case 'source_receipt':
            debit = account;
            credit = 'I:' + category;
            break;
        case 'expense':
        case 'source_payment':
            debit = 'X:' + category;
            credit = account;
            break;
        case 'transfer':
            debit = 'A:' + r.toAccount;
            credit = account;
            break;
        case 'capital':
            debit = account;
            credit = 'E:Owner capital';
            break;
        case 'drawing':
            debit = 'E:Owner drawings';
            credit = account;
            break;
        case 'loan_in':
            debit = account;
            credit = 'L:Loan principal';
            break;
        case 'loan_repay':
            debit = 'L:Loan principal';
            credit = account;
            break;
        case 'loan_opening':
            debit = 'E:Opening balances';
            credit = 'L:Loan principal';
            break;
        case 'asset_buy':
            debit = 'A:Equipment purchases';
            credit = account;
            break;
        default: return [];
    }
    return [{ recordId: r.id, date: r.date, created: r.created, account: debit, debit: amount, credit: 0 }, { recordId: r.id, date: r.date, created: r.created, account: credit, debit: 0, credit: amount }];
}
function accountName(code, records = []) { const [prefix, ...parts] = code.split(':'); const name = parts.join(':'); return prefix === 'A' && FINANCE_ACCOUNTS[name] ? FINANCE_ACCOUNTS[name] : name; }
function financeReport(records, { start = '', end = '', account = '', search = '' } = {}) {
    const entries = records.filter(r => !r.void && r.kind === 'finance').slice().sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created));
    const balances = { cash: 0, mpesa: 0, bank: 0 }, trial = new Map(), checks = [], cashbook = [];
    let receipts = 0, payments = 0, capital = 0, drawings = 0, loanIn = 0, loanRepay = 0, assets = 0;
    const period = r => (!start || r.date >= start) && (!end || r.date <= end) && (!account || r.account === account || r.toAccount === account) && (!search || [r.counterparty, r.reference, r.note, financeCategory(r, records)].join(' ').toLowerCase().includes(search.toLowerCase()));
    for (const r of entries) {
        if (end && r.date > end)
            continue;
        const postings = journalFor(r, records);
        const before = { ...balances };
        for (const p of postings) {
            const old = trial.get(p.account) || { account: p.account, debit: 0, credit: 0 };
            old.debit += p.debit;
            old.credit += p.credit;
            trial.set(p.account, old);
            if (p.account.startsWith('A:') && Object.hasOwn(balances, p.account.slice(2)))
                balances[p.account.slice(2)] += p.debit - p.credit;
        }
        if (r.transactionType === 'reconcile') {
            if (period(r))
                checks.push({ ...r, expected: before[r.account], counted: cents(r.amount), difference: cents(r.amount) - before[r.account] });
            continue;
        }
        if (period(r)) {
            const selectedAccounts = account ? [account] : Object.keys(balances);
            const cashIn = selectedAccounts.reduce((sum, a) => sum + Math.max(0, balances[a] - before[a]), 0), cashOut = selectedAccounts.reduce((sum, a) => sum + Math.max(0, before[a] - balances[a]), 0);
            cashbook.push({ ...r, categoryLabel: financeCategory(r, records), cashIn, cashOut, balance: account ? balances[account] : Object.values(balances).reduce((a, b) => a + b, 0) });
            const amount = cents(r.amount);
            if (['income', 'source_receipt', 'invoice_receipt'].includes(r.transactionType))
                receipts += amount;
            if (['expense', 'source_payment', 'bill_payment', 'payroll_payment'].includes(r.transactionType))
                payments += amount;
            if (r.transactionType === 'capital')
                capital += amount;
            if (r.transactionType === 'drawing')
                drawings += amount;
            if (r.transactionType === 'loan_in')
                loanIn += amount;
            if (r.transactionType === 'loan_repay')
                loanRepay += amount;
            if (r.transactionType === 'asset_buy')
                assets += amount;
        }
    }
    const trialBalance = [...trial.values()].map(r => { const net = r.debit - r.credit; return { account: r.account, name: accountName(r.account, records), debit: Math.max(0, net), credit: Math.max(0, -net) }; }).sort((a, b) => a.account.localeCompare(b.account));
    const expenseBreakdown = new Map();
    for (const r of cashbook)
        if (['expense', 'source_payment', 'bill_payment', 'payroll_payment'].includes(r.transactionType))
            expenseBreakdown.set(r.categoryLabel, (expenseBreakdown.get(r.categoryLabel) || 0) + cents(r.amount));
    return { balances, entries: cashbook, checks, receipts, payments, surplus: receipts - payments, capital, drawings, loanIn, loanRepay, assets, trialBalance, trialDebits: trialBalance.reduce((n, r) => n + r.debit, 0), trialCredits: trialBalance.reduce((n, r) => n + r.credit, 0), expenseBreakdown: [...expenseBreakdown].map(([category, amount]) => ({ category, amount })) };
}

return {FINANCE_ACCOUNTS,FINANCE_TYPES,INCOME_CATEGORIES,EXPENSE_CATEGORIES,cents,shillings,validateFinance,resolveSource,sourceLimit,sourcePostings,validateFinancialLinks,financeCategory,journalFor,accountName,financeReport};
})();
const Business=(()=>{
const {FINANCE_ACCOUNTS,FINANCE_TYPES,INCOME_CATEGORIES,EXPENSE_CATEGORIES,cents,shillings,validateFinance,resolveSource,sourceLimit,sourcePostings,validateFinancialLinks,financeCategory,journalFor,accountName,financeReport}=Finance;
const BUSINESS_KINDS = ['party', 'invoice', 'bill', 'asset', 'fuel_value', 'crew', 'payroll', 'maintenance', 'statement', 'match'];
const BUSINESS_LABELS = { party: 'Customer / supplier', invoice: 'Customer invoice', bill: 'Supplier bill', asset: 'Fixed asset', fuel_value: 'Opening fuel valuation', crew: 'Crew member', payroll: 'Crew wages accrued', maintenance: 'Boat maintenance', statement: 'Statement line', match: 'Statement match' };
const text = (v, n = 120) => String(v || '').trim().slice(0, n);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const amount = (v, zero = false) => typeof v === 'number' && Number.isFinite(v) && v >= (zero ? 0 : .01) && v <= 1e10 && Math.abs(v * 100 - Math.round(v * 100)) < .0001;
function validateBusiness(r) {
    const b = { kind: r.kind, date: r.date, boat: text(r.boat), note: text(r.note, 1000) };
    const need = (condition, message) => {
        if (!condition)
            throw Error(message);
    };
    if (r.kind === 'party') {
        need(text(r.name) && ['customer', 'supplier', 'both'].includes(r.partyType), 'Enter the party name and type.');
        return { ...b, name: text(r.name), partyType: r.partyType, phone: text(r.phone, 60), email: text(r.email), address: text(r.address, 250) };
    }
    if (['invoice', 'bill'].includes(r.kind)) {
        need(text(r.partyId) && text(r.number), 'Choose a customer / supplier and document number.');
        need(amount(r.amount) && amount(r.taxAmount ?? 0, true), 'Enter a positive amount and non-negative tax, in KSh with two decimals.');
        need(date(r.dueDate) && r.dueDate >= r.date, 'Due date must be on or after the document date.');
        const category = r.kind === 'invoice' ? 'sales' : r.category;
        need(r.kind === 'invoice' || ['expense', 'fuel', 'equipment'].includes(category), 'Choose a bill category.');
        if (r.opening === true)
            need(!r.taxAmount, 'Opening balances cannot include new tax.');
        return { ...b, partyId: text(r.partyId), number: text(r.number, 80), amount: r.amount, taxAmount: r.taxAmount || 0, dueDate: r.dueDate, category, taxRecoverable: r.kind === 'bill' && r.taxRecoverable === true, sourceId: text(r.sourceId), opening: r.opening === true };
    }
    if (r.kind === 'asset') {
        need(text(r.name) && amount(r.amount) && amount(r.salvage ?? 0, true) && r.salvage <= r.amount, 'Enter the asset name, cost and salvage value (not above cost).');
        need(Number.isInteger(r.lifeMonths) && r.lifeMonths > 0 && r.lifeMonths <= 1200, 'Enter an asset life of 1–1200 months.');
        need(['opening', 'linked'].includes(r.origin), 'Choose opening asset or an existing purchase.');
        need(r.origin !== 'linked' || text(r.sourceId), 'Choose the purchase that recorded this asset cost.');
        return { ...b, name: text(r.name), amount: r.amount, salvage: r.salvage || 0, lifeMonths: r.lifeMonths, origin: r.origin, sourceId: text(r.sourceId) };
    }
    if (r.kind === 'fuel_value') {
        need(text(r.sourceId) && amount(r.unitCost, true), 'Choose opening fuel and enter its unit cost (zero is allowed).');
        return { ...b, sourceId: text(r.sourceId), unitCost: r.unitCost };
    }
    if (r.kind === 'crew') {
        need(text(r.name), 'Enter a crew member name.');
        return { ...b, name: text(r.name), phone: text(r.phone, 60), position: text(r.position) };
    }
    if (r.kind === 'payroll') {
        need(text(r.crewId) && amount(r.amount), 'Choose crew and enter wages earned.');
        need(/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period), 'Enter the payroll month as YYYY-MM.');
        return { ...b, crewId: text(r.crewId), amount: r.amount, period: r.period };
    }
    if (r.kind === 'maintenance') {
        need(/^Boat (?:[1-9]|1[0-5])$/.test(r.boat) && text(r.title), 'Choose a boat and describe the work.');
        need(date(r.dueDate) && r.dueDate >= r.date, 'Enter a due date on or after the record date.');
        need(['planned', 'done'].includes(r.status) && amount(r.amount ?? 0, true), 'Choose planned/done and a valid estimated cost.');
        return { ...b, title: text(r.title), dueDate: r.dueDate, status: r.status, amount: r.amount || 0, sourceId: text(r.sourceId) };
    }
    if (r.kind === 'statement') {
        need(Object.hasOwn(FINANCE_ACCOUNTS, r.account) && typeof r.amount === 'number' && Number.isFinite(r.amount) && Math.abs(r.amount) <= 1e10 && Math.abs(r.amount * 100 - Math.round(r.amount * 100)) < .0001, 'Choose an account and a signed KSh amount.');
        return { ...b, account: r.account, amount: r.amount, reference: text(r.reference, 80), description: text(r.description, 300) };
    }
    if (r.kind === 'match') {
        need(text(r.statementId) && text(r.financeId), 'Choose a statement line and financial entry.');
        return { ...b, statementId: text(r.statementId), financeId: text(r.financeId) };
    }
    throw Error('Unknown business record type.');
}
function businessLookup(records, id, kind) { const found = resolveSource(records, id); return found && (!kind || found.kind === kind) ? found : null; }
const documentTotal = r => cents(r.amount) + cents(r.taxAmount || 0);
function documentPayments(records, document) {
    let paid = 0;
    for (const r of records.filter(r => !r.void && r.kind === 'finance')) {
        if (r.documentId && businessLookup(records, r.documentId)?.id === document.id)
            paid += cents(r.amount);
        if (document.kind === 'bill' && document.sourceId && r.transactionType === 'source_payment' && businessLookup(records, r.sourceId)?.id === businessLookup(records, document.sourceId)?.id)
            paid += cents(r.amount);
    }
    return paid;
}
function cashLeg(r, account) {
    if (r.kind !== 'finance' || r.void)
        return 0;
    return journalFor(r, []).filter(p => p.account === 'A:' + account).reduce((n, p) => n + p.debit - p.credit, 0);
}
function validateBusinessLinks(records) {
    const live = records.filter(r => !r.void), numbers = new Set(), valuations = new Set(), matches = new Set(), financeLegs = new Set(), crewPeriods = new Set(), importKeys = new Set(), assetCosts = new Map(), fuelBills = new Set();
    for (const r of live) {
        if (r.importKey) {
            if (importKeys.has(r.importKey))
                throw Error('An identical imported record already exists. Add a unique reference or exclude the duplicate row.');
            importKeys.add(r.importKey);
        }
        if (!BUSINESS_KINDS.includes(r.kind) && r.kind !== 'finance')
            continue;
        if (['invoice', 'bill'].includes(r.kind)) {
            const party = businessLookup(records, r.partyId, 'party');
            if (!party || (r.kind === 'invoice' && !['customer', 'both'].includes(party.partyType)) || (r.kind === 'bill' && !['supplier', 'both'].includes(party.partyType)))
                throw Error('This document requires an active customer / supplier.');
            const key = r.kind + ':' + party.id + ':' + r.number.toUpperCase();
            if (numbers.has(key))
                throw Error('Document number already exists for this party.');
            numbers.add(key);
            if (r.kind === 'bill' && r.category === 'fuel' && !r.sourceId && !r.opening)
                throw Error('Link a fuel bill to its stock purchase to avoid recording inventory twice.');
            if (r.sourceId) {
                const source = businessLookup(records, r.sourceId, 'purchase');
                if (r.kind !== 'bill' || r.category !== 'fuel' || !source || documentTotal(r) !== cents(source.litres * source.price) || r.taxAmount || r.opening)
                    throw Error('A linked fuel bill must equal the purchase value, with zero separate tax and no opening-balance flag.');
                if (r.date < source.date || live.some(f => f.kind === 'finance' && f.transactionType === 'source_payment' && businessLookup(records, f.sourceId)?.id === source.id && f.date < r.date))
                    throw Error('A linked fuel bill must not predate its purchase or follow an already recorded payment. Review the dates first.');
                if (fuelBills.has(source.id))
                    throw Error('This fuel purchase already has a supplier bill.');
                fuelBills.add(source.id);
            }
            if (documentPayments(records, r) > documentTotal(r))
                throw Error('Payments exceed this invoice / bill total.');
        }
        if (r.kind === 'asset' && r.origin === 'linked') {
            const source = businessLookup(records, r.sourceId);
            if (!source || !((source.kind === 'finance' && source.transactionType === 'asset_buy') || (source.kind === 'bill' && source.category === 'equipment')))
                throw Error('Link the asset to an equipment purchase or equipment bill.');
            const used = (assetCosts.get(source.id) || 0) + cents(r.amount);
            if (used > (source.kind === 'bill' && !source.taxRecoverable ? documentTotal(source) : cents(source.amount)))
                throw Error('Registered asset costs exceed the linked purchase.');
            assetCosts.set(source.id, used);
        }
        if (r.kind === 'fuel_value') {
            const source = businessLookup(records, r.sourceId, 'opening');
            if (!source || r.date !== source.date)
                throw Error('Fuel valuation must link to opening stock and use its date.');
            if (valuations.has(source.id))
                throw Error('Opening fuel already has a valuation.');
            valuations.add(source.id);
        }
        if (r.kind === 'payroll') {
            const crew = businessLookup(records, r.crewId, 'crew');
            if (!crew)
                throw Error('Choose an active crew member.');
            const key = crew.id + ':' + r.period;
            if (crewPeriods.has(key))
                throw Error('Wages for this crew member and month already exist; correct the existing record.');
            crewPeriods.add(key);
            if (documentPayments(records, r) > cents(r.amount))
                throw Error('Crew payments exceed recorded wages.');
        }
        if (r.kind === 'maintenance' && r.sourceId && !businessLookup(records, r.sourceId))
            throw Error('The linked financial document no longer exists.');
        if (r.kind === 'finance' && ['invoice_receipt', 'bill_payment', 'payroll_payment'].includes(r.transactionType)) {
            const kind = { invoice_receipt: 'invoice', bill_payment: 'bill', payroll_payment: 'payroll' }[r.transactionType], doc = businessLookup(records, r.documentId, kind);
            if (!doc)
                throw Error('This payment needs an active invoice, bill or payroll record.');
            if (r.date < doc.date)
                throw Error('Payment cannot precede its document.');
            if (documentPayments(records, doc) > (kind === 'payroll' ? cents(doc.amount) : documentTotal(doc)))
                throw Error('Payment exceeds the document balance.');
        }
        if (r.kind === 'match') {
            const statement = businessLookup(records, r.statementId, 'statement'), entry = businessLookup(records, r.financeId, 'finance');
            if (!statement || !entry || cashLeg(entry, statement.account) !== cents(statement.amount) || !statement.amount)
                throw Error('Match requires an active statement and an equal, signed account movement.');
            const key = entry.id + ':' + statement.account;
            if (matches.has(statement.id) || financeLegs.has(key))
                throw Error('Statement line / account movement is already matched.');
            matches.add(statement.id);
            financeLegs.add(key);
        }
    }
}
function line(r, account, debit = 0, credit = 0) { return { recordId: r.id, date: r.date, account, debit, credit }; }
function documentJournal(r, records) {
    if (r.void)
        return [];
    const total = documentTotal(r), net = cents(r.amount), tax = cents(r.taxAmount || 0);
    if (r.kind === 'invoice') {
        const party = businessLookup(records, r.partyId, 'party');
        return [line(r, 'A:Customers:' + party?.id, total), line(r, r.opening ? 'E:Opening balances' : 'I:Invoiced sales', 0, r.opening ? total : net), ...(!r.opening && tax ? [line(r, 'L:Sales tax recorded', 0, tax)] : [])];
    }
    if (r.kind === 'bill') {
        const party = businessLookup(records, r.partyId, 'party'), source = r.sourceId ? businessLookup(records, r.sourceId) : null;
        const debit = r.opening ? 'E:Opening balances' : source ? 'L:Fuel purchase clearing' : r.category === 'equipment' ? 'A:Equipment purchases' : r.category === 'fuel' ? 'A:Fuel inventory' : 'X:Supplier bills';
        return [line(r, debit, r.opening ? total : r.taxRecoverable ? net : total), ...(tax && r.taxRecoverable ? [line(r, 'A:Purchase tax recorded', tax)] : []), line(r, 'L:Suppliers:' + party?.id, 0, total)];
    }
    if (r.kind === 'payroll') {
        return [line(r, 'X:Crew wages', cents(r.amount)), line(r, 'L:Crew:' + businessLookup(records, r.crewId, 'crew')?.id, 0, cents(r.amount))];
    }
    if (r.kind === 'asset' && r.origin === 'opening')
        return [line(r, 'A:Equipment purchases', cents(r.amount)), line(r, 'E:Opening balances', 0, cents(r.amount))];
    return [];
}
function inventoryJournal(records, end = '9999-12-31') {
    const live = records.filter(r => !r.void), ordered = live.filter(r => ['opening', 'purchase', 'sale', 'credit', 'donation'].includes(r.kind) && r.date <= end).slice().sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created));
    let litres = 0, value = 0;
    const postings = [], unvalued = [];
    for (const r of ordered) {
        if (r.kind === 'opening') {
            const valuation = live.find(v => v.kind === 'fuel_value' && businessLookup(records, v.sourceId)?.id === r.id);
            if (!valuation && r.litres > 0)
                unvalued.push(r);
            const cost = valuation ? cents(r.litres * valuation.unitCost) : 0;
            litres += r.litres;
            value += cost;
            if (cost)
                postings.push(line(r, 'A:Fuel inventory', cost), line(r, 'E:Opening balances', 0, cost));
        }
        else if (r.kind === 'purchase') {
            const cost = cents(r.litres * r.price);
            litres += r.litres;
            value += cost;
            postings.push(line(r, 'A:Fuel inventory', cost), line(r, 'L:Fuel purchase clearing', 0, cost));
        }
        else {
            const cost = Math.min(value, Math.round(r.litres * (litres ? value / litres : 0)));
            litres -= r.litres;
            value -= cost;
            postings.push(line(r, r.kind === 'donation' ? 'X:Fuel donations' : 'X:Fuel cost of sales', cost), line(r, 'A:Fuel inventory', 0, cost));
            if (['sale', 'credit'].includes(r.kind)) {
                const sales = cents(r.litres * r.price);
                postings.push(line(r, 'A:Fuel customers:' + r.boat, sales), line(r, 'I:Fuel sales', 0, sales));
            }
        }
    }
    return { litres, value, postings, unvalued };
}
function fullJournal(records, end = '9999-12-31') {
    const rows = records.filter(r => !r.void && r.date <= end), postings = inventoryJournal(records, end).postings.slice();
    for (const r of rows) {
        if (r.kind !== 'finance') {
            postings.push(...documentJournal(r, records));
            continue;
        }
        let lines = journalFor(r, records);
        if (r.transactionType === 'source_payment') {
            const source = businessLookup(records, r.sourceId), bill = rows.find(d => d.kind === 'bill' && d.sourceId && businessLookup(records, d.sourceId)?.id === source?.id);
            lines = [line(r, bill ? 'L:Suppliers:' + businessLookup(records, bill.partyId)?.id : 'L:Fuel purchase clearing', cents(r.amount)), line(r, 'A:' + r.account, 0, cents(r.amount))];
        }
        if (r.transactionType === 'source_receipt') {
            const source = businessLookup(records, r.sourceId);
            if (source && ['sale', 'repayment'].includes(source.kind))
                lines = [line(r, 'A:' + r.account, cents(r.amount)), line(r, 'A:Fuel customers:' + source.boat, 0, cents(r.amount))];
        }
        postings.push(...lines);
    }
    for (const a of rows.filter(r => r.kind === 'asset')) {
        const acquisition = new Date(a.date + 'T00:00:00Z'), first = new Date(Date.UTC(acquisition.getUTCFullYear(), acquisition.getUTCMonth() + 2, 0));
        let previous = 0;
        for (let month = 1; month <= a.lifeMonths; month++) {
            const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + month, 0)).toISOString().slice(0, 10);
            if (d > end)
                break;
            const cumulative = Math.round((cents(a.amount) - cents(a.salvage)) * month / a.lifeMonths), charge = cumulative - previous;
            previous = cumulative;
            if (charge) {
                const virtual = { id: a.id, date: d };
                postings.push(line(virtual, 'X:Depreciation', charge), line(virtual, 'A:Accumulated depreciation', 0, charge));
            }
        }
    }
    return postings;
}
function accountingName(code, records) {
    const parts = code.split(':'), id = parts.slice(2).join(':');
    if (['Customers', 'Suppliers'].includes(parts[1]))
        return parts[1] + ' · ' + (businessLookup(records, id, 'party')?.name || id);
    if (parts[1] === 'Crew')
        return 'Crew payable · ' + (businessLookup(records, id, 'crew')?.name || id);
    if (parts[1] === 'Fuel customers')
        return 'Fuel receivable · ' + id;
    return FINANCE_ACCOUNTS[parts[1]] || parts.slice(1).join(' · ');
}
function accountingReport(records, { start = '', end = '9999-12-31' } = {}) {
    const journal = fullJournal(records, end), balances = new Map(), period = new Map();
    for (const p of journal) {
        balances.set(p.account, (balances.get(p.account) || 0) + p.debit - p.credit);
        if (!start || p.date >= start)
            period.set(p.account, (period.get(p.account) || 0) + p.debit - p.credit);
    }
    const trial = [...balances].map(([account, net]) => ({ account, name: accountingName(account, records), debit: Math.max(0, net), credit: Math.max(0, -net) })).sort((a, b) => a.account.localeCompare(b.account));
    const income = [...period].filter(([a]) => a.startsWith('I:')).map(([account, v]) => ({ name: accountingName(account, records), amount: -v })), expenses = [...period].filter(([a]) => a.startsWith('X:')).map(([account, v]) => ({ name: accountingName(account, records), amount: v }));
    let assets = 0, liabilities = 0, equity = 0, retained = 0;
    for (const [a, v] of balances) {
        if (a.startsWith('A:'))
            assets += v;
        if (a.startsWith('L:'))
            liabilities -= v;
        if (a.startsWith('E:'))
            equity -= v;
        if (a.startsWith('I:') || a.startsWith('X:'))
            retained -= v;
    }
    const net = income.reduce((n, r) => n + r.amount, 0) - expenses.reduce((n, r) => n + r.amount, 0);
    return { journal, trial, income, expenses, net, assets, liabilities, equity, retained, balanceDifference: assets - liabilities - equity - retained, inventory: inventoryJournal(records, end), balances };
}
function partyOutstanding(records, kind, asOf) { return records.filter(r => !r.void && r.kind === kind && r.date <= asOf).map(r => { const balance = documentTotal(r) - documentPayments(records.filter(x => x.date <= asOf), r); return { ...r, partyName: businessLookup(records, r.partyId)?.name || 'Unknown', balance, overdue: balance > 0 && r.dueDate < asOf }; }); }
function statementSuggestions(records, lineRecord) { const matched = records.filter(r => !r.void && r.kind === 'match'); return records.filter(r => !r.void && r.kind === 'finance' && cashLeg(r, lineRecord.account) === cents(lineRecord.amount) && !matched.some(m => businessLookup(records, m.financeId)?.id === r.id && businessLookup(records, m.statementId)?.account === lineRecord.account)).sort((a, b) => (a.reference && a.reference === lineRecord.reference ? -1 : 0) - (b.reference && b.reference === lineRecord.reference ? -1 : 0) || Math.abs(Date.parse(a.date) - Date.parse(lineRecord.date)) - Math.abs(Date.parse(b.date) - Date.parse(lineRecord.date))); }

return {BUSINESS_KINDS,BUSINESS_LABELS,validateBusiness,businessLookup,documentTotal,documentPayments,cashLeg,validateBusinessLinks,documentJournal,inventoryJournal,fullJournal,accountingName,accountingReport,partyOutstanding,statementSuggestions};
})();
const Workflow=(()=>{

const ROLES = { admin: 'Administrator', approver: 'Reviewer / approver', clerk: 'Data-entry clerk', viewer: 'Read only' };
const RIGHTS = { write: 'Create records', edit: 'Correct records', void: 'Void records', import: 'Import spreadsheet rows', approve: 'Approve reviewed figures', close: 'Close approved periods', reopen: 'Reopen periods', team: 'Manage users and rights', restore: 'Restore backups', settings: 'Change business settings', assistant: 'Use business assistant' };
function roleRights(role) {
    const all = Object.keys(RIGHTS);
    if (role === 'admin') return all;
    if (role === 'approver') return ['write', 'edit', 'void', 'import', 'approve', 'close', 'assistant'];
    if (role === 'clerk') return ['write', 'edit', 'import', 'assistant'];
    return ['assistant'];
}
function effectiveRights(actor) { return actor.id === 'owner' ? Object.keys(RIGHTS) : (actor.permissions || roleRights(actor.role)); }
function roleLabel(actor) { return actor.id === 'owner' ? 'Super administrator' : ROLES[actor.role]; }
const controlDefaults = () => ({ staff: [{ id: 'owner', name: 'Owner', role: 'admin', active: true }], closedThrough: '', approvals: [], history: [] });
function normalControls(value) {
    if (value === undefined)
        return controlDefaults();
    if (!value || !Array.isArray(value.staff) || !value.staff.some(s => s.id === 'owner' && s.role === 'admin' && s.active !== false) || !Array.isArray(value.approvals) || !Array.isArray(value.history))
        throw Error('Invalid local workflow profiles.');
    const ids = new Set();
    for (const s of value.staff) {
        if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(s.id) || ids.has(s.id) || typeof s.name !== 'string' || !s.name || !Object.hasOwn(ROLES, s.role))
            throw Error('Invalid staff profile.');
        ids.add(s.id);
        if (s.permissions !== undefined && (!Array.isArray(s.permissions) || s.permissions.some(p => !Object.hasOwn(RIGHTS, p)) || new Set(s.permissions).size !== s.permissions.length))
            throw Error('Invalid user permissions.');
    }
    const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (value.closedThrough && !validDate(value.closedThrough))
        throw Error('Invalid closed-period metadata.');
    for (const a of value.approvals)
        if (!a || !validDate(a.through) || typeof a.hash !== 'string' || !/^[a-f0-9]{8,64}$/.test(a.hash) || typeof a.by !== 'string' || !Number.isFinite(Date.parse(a.at)))
            throw Error('Invalid approval snapshot.');
    for (const h of value.history)
        if (!h || typeof h.by !== 'string' || typeof h.action !== 'string' || !['team', 'approve', 'close', 'reopen', 'preferences'].includes(h.action) || !Number.isFinite(Date.parse(h.at)) || (h.through && !validDate(h.through)))
            throw Error('Invalid workflow history.');
    return structuredClone({ ...controlDefaults(), ...value });
}
function actorFor(state, id = 'owner') {
    const actor = normalControls(state.controls).staff.find(s => s.id === id && s.active !== false);
    if (!actor)
        throw Error('Choose an active local profile.');
    return actor;
}
function canAct(role, action) {
    if (typeof role === 'object') return action === 'read' || effectiveRights(role).includes(action);
    if (action === 'read')
        return true;
    if (['restore', 'team', 'reopen'].includes(action))
        return role === 'admin';
    if (['approve', 'close'].includes(action))
        return ['admin', 'approver'].includes(role);
    return role !== 'viewer';
}
const isAccountingRecord = r => !['party', 'crew', 'maintenance', 'statement', 'match'].includes(r.kind);
function fingerprint(records, through) { return contentHash(JSON.stringify(records.filter(r => r.date <= through && isAccountingRecord(r)))); }
function assertMutation(state, actor, record, original = null, action = original ? 'edit' : 'write') {
    if (!canAct(actor, action))
        throw Error(actor.role === 'viewer' ? 'This user is read only.' : 'Your account does not have permission to ' + (RIGHTS[action] || action).toLowerCase() + '.');
    const closed = state.controls?.closedThrough;
    if (closed && [record, original].some(r => r && isAccountingRecord(r) && r.date <= closed))
        throw Error('This period is closed through ' + closed + '. An administrator must reopen it before changes.');
    if (original && actor.role === 'clerk' && original.enteredBy !== actor.id)
        throw Error('Clerks may correct only their own entries; ask a reviewer.');
}
function stamp(actor) { return { enteredBy: actor.id, enteredByName: actor.name }; }
function rowKey(value) { return contentHash(JSON.stringify(value)); }
function contentHash(text) {
    const source = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text) : Uint8Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0));
    const size = Math.ceil((source.length + 9) / 64) * 64, bytes = new Uint8Array(size);
    bytes.set(source);
    bytes[source.length] = 128;
    const view = new DataView(bytes.buffer);
    view.setUint32(size - 8, Math.floor(source.length * 8 / 4294967296));
    view.setUint32(size - 4, (source.length * 8) >>> 0);
    const constants = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), words = new Uint32Array(64), rotate = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < size; offset += 64) {
        for (let i = 0; i < 16; i++)
            words[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = words[i - 15], b = words[i - 2];
            words[i] = (words[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + words[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = hash;
        for (let i = 0; i < 64; i++) {
            const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) >>> 0, second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + first) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (first + second) >>> 0;
        }
        const result = [a, b, c, d, e, f, g, h];
        for (let i = 0; i < 8; i++)
            hash[i] = (hash[i] + result[i]) >>> 0;
    }
    return [...hash].map(n => n.toString(16).padStart(8, '0')).join('');
}

return {ROLES,RIGHTS,roleRights,effectiveRights,roleLabel,controlDefaults,normalControls,actorFor,canAct,isAccountingRecord,fingerprint,assertMutation,stamp,rowKey,contentHash};
})();
const Ledger=(()=>{
const {FINANCE_ACCOUNTS,FINANCE_TYPES,INCOME_CATEGORIES,EXPENSE_CATEGORIES,cents,shillings,validateFinance,resolveSource,sourceLimit,sourcePostings,validateFinancialLinks,financeCategory,journalFor,accountName,financeReport}=Finance;
const {BUSINESS_KINDS,BUSINESS_LABELS,validateBusiness,businessLookup,documentTotal,documentPayments,cashLeg,validateBusinessLinks,documentJournal,inventoryJournal,fullJournal,accountingName,accountingReport,partyOutstanding,statementSuggestions}=Business;
const BOATS = Array.from({ length: 15 }, (_, i) => 'Boat ' + (i + 1));
const kinds = ['boat', 'opening', 'purchase', 'sale', 'credit', 'donation', 'repayment', 'finance', ...BUSINESS_KINDS];
const labels = { boat: 'Daily boat record', opening: 'Opening stock', purchase: 'Fuel purchase', sale: 'Cash fuel sale', credit: 'Fuel on credit', donation: 'Fuel donation', repayment: 'Debt repayment', finance: 'Financial entry', ...BUSINESS_LABELS };
const money = (n) => 'KSh ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 3 });
function profit(r) { return { gross: r.boss - r.expenses, net: r.boss - r.expenses - r.commission }; }
function totals(records) {
    let stock = 0, debt = {}, income = 0, net = 0, cash = 0, donated = 0;
    for (const r of records.filter(r => !r.void)) {
        if (r.kind === 'boat') {
            income += r.income;
            net += profit(r).net;
        }
        if (['opening', 'purchase'].includes(r.kind))
            stock += r.litres;
        if (['sale', 'credit', 'donation'].includes(r.kind))
            stock -= r.litres;
        if (r.kind === 'credit')
            debt[r.boat] = (debt[r.boat] || 0) + r.litres;
        if (r.kind === 'repayment')
            debt[r.boat] = (debt[r.boat] || 0) - r.litres;
        if (['sale', 'repayment'].includes(r.kind))
            cash += r.cash;
        if (r.kind === 'donation')
            donated += r.litres;
    }
    return { stock, debt, income, net, cash, donated };
}
function validate(r) {
    if (!r || !kinds.includes(r.kind))
        throw Error('Choose a valid record type.');
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0, 10) !== r.date)
        throw Error('Enter a valid date.');
    if (BUSINESS_KINDS.includes(r.kind))
        return validateBusiness(r);
    if (r.kind === 'finance')
        return validateFinance(r);
    if (['boat', 'sale', 'credit', 'donation', 'repayment'].includes(r.kind) && !BOATS.includes(r.boat))
        throw Error('Choose a boat.');
    const fields = r.kind === 'boat' ? ['income', 'rent', 'uganda', 'fuelLitres', 'fuelCash', 'gowi', 'charging', 'amali', 'boss', 'expenses', 'commission'] : ['litres', ...(['purchase', 'sale', 'credit'].includes(r.kind) ? ['price'] : []), ...(['sale', 'repayment'].includes(r.kind) ? ['cash'] : [])];
    const clean = { kind: r.kind, date: r.date, boat: r.boat || '', note: String(r.note || '').slice(0, 1000) };
    for (const f of fields) {
        if (typeof r[f] !== 'number' || !Number.isFinite(r[f]) || r[f] < 0 || r[f] > 1e10)
            throw Error('Enter valid non-negative amounts.');
        clean[f] = Math.round(r[f] * 1000) / 1000;
    }
    if (r.kind !== 'boat' && clean.litres <= 0)
        throw Error('Litres must be greater than zero.');
    return clean;
}
function validateLedger(records) {
    let stock = 0;
    const debt = {};
    const days = new Set();
    for (const r of records.filter(r => !r.void).sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created))) {
        if (r.kind === 'boat') {
            const k = r.date + r.boat;
            if (days.has(k))
                throw Error('A daily record already exists for this boat and date. Void it before adding a correction.');
            days.add(k);
        }
        if (['opening', 'purchase'].includes(r.kind))
            stock += r.litres;
        if (['sale', 'credit', 'donation'].includes(r.kind))
            stock -= r.litres;
        if (stock < -.0001)
            throw Error('Insufficient fuel stock on ' + r.date + '. Record opening stock or a purchase first.');
        if (r.kind === 'credit')
            debt[r.boat] = (debt[r.boat] || 0) + r.litres;
        if (r.kind === 'repayment') {
            debt[r.boat] = (debt[r.boat] || 0) - r.litres;
            if (debt[r.boat] < -.0001)
                throw Error('Repayment exceeds outstanding litres for ' + r.boat + ' on ' + r.date + '.');
        }
    }
    validateFinancialLinks(records);
    validateBusinessLinks(records);
}

return {BOATS,kinds,labels,money,qty,profit,totals,validate,validateLedger};
})();
const Storage=(()=>{
const {BOATS,kinds,labels,money,qty,profit,totals,validate,validateLedger}=Ledger;
const {ROLES,RIGHTS,roleRights,effectiveRights,roleLabel,controlDefaults,normalControls,actorFor,canAct,isAccountingRecord,fingerprint,assertMutation,stamp,rowKey,contentHash}=Workflow;
const {BUSINESS_KINDS,BUSINESS_LABELS,validateBusiness,businessLookup,documentTotal,documentPayments,cashLeg,validateBusinessLinks,documentJournal,inventoryJournal,fullJournal,accountingName,accountingReport,partyOutstanding,statementSuggestions}=Business;
const empty = () => ({ schema: 1, version: 0, records: [], audit: [] });
function checkBackup(input) {
    if (!input || input.schema !== 1 || !Number.isSafeInteger(input.version) || input.version < 0 || !Array.isArray(input.records) || !Array.isArray(input.audit))
        throw Error('This is not a valid True Fish backup.');
    const ids = new Set();
    for (const r of input.records) {
        validate(r);
        if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(r.id) || ids.has(r.id) || typeof r.created !== 'string' || !Number.isFinite(Date.parse(r.created)) || (r.void !== undefined && typeof r.void !== 'boolean'))
            throw Error('Backup contains an invalid record.');
        ids.add(r.id);
    }
    const auditIds = new Set();
    for (const a of input.audit) {
        if (!a || typeof a.id !== 'string' || auditIds.has(a.id) || typeof a.at !== 'string' || !Number.isFinite(Date.parse(a.at)) || !['add', 'void'].includes(a.action) || typeof a.record !== 'string' || !ids.has(a.record))
            throw Error('Backup contains invalid activity history.');
        auditIds.add(a.id);
    }
    validateLedger(input.records);
    const result = structuredClone(input);
    result.controls = normalControls(input.controls);
    return result;
}
class BrowserLedger {
    constructor(storage, key = 'true-fish-pages-ledger-v1', locks = globalThis.navigator?.locks) { this.storage = storage; this.key = key; this.locks = locks; this.actorId = 'owner'; }
    read() {
        const text = this.storage.getItem(this.key);
        if (text === null)
            return empty();
        let data;
        try {
            data = JSON.parse(text);
        }
        catch {
            throw Error('Saved browser records could not be read. Restore a backup or the previous saved version from Settings. Do not clear browser data.');
        }
        return checkBackup(data);
    }
    readRecovery() {
        const text = this.storage.getItem(this.key + ':recovery');
        if (!text)
            return null;
        return checkBackup(JSON.parse(text));
    }
    commit(state, previous) {
        this.storage.setItem(this.key, JSON.stringify(state));
        if (previous) {
            try {
                this.storage.setItem(this.key + ':recovery', JSON.stringify(previous));
            }
            catch { /* Current save succeeded; recovery is best effort when storage is full. */ }
        }
        return state;
    }
    async locked(fn) {
        if (!this.locks)
            return fn();
        let entered = false;
        try {
            return await this.locks.request(this.key, () => { entered = true; return fn(); });
        }
        catch (e) {
            if (!entered && e.name === 'SecurityError')
                return fn();
            throw e;
        }
    }
    async save(payload, version) {
        return this.locked(() => {
            const state = this.read(), previous = structuredClone(state);
            if (state.version !== version)
                throw Error('Records changed in another tab. Close this dialog and refresh before saving.');
            state.controls = normalControls(state.controls);
            const actor = actorFor(state, this.actorId);
            const now = new Date().toISOString();
            let record;
            if (payload.action === 'add') {
                record = { ...validate(payload.record), ...stamp(actor), id: crypto.randomUUID(), created: now };
                assertMutation(state, actor, record);
                state.records.push(record);
            }
            else if (payload.action === 'void' || payload.action === 'replace') {
                const original = state.records.find(r => r.id === payload.id && !r.void);
                if (!original)
                    throw Error('Record not found.');
                if (typeof payload.reason !== 'string' || !payload.reason.trim())
                    throw Error('Give a reason for the correction.');
                assertMutation(state, actor, payload.action === 'replace' ? payload.record : original, original, payload.action === 'void' ? 'void' : 'edit');
                original.void = true;
                original.voidReason = payload.reason.trim().slice(0, 300);
                record = original;
                if (payload.action === 'replace') {
                    if (payload.record?.kind !== original.kind)
                        throw Error('A correction must keep the original record type.');
                    record = { ...validate(payload.record), id: crypto.randomUUID(), created: original.created, correctedAt: now, replaces: original.id, ...(original.importKey ? { importKey: original.importKey } : {}), ...stamp(actor) };
                    state.records.splice(state.records.indexOf(original) + 1, 0, record);
                    state.audit.unshift({ id: crypto.randomUUID(), at: now, action: 'void', record: original.id, reason: original.voidReason, actor: actor.name });
                }
            }
            else
                throw Error('Unknown action.');
            validateLedger(state.records);
            state.audit.unshift({ id: crypto.randomUUID(), at: now, action: payload.action === 'void' ? 'void' : 'add', record: record.id, reason: String(payload.reason || '').slice(0, 300), actor: actor.name });
            state.version++;
            return this.commit(state, previous);
        });
    }
    async restore(backup, version) {
        const restored = checkBackup(backup);
        return this.locked(() => {
            let current;
            try {
                current = this.read();
            }
            catch (e) {
                if (version !== null)
                    throw e;
                current = null;
            }
            if (!canAct(actorFor(current || { controls: normalControls() }, this.actorId), 'restore'))
                throw Error('Only a local administrator can restore backups.');
            if (current && current.version !== version)
                throw Error('Records changed in another tab. Refresh before restoring.');
            restored.version = (current?.version || 0) + 1;
            if (current) restored.controls = structuredClone(current.controls);
            return this.commit(restored, current);
        });
    }
    async saveBatch(inputs, version) {
        return this.locked(() => {
            const state = this.read(), previous = structuredClone(state);
            state.controls = normalControls(state.controls);
            const actor = actorFor(state, this.actorId);
            if (state.version !== version)
                throw Error('Records changed; refresh the import preview.');
            if (!canAct(actor, 'import')) throw Error('Your account cannot import records.');
            if (!Array.isArray(inputs) || !inputs.length || inputs.length > 1000)
                throw Error('Import 1–1000 rows at a time.');
            for (const [index, input] of inputs.entries()) {
                const clean = validate(input), key = 'import:' + rowKey(clean);
                const record = { ...clean, ...stamp(actor), importKey: key, id: crypto.randomUUID(), created: new Date(Date.now() + index).toISOString() };
                assertMutation(state, actor, record, null, 'import');
                state.records.push(record);
                state.audit.unshift({ id: crypto.randomUUID(), at: record.created, action: 'add', record: record.id, reason: 'Imported after preview', actor: actor.name });
            }
            validateLedger(state.records);
            state.version++;
            return this.commit(state, previous);
        });
    }
    async control(action, values, version) {
        return this.locked(() => {
            const state = this.read(), previous = structuredClone(state);
            if (state.version !== version)
                throw Error('Records changed. Refresh and try again.');
            state.controls = normalControls(state.controls);
            const actor = actorFor(state, this.actorId);
            if (!canAct(actor, action))
                throw Error('This action requires an administrator / reviewer profile.');
            const c = state.controls, at = new Date().toISOString();
            if (action === 'team') {
                const name = String(values.name || '').trim().slice(0, 80), role = values.role;
                if (!name || !['admin', 'approver', 'clerk', 'viewer'].includes(role))
                    throw Error('Enter name and role.');
                const existing = c.staff.find(s => s.id === values.id);
                if (existing?.id === 'owner' && actor.id !== 'owner') throw Error('Only the super administrator can change the owner account.');
                if (values.id && !existing) throw Error('User not found.');
                const permissions = values.permissions === undefined ? undefined : values.permissions;
                if (permissions !== undefined && (!Array.isArray(permissions) || permissions.some(p => !Object.hasOwn(RIGHTS, p)) || new Set(permissions).size !== permissions.length)) throw Error('Invalid user permissions.');
                if (actor.id !== 'owner' && permissions?.some(p => !canAct(actor, p))) throw Error('You cannot grant rights you do not have.');
                if (actor.id !== 'owner' && (permissions || roleRights(role)).some(p => !canAct(actor, p))) throw Error('You cannot grant rights you do not have.');
                if (actor.id !== 'owner' && role === 'admin' && actor.role !== 'admin') throw Error('Only an administrator can create another administrator.');
                if (existing?.id === 'owner' && (role !== 'admin' || values.active === false))
                    throw Error('The owner administrator must remain active.');
                if (c.staff.some(s => s.id !== values.id && s.name.toLowerCase() === name.toLowerCase()))
                    throw Error('That profile name already exists.');
                if (existing)
                    Object.assign(existing, { name, role, active: values.active !== false, ...(permissions === undefined ? {} : { permissions }) });
                else
                    c.staff.push({ id: crypto.randomUUID(), name, role, active: values.active !== false, ...(permissions === undefined ? {} : { permissions }) });
            }
            else if (action === 'approve' || action === 'close') {
                const through = values.through;
                if (typeof through !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(through) || !Number.isFinite(Date.parse(through)) || new Date(through).toISOString().slice(0, 10) !== through)
                    throw Error('Choose a valid period-end date.');
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                if (through > today)
                    throw Error('Cannot approve or close a future period.');
                if (inventoryJournal(state.records, through).unvalued.length)
                    throw Error('Value opening fuel before approving or closing accounting figures.');
                if (accountingReport(state.records, { end: through }).balanceDifference !== 0)
                    throw Error('Financial statements do not balance; review them before approval.');
                const hash = fingerprint(state.records, through);
                if (action === 'approve')
                    c.approvals.unshift({ through, hash, by: actor.name, at });
                else {
                    if (through < (c.closedThrough || ''))
                        throw Error('Use Reopen to change earlier periods.');
                    if (!c.approvals.some(a => a.through === through && a.hash === hash))
                        throw Error('Review and approve these exact figures before closing.');
                    c.closedThrough = through;
                }
            }
            else if (action === 'reopen') {
                if (!String(values.reason || '').trim())
                    throw Error('Give a reason for reopening.');
                c.closedThrough = '';
            }
            else
                throw Error('Unknown workflow action.');
            c.history.unshift({ id: crypto.randomUUID(), action, by: actor.name, at, through: values.through || '', reason: String(values.reason || '').slice(0, 300) });
            state.version++;
            return this.commit(state, previous);
        });
    }
}

return {checkBackup,BrowserLedger};
})();
const Analytics=(()=>{
const {BOATS,kinds,labels,money,qty,profit,totals,validate,validateLedger}=Ledger;
function dateRange(period, date) {
    const day = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(day.getTime()))
        throw Error('Invalid date.');
    const end = date;
    let start = '';
    if (period === 'today')
        start = date;
    if (period === 'week') {
        day.setUTCDate(day.getUTCDate() - 6);
        start = day.toISOString().slice(0, 10);
    }
    if (period === 'month')
        start = date.slice(0, 8) + '01';
    return { start, end: period === 'all' ? '' : end };
}
function reconcile(records) { const rows = records.filter(r => !r.void); const sum = (kind, fn) => rows.filter(r => r.kind === kind).reduce((n, r) => n + fn(r), 0); return { purchased: sum('purchase', r => r.litres), purchaseCost: sum('purchase', r => r.litres * r.price), sold: sum('sale', r => r.litres), salesValue: sum('sale', r => r.litres * r.price), salesCash: sum('sale', r => r.cash), credit: sum('credit', r => r.litres), creditValue: sum('credit', r => r.litres * r.price), donated: sum('donation', r => r.litres), repaymentCash: sum('repayment', r => r.cash), get variance() { return this.salesValue - this.salesCash; } }; }
function stockMovements(records) { let balance = 0; return records.filter(r => !r.void && ['opening', 'purchase', 'sale', 'credit', 'donation'].includes(r.kind)).slice().sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created)).map(r => { const incoming = ['opening', 'purchase'].includes(r.kind) ? r.litres : 0, outgoing = incoming ? 0 : r.litres; balance += incoming - outgoing; return { ...r, incoming, outgoing, balance }; }); }
function daySummary(records, date) { const rows = records.filter(r => !r.void && r.date === date), boats = rows.filter(r => r.kind === 'boat'), recorded = new Set(boats.map(r => r.boat)); return { date, records: rows, boats: boats.length, missing: BOATS.filter(b => !recorded.has(b)), ...totals(rows), fuel: reconcile(rows) }; }
function trend(records, end, days = 14) {
    const day = new Date(end + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() - days + 1);
    const byDay = new Map();
    for (const r of records) {
        if (r.void || r.kind !== 'boat')
            continue;
        const values = byDay.get(r.date) || { income: 0, net: 0 };
        values.income += r.income;
        values.net += profit(r).net;
        byDay.set(r.date, values);
    }
    return Array.from({ length: days }, () => { const date = day.toISOString().slice(0, 10), values = byDay.get(date) || { income: 0, net: 0 }; day.setUTCDate(day.getUTCDate() + 1); return { date, ...values }; });
}
function cleanPreferences(value = {}) { const finite = (n, fallback) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e8 ? n : fallback; return { company: String(value.company || 'True Fish Ent.').trim().slice(0, 80) || 'True Fish Ent.', fuelPrice: finite(value.fuelPrice, 200), lowStock: finite(value.lowStock, 0), commissionRate: typeof value.commissionRate === 'number' && value.commissionRate >= 0 && value.commissionRate <= 100 ? value.commissionRate : null }; }

return {dateRange,reconcile,stockMovements,daySummary,trend,cleanPreferences};
})();
const Imports=(()=>{
const {BOATS,kinds,labels,money,qty,profit,totals,validate,validateLedger}=Ledger;
const {ROLES,RIGHTS,roleRights,effectiveRights,roleLabel,controlDefaults,normalControls,actorFor,canAct,isAccountingRecord,fingerprint,assertMutation,stamp,rowKey,contentHash}=Workflow;
// Local-only CSV and XLSX reader. File contents are never uploaded.
const decodeXml = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, v) => v[0] === '#' ? String.fromCodePoint(v[1].toLowerCase() === 'x' ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[v.toLowerCase()]));
function parseCsv(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    const input = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (c === '"') {
            if (quoted && input[i + 1] === '"') {
                value += '"';
                i++;
            }
            else if (quoted || value === '')
                quoted = !quoted;
            else
                value += c;
        }
        else if (c === ',' && !quoted) {
            row.push(value);
            value = '';
        }
        else if ((c === '\n' || c === '\r') && !quoted) {
            if (c === '\r' && input[i + 1] === '\n')
                i++;
            row.push(value);
            if (row.some(v => v !== ''))
                rows.push(row);
            row = [];
            value = '';
        }
        else
            value += c;
    }
    if (quoted)
        throw Error('CSV has an unclosed quoted field.');
    row.push(value);
    if (row.some(v => v !== ''))
        rows.push(row);
    if (rows.length > 20000)
        throw Error('File has too many rows; split it into smaller files.');
    return rows;
}
function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return (crc ^ -1) >>> 0;
}
async function unzip(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length > 20000000)
        throw Error('Maximum workbook size is 20 MB.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
        if (view.getUint32(i, true) === 0x06054b50) {
            end = i;
            break;
        }
    if (end < 0)
        throw Error('This is not a valid XLSX ZIP file.');
    const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
    if (count > 500 || offset >= bytes.length)
        throw Error('Unsupported workbook directory.');
    const files = new Map();
    let cursor = offset, total = 0;
    for (let i = 0; i < count; i++) {
        if (view.getUint32(cursor, true) !== 0x02014b50)
            throw Error('Invalid workbook directory.');
        const flag = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), crc = view.getUint32(cursor + 16, true), compressed = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true), nameLength = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true), local = view.getUint32(cursor + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
        cursor += 46 + nameLength + extra + comment;
        total += size;
        if (flag & 1 || total > 50000000 || size > 20000000)
            throw Error('Encrypted or oversized workbook is not supported.');
        if (!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name))
            continue;
        if (view.getUint32(local, true) !== 0x04034b50)
            throw Error('Invalid workbook entry.');
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        let data = bytes.slice(start, start + compressed);
        if (data.length !== compressed)
            throw Error('Truncated workbook.');
        if (method === 8) {
            if (typeof DecompressionStream === 'undefined')
                throw Error('This browser cannot open XLSX. Save the sheet as CSV instead.');
            const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            const reader = stream.getReader(), chunks = [];
            let length = 0;
            while (true) {
                const next = await reader.read();
                if (next.done)
                    break;
                length += next.value.length;
                if (length > size || length > 20000000) {
                    await reader.cancel();
                    throw Error('Workbook decompression exceeded its declared size.');
                }
                chunks.push(next.value);
            }
            data = new Uint8Array(length);
            let position = 0;
            for (const chunk of chunks) {
                data.set(chunk, position);
                position += chunk.length;
            }
        }
        else if (method !== 0)
            throw Error('Unsupported workbook compression.');
        if (data.length !== size || crc32(data) !== crc)
            throw Error('Workbook data is damaged.');
        files.set(name, new TextDecoder().decode(data));
    }
    return files;
}
const attribute = (text, name) => decodeXml(text.match(new RegExp('(?:^|\\s)' + name + '=["\']([^"\']*)["\']'))?.[1] || '');
const cellColumn = reference => {
    let n = 0;
    for (const c of reference.replace(/\d/g, ''))
        n = n * 26 + c.charCodeAt(0) - 64;
    return n - 1;
};
async function readXlsx(buffer) {
    const files = await unzip(buffer), workbook = files.get('xl/workbook.xml'), relationships = files.get('xl/_rels/workbook.xml.rels');
    if (!workbook || !relationships)
        throw Error('Workbook metadata is missing.');
    const rels = new Map([...relationships.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].map(m => [attribute(m[1], 'Id'), attribute(m[1], 'Target')]));
    const strings = [...(files.get('xl/sharedStrings.xml') || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t => decodeXml(t[1])).join(''));
    const sheets = [];
    for (const match of workbook.matchAll(/<sheet\b([^>]+)\/?\s*>/g)) {
        const name = attribute(match[1], 'name'), id = attribute(match[1], 'r:id'), target = rels.get(id) || '';
        const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
        const xml = files.get(path);
        if (!xml)
            continue;
        const rows = [];
        for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
            const index = Number(attribute(rowMatch[1], 'r')) - 1;
            if (index > 20000)
                throw Error('Worksheet exceeds 20,000 rows.');
            const row = [];
            for (const cell of rowMatch[2].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
                const col = cellColumn(attribute(cell[1], 'r'));
                if (col < 0 || col > 200)
                    continue;
                const type = attribute(cell[1], 't'), body = cell[2] || '', raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
                let value = '';
                if (type === 's')
                    value = strings[Number(raw)] ?? '';
                else if (type === 'inlineStr')
                    value = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decodeXml(m[1])).join('');
                else if (type === 'e')
                    value = '[Excel error: ' + decodeXml(raw) + ']';
                else if (raw !== undefined)
                    value = type === 'str' ? decodeXml(raw) : raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : decodeXml(raw);
                else if (/<f\b/.test(body))
                    value = '[Formula has no saved value]';
                row[col] = value;
            }
            rows[index >= 0 ? index : rows.length] = row;
        }
        sheets.push({ name, rows: Array.from({ length: rows.length }, (_, i) => rows[i] || []), date1904: /date1904=["'](?:1|true)["']/.test(workbook) });
    }
    if (!sheets.length)
        throw Error('No readable worksheets were found.');
    return sheets;
}
function importDate(value, format = 'DMY', date1904 = false) {
    if (typeof value === 'number') {
        if (value < 0 || value > 200000)
            throw Error('Invalid Excel date.');
        return new Date((date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
    }
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(text).toISOString().slice(0, 10) === text)
        return text;
    const parts = text.split(/[\/\-.\s]/).filter(Boolean);
    if (parts.length >= 3 && /^\d{1,2}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]) && /^\d{4}$/.test(parts[2])) {
        const [d, m] = format === 'MDY' ? [Number(parts[1]), Number(parts[0])] : [Number(parts[0]), Number(parts[1])];
        const result = parts[2] + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        if (Number.isFinite(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result)
            return result;
    }
    throw Error('Invalid or missing date. Choose the date format or supply an explicit date.');
}
function importNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    const s = String(value ?? '').trim().replace(/^KSh\s*/i, '').replace(/,/g, '');
    if (!s || !/^[-+]?\d+(?:\.\d+)?$/.test(s))
        throw Error('Missing or invalid number.');
    return Number(s);
}
const IMPORT_FIELDS = { boat: ['date', 'boat', 'income', 'rent', 'uganda', 'fuelLitres', 'fuelCash', 'gowi', 'charging', 'amali', 'boss', 'expenses', 'commission', 'note'], purchase: ['date', 'litres', 'price', 'note'], sale: ['date', 'boat', 'litres', 'price', 'cash', 'note'], credit: ['date', 'boat', 'litres', 'price', 'note'], donation: ['date', 'boat', 'litres', 'note'], repayment: ['date', 'boat', 'litres', 'cash', 'note'], finance_income: ['date', 'amount', 'counterparty', 'reference', 'note'], finance_expense: ['date', 'amount', 'counterparty', 'reference', 'note'], statement: ['date', 'amount', 'moneyIn', 'moneyOut', 'reference', 'description'], party_customer: ['name', 'phone', 'email', 'address'], party_supplier: ['name', 'phone', 'email', 'address'], invoice: ['date', 'partyName', 'number', 'amount', 'taxAmount', 'dueDate', 'note'], bill: ['date', 'partyName', 'number', 'amount', 'taxAmount', 'dueDate', 'note'], crew: ['name', 'position', 'boat', 'phone'], payroll: ['date', 'crewName', 'amount', 'period', 'note'], maintenance: ['date', 'boat', 'title', 'dueDate', 'status', 'amount', 'note'] };
const IMPORT_NAMES = { boat: 'Daily boat records', purchase: 'Fuel purchases', sale: 'Cash fuel sales', credit: 'Fuel on credit', donation: 'Fuel donations', repayment: 'Fuel repayments', finance_income: 'Additional business income', finance_expense: 'Additional operating expenses', statement: 'Bank / M-Pesa statement', party_customer: 'Customers', party_supplier: 'Suppliers', invoice: 'Customer invoices', bill: 'Operating supplier bills', crew: 'Crew members', payroll: 'Earned crew wages', maintenance: 'Maintenance tasks' };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function guessMapping(headers, kind) {
    const aliases = { income: ['totalincome', 'income'], fuelLitres: ['fuelltr', 'fuelltrs', 'fuellitres'], charging: ['charginghome', 'charging'], commission: ['commission', 'commissions', 'comissions', 'comission'], price: kind === 'purchase' ? ['unitcostperpurch', 'unitcostperpurchase', 'price'] : ['unitcostpersale', 'price'], litres: kind === 'purchase' ? ['fuelltrspurchased', 'litrespurchased', 'litres'] : ['litres', 'qty', 'totalqtysold'], partyName: ['party', 'customer', 'supplier', 'name'], crewName: ['crew', 'crewmember', 'name'], amount: ['amount', 'total', 'wages'], cash: ['cash', 'cashreceived', 'totalcashreceived'], moneyIn: ['moneyin', 'credit', 'paidin'], moneyOut: ['moneyout', 'debit', 'paidout', 'withdrawn'], reference: ['reference', 'receiptno', 'transactionid'] };
    const result = {};
    for (const field of IMPORT_FIELDS[kind] || []) {
        const keys = [norm(field), ...(aliases[field] || [])];
        result[field] = headers.findIndex(h => keys.includes(norm(h)));
    }
    return result;
}
function mapImportRows(sheet, config, references = []) {
    const fields = IMPORT_FIELDS[config.kind];
    if (!fields)
        throw Error('Choose an import type.');
    const start = Math.max(0, config.start - 1), end = Math.min(sheet.rows.length, config.end);
    if (end - start > 1000)
        throw Error('Preview at most 1000 worksheet rows at a time.');
    const seen = new Set(references.filter(r => !r.void && r.importKey).map(r => r.importKey));
    let previousDate = '';
    const rows = [];
    for (let index = start; index < end; index++) {
        const raw = sheet.rows[index] || [];
        if (!raw.some(v => v !== '' && v !== undefined))
            continue;
        const get = f => config.mapping[f] >= 0 ? raw[config.mapping[f]] ?? '' : '';
        try {
            let kind = config.kind;
            const record = { kind, date: config.defaultDate || '' };
            for (const field of fields)
                record[field] = get(field);
            if (kind.startsWith('party_')) {
                record.kind = 'party';
                record.partyType = kind.split('_')[1];
            }
            if (kind.startsWith('finance_')) {
                record.kind = 'finance';
                record.transactionType = kind.split('_')[1];
                record.account = config.account;
                record.category = record.transactionType === 'income' ? 'Other business income' : 'General expenses';
            }
            if (['party', 'crew'].includes(record.kind))
                record.date = config.defaultDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            else {
                const value = config.defaultDate || get('date') || (config.fillDate ? previousDate : '');
                record.date = importDate(value, config.dateFormat, sheet.date1904);
                previousDate = record.date;
            }
            if ('boat' in record) {
                const boat = String(record.boat || config.boat || '').trim();
                record.boat = /^(?:boat\s*)?(\d{1,2})$/i.test(boat) ? 'Boat ' + boat.match(/\d+/)[0] : boat;
            }
            if (record.kind === 'statement' && record.amount === '')
                record.amount = importNumber(record.moneyIn || 0) - importNumber(record.moneyOut || 0);
            const numbers = ['income', 'rent', 'uganda', 'fuelLitres', 'fuelCash', 'gowi', 'charging', 'amali', 'boss', 'expenses', 'commission', 'litres', 'price', 'cash', 'amount', 'taxAmount'];
            for (const field of numbers)
                if (field in record) {
                    const optional = ['rent', 'uganda', 'fuelLitres', 'fuelCash', 'gowi', 'charging', 'amali', 'expenses', 'taxAmount'].includes(field);
                    record[field] = record[field] === '' && optional ? 0 : importNumber(record[field]);
                }
            if (['invoice', 'bill', 'maintenance'].includes(record.kind))
                record.dueDate = importDate(record.dueDate || config.dueDate, config.dateFormat, sheet.date1904);
            if (['invoice', 'bill'].includes(record.kind)) {
                const party = references.find(r => !r.void && r.kind === 'party' && r.name.toLowerCase() === String(record.partyName).trim().toLowerCase());
                if (!party)
                    throw Error('Add this customer / supplier before importing its documents.');
                record.partyId = party.id;
                record.category = 'expense';
                record.opening = false;
            }
            if (record.kind === 'payroll') {
                const crew = references.find(r => !r.void && r.kind === 'crew' && r.name.toLowerCase() === String(record.crewName).trim().toLowerCase());
                if (!crew)
                    throw Error('Add this crew member first.');
                record.crewId = crew.id;
            }
            if (record.kind === 'statement')
                record.account = config.account;
            if (record.kind === 'maintenance')
                record.status = record.status || 'planned';
            const clean = validate(record), key = 'import:' + rowKey(clean);
            if (seen.has(key))
                throw Error('Identical imported row already exists.');
            seen.add(key);
            rows.push({ row: index + 1, record: clean, error: '' });
        }
        catch (e) {
            rows.push({ row: index + 1, record: null, error: e.message });
        }
    }
    return rows;
}

return {parseCsv,readXlsx,importDate,importNumber,IMPORT_FIELDS,IMPORT_NAMES,guessMapping,mapImportRows};
})();
const Intelligence=(()=>{
const {BUSINESS_KINDS,BUSINESS_LABELS,validateBusiness,businessLookup,documentTotal,documentPayments,cashLeg,validateBusinessLinks,documentJournal,inventoryJournal,fullJournal,accountingName,accountingReport,partyOutstanding,statementSuggestions}=Business;
const {FINANCE_ACCOUNTS,FINANCE_TYPES,INCOME_CATEGORIES,EXPENSE_CATEGORIES,cents,shillings,validateFinance,resolveSource,sourceLimit,sourcePostings,validateFinancialLinks,financeCategory,journalFor,accountName,financeReport}=Finance;
const {BOATS,kinds,labels,money,qty,profit,totals,validate,validateLedger}=Ledger;

const sum = (rows, key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
const ksh = n => 'KSh ' + (n / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 });
function intelligenceSnapshot(records, asOf) {
    const active = records.filter(r => !r.void && r.date <= asOf);
    const month = asOf.slice(0, 7) + '-01', period = active.filter(r => r.date >= month);
    const cash = financeReport(active), accounts = Object.entries(cash.balances).map(([account, balance]) => ({ account, balance }));
    const accounting = accountingReport(active, { start: month, end: asOf }), operations = totals(active);
    const receivables = partyOutstanding(active, 'invoice', asOf).filter(r => r.balance > 0);
    const payables = partyOutstanding(active, 'bill', asOf).filter(r => r.balance > 0);
    const overdueInvoices = receivables.filter(r => r.overdue), overdueBills = payables.filter(r => r.overdue);
    const matches = new Set(active.filter(r => r.kind === 'match').map(r => businessLookup(records, r.statementId)?.id));
    const unmatched = active.filter(r => r.kind === 'statement' && !matches.has(r.id));
    const maintenance = active.filter(r => r.kind === 'maintenance' && r.status !== 'done' && r.dueDate <= asOf);
    const boats = period.filter(r => r.kind === 'boat'), losses = boats.filter(r => profit(r).net < 0);
    const monthCash = financeReport(active, { start: month, end: asOf });
    const previousDate = new Date(asOf + 'T12:00:00Z'); previousDate.setUTCDate(1); previousDate.setUTCDate(0);
    const previousEnd = previousDate.toISOString().slice(0, 10), previousStart = previousEnd.slice(0, 7) + '-01';
    const previous = accountingReport(active, { start: previousStart, end: previousEnd });
    const thirtyStart = new Date(asOf + 'T12:00:00Z'); thirtyStart.setUTCDate(thirtyStart.getUTCDate() - 29);
    const usageRows = active.filter(r => r.date >= thirtyStart.toISOString().slice(0, 10) && ['sale', 'credit', 'donation'].includes(r.kind));
    const averageDailyFuel = sum(usageRows, 'litres') / 30;
    const availableCash = sum(accounts, 'balance');
    const nextDate = new Date(asOf + 'T12:00:00Z'); nextDate.setUTCDate(nextDate.getUTCDate() + 30);
    const horizon = nextDate.toISOString().slice(0, 10);
    const dueInvoices = receivables.filter(r => r.dueDate <= horizon), dueBills = payables.filter(r => r.dueDate <= horizon);
    const payrollDue = [...accounting.balances].filter(([a]) => a.startsWith('L:Crew')).reduce((n, [, v]) => n - v, 0);
    const scenario = availableCash + sum(dueInvoices, 'balance') - sum(dueBills, 'balance') - payrollDue;
    const findings = [];
    const add = (severity, title, detail, tab, ids = []) => findings.push({ severity, title, detail, tab, ids });
    if (!active.length) add('info', 'Start with opening balances', 'Add confirmed Cash, M-Pesa, Bank and fuel opening balances before interpreting reports.', 'Finances');
    if (overdueInvoices.length) add('warning', 'Customer collections need attention', `${overdueInvoices.length} overdue invoices total ${ksh(sum(overdueInvoices, 'balance'))}. Review payments before contacting customers.`, 'Customers & bills', overdueInvoices.map(r => r.id));
    if (overdueBills.length) add('warning', 'Supplier bills are overdue', `${overdueBills.length} overdue bills total ${ksh(sum(overdueBills, 'balance'))}. Plan payments against available cash.`, 'Customers & bills', overdueBills.map(r => r.id));
    for (const account of accounts.filter(a => a.balance < 0)) add('warning', 'Review negative ' + account.account + ' balance', `Recorded balance is ${ksh(account.balance)}. Check opening balances, missing receipts and duplicate payments.`, 'Finances');
    if (accounting.inventory.unvalued.length) add('warning', 'Opening fuel needs a cost', 'Fuel valuation and profit are incomplete until every opening fuel quantity has a confirmed unit cost.', 'Accounting', accounting.inventory.unvalued.map(r => typeof r === 'string' ? r : r.id).filter(Boolean));
    if (averageDailyFuel > 0 && operations.stock / averageDailyFuel < 7) add('warning', 'Fuel cover is below seven days', `${operations.stock.toFixed(1)} L on hand; about ${(operations.stock / averageDailyFuel).toFixed(1)} days at the last 30 calendar days’ average issues. This is a usage estimate.`, 'Fuel stock', usageRows.map(r => r.id));
    if (maintenance.length) add('warning', 'Boat service is due', `${maintenance.length} planned maintenance jobs are due or overdue. Estimates are not expenses until posted.`, 'Crew & maintenance', maintenance.map(r => r.id));
    if (unmatched.length) add('info', 'Statement lines await matching', `${unmatched.length} statement lines have no confirmed cashbook match. Review suggestions before matching.`, 'Imports & matching', unmatched.map(r => r.id));
    if (losses.length) add('warning', 'Review loss-making boat days', `${losses.length} boat days this month have negative net boat profit under the Boss − expenses − commission formula.`, 'Boat records', losses.map(r => r.id));
    if (accounting.balanceDifference !== 0) add('warning', 'Financial statements do not balance', `Difference: ${ksh(accounting.balanceDifference)}. Review the accounting ledger before approving the period.`, 'Accounting');
    if (active.length && !findings.length) add('good', 'No issues in the built-in checks', 'No overdue documents, unmatched statement lines, due maintenance or negative cash balances were found. This does not confirm that every transaction has been entered.', 'Review & staff');
    return { asOf, month, recordCount: active.length, accounts, availableCash, income: sum(accounting.income, 'amount'), expenses: sum(accounting.expenses, 'amount'), net: accounting.net, previousNet: previous.net, receipts: monthCash.receipts, payments: monthCash.payments, receivables: sum(receivables, 'balance'), payables: sum(payables, 'balance'), overdueReceivables: sum(overdueInvoices, 'balance'), overduePayables: sum(overdueBills, 'balance'), fuelLitres: operations.stock, fuelDebtLitres: Object.values(operations.debt).reduce((n, v) => n + v, 0), fuelDays: averageDailyFuel > 0 ? operations.stock / averageDailyFuel : null, payrollDue, dueCollections: sum(dueInvoices, 'balance'), duePayments: sum(dueBills, 'balance'), scenario, horizon, findings, valuationIncomplete: accounting.inventory.unvalued.length > 0, unmatchedCount: unmatched.length, overdueCount: overdueInvoices.length + overdueBills.length, maintenanceCount: maintenance.length };
}
function answerFromRecords(question, snapshot) {
    const q = String(question || '').toLowerCase();
    if (/fuel|litre|stock|diesel|petrol/.test(q)) return { text: `Fuel on hand is ${snapshot.fuelLitres.toFixed(2)} L. Outstanding fuel debt is ${snapshot.fuelDebtLitres.toFixed(2)} L. ${snapshot.fuelDays === null ? 'There are no fuel issues in the last 30 calendar days to estimate stock cover.' : `Estimated cover is ${snapshot.fuelDays.toFixed(1)} days using the last 30 calendar days’ average issues; future demand may differ.`}`, tab: 'Fuel stock' };
    if (/forecast|future|30 day|scenario|runway/.test(q)) return { text: `The 30-day collection scenario ends at ${ksh(snapshot.scenario)}: recorded cash ${ksh(snapshot.availableCash)} + unpaid invoices due by ${snapshot.horizon} ${ksh(snapshot.dueCollections)} − bills due by then ${ksh(snapshot.duePayments)} − accrued unpaid crew wages ${ksh(snapshot.payrollDue)}. It assumes full collection and payment, includes overdue items, and excludes new trading, fuel receivables, loans and unrecorded costs. This is a scenario, not a prediction.`, tab: 'Accounting' };
    if (/profit|income|expense|perform/.test(q)) return { text: `From ${snapshot.month} to ${snapshot.asOf}, recorded accounting income is ${ksh(snapshot.income)}, expenses ${ksh(snapshot.expenses)}, and net result ${ksh(snapshot.net)}. Last full calendar month’s net result was ${ksh(snapshot.previousNet)}; the current month may be incomplete. Boat operational profit is a separate measure.${snapshot.valuationIncomplete ? ' Opening fuel costs are missing, so these results are incomplete.' : ''}`, tab: 'Accounting' };
    if (/invoice|customer|collect|receiv|owed/.test(q)) return { text: `Unpaid customer invoices total ${ksh(snapshot.receivables)}, including ${ksh(snapshot.overdueReceivables)} overdue. Fuel customer balances are separate. Review the underlying invoices and existing receipts before collecting.`, tab: 'Customers & bills' };
    if (/bill|supplier|payable|wage|payroll/.test(q)) return { text: `Unpaid supplier bills total ${ksh(snapshot.payables)}, with ${ksh(snapshot.overduePayables)} overdue. Accrued unpaid crew wages are ${ksh(snapshot.payrollDue)}. Check available account balances before paying.`, tab: 'Customers & bills' };
    if (/cash|bank|money|mpesa|m-pesa/.test(q)) return { text: `Recorded cash across accounts is ${ksh(snapshot.availableCash)}: ${snapshot.accounts.map(a => `${a.account} ${ksh(a.balance)}`).join(', ')}. This month’s operating cash receipts are ${ksh(snapshot.receipts)} and payments ${ksh(snapshot.payments)}. Only entered cashbook postings are included; compare with actual balances.`, tab: 'Finances' };
    if (/risk|issue|attention|check|priority|action/.test(q)) return { text: snapshot.findings.map(f => `${f.title}: ${f.detail}`).join('\n\n'), tab: snapshot.findings[0]?.tab || 'Overview' };
    if (/summary|brief|business|overview|today/.test(q)) return { text: `As of ${snapshot.asOf}, ${snapshot.recordCount} active dated records are included. Recorded cash: ${ksh(snapshot.availableCash)}. Month-to-date accounting net result: ${ksh(snapshot.net)}. Unpaid invoices: ${ksh(snapshot.receivables)}. Unpaid bills: ${ksh(snapshot.payables)}. Fuel stock: ${snapshot.fuelLitres.toFixed(2)} L. ${snapshot.findings[0]?.detail || ''}${snapshot.valuationIncomplete ? ' Missing opening fuel costs make accounting results incomplete.' : ''}`, tab: 'Overview' };
    return { text: 'I can explain recorded cash, profit, overdue invoices, supplier bills, payroll, fuel stock, checks needing attention, or the 30-day cash scenario. Try “What needs my attention?” or “Explain my profit”. For open-ended questions, enable the optional local AI in server mode.', tab: 'Overview' };
}

return {intelligenceSnapshot,answerFromRecords};
})();
const Receipts=(()=>{
const {FINANCE_ACCOUNTS,FINANCE_TYPES,INCOME_CATEGORIES,EXPENSE_CATEGORIES,cents,shillings,validateFinance,resolveSource,sourceLimit,sourcePostings,validateFinancialLinks,financeCategory,journalFor,accountName,financeReport}=Finance;
const {BUSINESS_KINDS,BUSINESS_LABELS,validateBusiness,businessLookup,documentTotal,documentPayments,cashLeg,validateBusinessLinks,documentJournal,inventoryJournal,fullJournal,accountingName,accountingReport,partyOutstanding,statementSuggestions}=Business;

function isReceiptRecord(record) {
    return record?.kind === 'finance' && ['income', 'source_receipt', 'invoice_receipt', 'capital', 'loan_in'].includes(record.transactionType) && cents(record.amount) > 0;
}
function receiptNumber(record) { return 'TF-R-' + record.date.replaceAll('-', '') + '-' + record.id; }
function receiptFor(records, id, company) {
    const record = records.find(r => r.id === id);
    if (!isReceiptRecord(record)) throw Error('Receipts require a saved incoming cashbook payment. Opening balances, transfers and unpaid invoices are not payment receipts.');
    const source = record.sourceId ? resolveSource(records, record.sourceId) : null;
    const invoice = record.documentId ? businessLookup(records, record.documentId, 'invoice') : null;
    const party = invoice ? businessLookup(records, invoice.partyId, 'party') : null;
    const replacement = records.find(r => r.replaces === record.id);
    return { number: receiptNumber(record), recordId: record.id, date: record.date, company: String(company || 'True Fish Ent.'), payer: record.counterparty || party?.name || source?.boat || 'Not recorded', boat: source?.boat || '', amount: cents(record.amount), method: FINANCE_ACCOUNTS[record.account], reference: record.reference || '', description: invoice ? 'Payment towards invoice ' + invoice.number : source ? 'Payment towards ' + (source.kind === 'boat' ? 'boat income' : source.kind === 'sale' ? 'fuel sale' : 'fuel debt repayment') + (source.boat ? ' · ' + source.boat : '') + ' · ' + source.date : record.category || FINANCE_TYPES[record.transactionType], invoiceNumber: invoice?.number || '', note: record.note || '', receivedBy: record.enteredByName || 'Not recorded', recordedAt: record.correctedAt || record.created || '', voided: !!record.void, voidReason: record.voidReason || '', replaces: record.replaces ? receiptNumber(records.find(r => r.id === record.replaces) || record) : '', replacement: replacement && isReceiptRecord(replacement) ? receiptNumber(replacement) : '' };
}

return {isReceiptRecord,receiptNumber,receiptFor};
})();
(()=>{
const {ServerLedger}=ServerClient;
const {FINANCE_ACCOUNTS,FINANCE_TYPES,INCOME_CATEGORIES,EXPENSE_CATEGORIES,cents,shillings,validateFinance,resolveSource,sourceLimit,sourcePostings,validateFinancialLinks,financeCategory,journalFor,accountName,financeReport}=Finance;
const {BUSINESS_KINDS,BUSINESS_LABELS,validateBusiness,businessLookup,documentTotal,documentPayments,cashLeg,validateBusinessLinks,documentJournal,inventoryJournal,fullJournal,accountingName,accountingReport,partyOutstanding,statementSuggestions}=Business;
const {ROLES,RIGHTS,roleRights,effectiveRights,roleLabel,controlDefaults,normalControls,actorFor,canAct,isAccountingRecord,fingerprint,assertMutation,stamp,rowKey,contentHash}=Workflow;
const {BOATS,kinds,labels,money,qty,profit,totals,validate,validateLedger}=Ledger;
const {checkBackup,BrowserLedger}=Storage;
const {dateRange,reconcile,stockMovements,daySummary,trend,cleanPreferences}=Analytics;
const {parseCsv,readXlsx,importDate,importNumber,IMPORT_FIELDS,IMPORT_NAMES,guessMapping,mapImportRows}=Imports;
const {intelligenceSnapshot,answerFromRecords}=Intelligence;
const {isReceiptRecord,receiptNumber,receiptFor}=Receipts;
const oldStorageKey = 'true-fish-pages:' + location.pathname;
const newStorageKey = 'true-fish-pages:' + location.pathname.replace(/index\.html$/, '');
try {
    if (localStorage.getItem(newStorageKey) === null && localStorage.getItem(oldStorageKey) !== null)
        localStorage.setItem(newStorageKey, localStorage.getItem(oldStorageKey));
}
catch { }
const browserLedger = globalThis.TRUEFISH_SERVER ? new ServerLedger() : new BrowserLedger({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, 'true-fish-pages:' + location.pathname.replace(/index\.html$/, ''));
const deviceAccess = globalThis.TRUEFISH_ACCESS || null;
try {
    browserLedger.actorId = localStorage.getItem(browserLedger.key + ':actor') || 'owner';
}
catch { }
if (deviceAccess) Object.defineProperty(browserLedger, 'actorId', { get() { const id = deviceAccess.current(); if (!id) { location.reload(); throw Error('Your session expired. Sign in again.'); } return id; }, set() {} });
const root = document.querySelector('#app'), dialogs = document.querySelector('#dialog-root');
let state = { records: [], audit: [], version: 0 }, reference = [], tab = 'Overview', ready = false, error = '', saving = false, activeModal = null, lastFocus = null;
let assistantMessages = [], assistantBusy = false, assistantMode = 'records';
let filter = { boat: '', start: '', end: '', search: '' };
const nav = [['Overview', 'dashboard'], ['Assistant', 'chart'], ['Boat records', 'boat'], ['Fuel stock', 'fuel'], ['Fuel debts', 'debt'], ['Donations', 'heart'], ['Finances', 'wallet'], ['Receipts', 'document'], ['Customers & bills', 'document'], ['Accounting', 'chart'], ['Crew & maintenance', 'boat'], ['Imports & matching', 'document'], ['Review & staff', 'settings'], ['Reports', 'chart'], ['Workbook review', 'document'], ['Activity', 'history'], ['Settings', 'settings']];
const fields = [['income', 'Total income'], ['rent', 'Rent'], ['uganda', 'Uganda'], ['fuelLitres', 'Fuel litres'], ['fuelCash', 'Fuel cash'], ['gowi', 'Gowi'], ['charging', 'Charging Home'], ['amali', 'Amali'], ['boss', 'Boss'], ['expenses', 'Expenses'], ['commission', 'Commission']];
const descriptions = { 'Receipts': 'Branded payment receipts and reprints from saved cashbook entries.', 'Assistant': 'Business answers, record checks and guided next actions.', 'Customers & bills': 'Manage customer balances, supplier bills and document payments.', 'Accounting': 'Financial statements, fuel valuation and asset depreciation.', 'Crew & maintenance': 'Crew assignments, earned wages and boat service schedules.', 'Imports & matching': 'Preview spreadsheet rows and match account statements.', 'Review & staff': 'User accounts, assigned permissions, approvals and closed periods.', 'Overview': 'A clear view of your fleet, fuel and daily performance.', 'Boat records': 'Track daily income, allocations and profit for every boat.', 'Fuel stock': 'Every litre accounted for, from purchase to issue.', 'Fuel debts': 'Track fuel issued on credit and the litres cleared.', 'Donations': 'Record fuel given to boats without a cash sale.', 'Finances': 'Account for money received, paid and held across Cash, M-Pesa and Bank.', 'Reports': 'Compare boat performance and export your records.', 'Workbook review': 'Reference entries from your original spreadsheets.', 'Activity': 'A permanent history of additions and corrections.', 'Settings': 'Your business defaults, backups and data health.' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let focusDate = today();
let financeAccount = '';
const preferenceKey = browserLedger.key + ':preferences';
let preferences = cleanPreferences();
try {
    preferences = cleanPreferences(JSON.parse(localStorage.getItem(preferenceKey) || '{}'));
}
catch { }
const button = (action, label, cls = 'secondary', extra = '') => `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const newButton = (kind, text) => button('new', text, 'secondary', `data-kind="${kind}" ${ready ? '' : 'disabled'}`);
const selected = (a, b) => a === b ? ' selected' : '';
const live = () => state.records.filter(r => !r.void);
function rows() { return live().filter(r => (!filter.boat || r.boat === filter.boat) && (!filter.start || r.date >= filter.start) && (!filter.end || r.date <= filter.end) && (!filter.search || [r.boat, r.account, r.counterparty, r.reference, r.note, labels[r.kind]].join(' ').toLowerCase().includes(filter.search.toLowerCase()))); }
function metric(label, value, note) { const tone = /debt|outstanding/i.test(label) ? 'amber' : /profit/i.test(label) ? 'teal' : /fuel|stock|donat/i.test(label) ? 'blue' : /income|cash/i.test(label) ? 'green' : 'navy'; const glyph = /debt|outstanding/i.test(label) ? 'debt' : /fuel|stock/i.test(label) ? 'fuel' : /profit|income|cash/i.test(label) ? 'wallet' : 'boat'; return `<div class="metric metric--${tone}${/ -[0-9]/.test(String(value)) ? ' metric--negative' : ''}"><div class="metric-head"><span>${label}</span><span class="metric-icon">${icon(glyph)}</span></div><strong>${esc(value)}</strong><small>${note}</small></div>`; }
function empty() { return '<div class="empty"><span class="nav-symbol">⚓</span><b>No records in this view</b><span>Add a record or adjust your filters.</span></div>'; }
function table(data) { return `<div class="table-wrap"><table><thead><tr><th>Date / record</th><th>Boat</th><th>Income / quantity</th><th>Net profit / cash received</th><th>Notes</th><th></th></tr></thead><tbody>${data.length ? data.slice().sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created)).map(r => `<tr><td><b>${esc(r.date)}</b><small>${esc(r.kind === 'finance' ? FINANCE_TYPES[r.transactionType] : labels[r.kind])}</small></td><td>${esc(r.boat || (BUSINESS_KINDS.includes(r.kind) ? r.name || 'Business record' : r.kind === 'finance' ? FINANCE_ACCOUNTS[r.account] || 'Loan liability' : 'Stock store'))}</td><td>${BUSINESS_KINDS.includes(r.kind) ? (typeof r.amount === 'number' ? money(r.amount) : '—') : r.kind === 'finance' ? money(r.amount) : r.kind === 'boat' ? money(r.income) : qty(r.litres) + ' L'}</td><td>${r.kind === 'boat' ? money(profit(r).net) : r.cash != null ? money(r.cash) : '—'}</td><td class="note">${esc(r.note || '—')}</td><td>${button('detail', 'View ›', 'text-button', `data-id="${esc(r.id)}"`)}</td></tr>`).join('') : `<tr><td colspan="6">${empty()}</td></tr>`}</tbody></table></div>`; }
function filters() { return `<div class="date-presets">${[['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month'], ['all', 'All dates']].map(([period, label]) => button('period', label, 'preset', `data-period="${period}"`)).join('')}</div><form id="filters" class="filters"><div class="search"><input name="search" aria-label="Search records" placeholder="Search records…" value="${esc(filter.search)}"></div><select name="boat" aria-label="Filter by boat"><option value="">All boats</option>${BOATS.map(b => `<option${selected(b, filter.boat)}>${b}</option>`).join('')}</select><label>From <input name="start" type="date" value="${filter.start}"></label><label>To <input name="end" type="date" value="${filter.end}"></label><button class="secondary" type="submit">Apply filters</button>${button('clear', 'Clear', 'text-button', 'type="button"')}</form>`; }
function overview() { const t = totals(live()); return `<div class="metrics">${metric('Total boat income', money(t.income), 'All recorded days')}${metric('Net boat profit', money(t.net), 'Boss − expenses − commission')}${metric('Fuel in stock', qty(t.stock) + ' L', 'Current closing balance')}${metric('Outstanding fuel debt', qty(Object.values(t.debt).reduce((a, b) => a + b, 0)) + ' L', 'Across your fleet')}</div>${dailyBoard()}${trendChart()}<div class="overview-grid"><section class="welcome"><div class="welcome-tag">● DAILY OPERATIONS</div><h2>Good records.<br>Better decisions.</h2><p>Close the day with confidence. Record boat income, keep fuel moving, and follow every outstanding litre.</p>${button('new', 'Record today’s activity ↗', '', 'data-kind="boat" ' + (ready ? '' : 'disabled'))}<div class="boat-art">${icon('boat', 140)}<div class="wave"></div><div class="wave second"></div></div></section><section class="panel quick"><div class="section-head"><h2>Quick actions</h2><span>START HERE</span></div>${[['boat', 'Daily boat record', 'Income, costs and profit', 'boat'], ['purchase', 'Receive fuel stock', 'Add a fuel purchase', 'fuel'], ['sale', 'Issue fuel', 'Record a cash fuel sale', 'arrow'], ['repayment', 'Receive repayment', 'Clear fuel debt by boat', 'debt']].map(([kind, title, note, glyph]) => `<button data-action="new" data-kind="${kind}" ${ready ? '' : 'disabled'}><div class="quick-icon quick-${kind}">${icon(glyph)}</div><span><b>${title}</b><small>${note}</small></span><span style="margin-left:auto">›</span></button>`).join('')}</section></div><section class="panel"><div class="section-head"><div><h2>Recent activity</h2><p>Your latest boat and fuel entries</p></div>${button('navigate', 'View all records ↗', 'text-button', 'data-tab="Reports"')}</div>${table(live().slice().sort((a, b) => (a.correctedAt || a.created).localeCompare(b.correctedAt || b.created)).slice(-6))}</section><div class="notice subtle">Enter confirmed opening balances before recording historical movements.</div>`; }
function performance(data) { const total = totals(data); return `<section class="panel"><div class="section-head"><h2>Boat performance</h2>${button('print', 'Print report', 'text-button')}</div><div class="table-wrap"><table><thead><tr><th>Boat</th><th>Days recorded</th><th>Total income</th><th>Net profit</th><th>Income share</th></tr></thead><tbody>${BOATS.filter(b => !filter.boat || filter.boat === b).map(b => { const rs = data.filter(r => r.kind === 'boat' && r.boat === b), t = totals(rs); return `<tr><td><b>${b}</b></td><td>${rs.length}</td><td>${money(t.income)}</td><td>${money(t.net)}</td><td><div class="bar"><i style="width:${total.income ? t.income / total.income * 100 : 0}%"></i></div></td></tr>`; }).join('')}</tbody></table></div></section>`; }
function workbooks() { return '<section class="panel"><div class="section-head"><h2>Workbook reference</h2></div><div class="notice">The original spreadsheet figures are not bundled into this publicly hostable edition. Enter confirmed opening balances and daily records manually. Original labels are preserved.</div><div class="notice warning">Confirm the source dates and debt calculations before entering historical balances. Uganda, Gowi, Charging Home, Amali and Boss retain the original labels pending clarification.</div></section>'; }
function content() {
    const data = rows(), period = totals(data), all = totals(live());
    if (tab === 'Receipts') return receiptsPage();
    if (tab === 'Overview')
        return hybridOverview();
    if (tab === 'Assistant')
        return canAct(localActor(), 'assistant') ? assistantPage() : '<div class="notice warning">Your account is not assigned access to the assistant. Contact your administrator.</div>';
    if (['Customers & bills', 'Accounting', 'Crew & maintenance', 'Imports & matching', 'Review & staff'].includes(tab))
        return businessPage(tab);
    if (tab === 'Finances')
        return financesPage();
    if (tab === 'Settings')
        return settingsPage();
    if (tab === 'Workbook review')
        return workbooks();
    if (tab === 'Activity')
        return `<section class="panel"><div class="section-head"><h2>Record history</h2>${button('audit-export', 'Export history', 'text-button')}</div>${state.audit.length ? `<div class="audit-list">${state.audit.map(a => `<div><span class="audit-icon">${a.action === 'add' ? '+' : '◷'}</span><span><b>${a.action === 'add' ? 'Record added' : 'Record voided'}</b><small>${esc(new Date(a.at).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' }))} · ${esc(a.reason || a.record)}${a.actor ? ' · ' + esc(a.actor) : ''}</small></span>${button('detail', 'View', 'text-button', `data-id="${esc(a.record)}"`)}</div>`).join('')}</div>` : empty()}</section>`;
    let html = filters();
    if (tab === 'Boat records')
        html += `<div class="metrics three">${metric('Boat income', money(period.income), 'Selected dates and boats')}${metric('Net profit', money(period.net), 'Selected dates and boats')}${metric('Daily records', String(data.filter(r => r.kind === 'boat').length), 'One per boat per day')}</div><div class="notice">Profit = Boss − Expenses − Commission. Enter Boss and Commission explicitly. Boat fuel costs do not create stock movements; record physical issues separately under Fuel stock.</div><section class="panel">${table(data.filter(r => r.kind === 'boat'))}</section>`;
    if (tab === 'Fuel stock')
        html += `<div class="metrics three">${metric('Current fuel stock', qty(all.stock) + ' L', 'All-time balance · ignores date filters')}${metric('Fuel cash received', money(period.cash), 'Selected period · sales + repayments')}${metric('Fuel donated', qty(period.donated) + ' L', 'Selected period')}</div><div class="toolbar">${['opening', 'purchase', 'sale', 'credit', 'donation'].map(k => newButton(k, '+ ' + labels[k])).join('')}</div><section class="panel">${table(data.filter(r => ['opening', 'purchase', 'sale', 'credit', 'donation'].includes(r.kind)))}</section><p class="footnote">Start with opening stock before issuing fuel. Backdated entries are checked against the complete chronological ledger.</p>`;
    if (tab === 'Fuel debts')
        html += `<div class="notice">Balances below are current and use all dates. Repayments record litres cleared and cash separately; they do not return fuel to stock.</div><div class="toolbar">${newButton('credit', 'Issue on credit')}${newButton('repayment', 'Record repayment')}</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Boat</th><th>Borrowed</th><th>Repaid</th><th>Outstanding</th><th></th></tr></thead><tbody>${BOATS.filter(b => !filter.boat || b === filter.boat).map(b => { const sum = k => live().filter(r => r.kind === k && r.boat === b).reduce((s, r) => s + r.litres, 0), debt = all.debt[b] || 0; return `<tr><td><b>${b}</b></td><td>${qty(sum('credit'))} L</td><td>${qty(sum('repayment'))} L</td><td><span class="badge ${debt ? 'amber' : ''}">${qty(debt)} L</span></td><td>${button('new', 'Repay ›', 'text-button', `data-kind="repayment" data-boat="${b}" ${ready ? '' : 'disabled'}`)}</td></tr>`; }).join('')}</tbody></table></div></section><h2 class="subheading">Transactions in selected period</h2><section class="panel">${table(data.filter(r => ['credit', 'repayment'].includes(r.kind)))}</section>`;
    if (tab === 'Donations')
        html += `<div class="metrics three">${metric('Fuel donated', qty(period.donated) + ' L', 'Selected period and boats')}${metric('Donation entries', String(data.filter(r => r.kind === 'donation').length), 'Recorded issues')}</div><section class="panel">${table(data.filter(r => r.kind === 'donation'))}</section>`;
    if (tab === 'Reports')
        html += `<div class="metrics">${metric('Boat income', money(period.income), 'Selected period')}${metric('Net boat profit', money(period.net), 'Selected period')}${metric('Fuel cash received', money(period.cash), 'Sales + debt repayments')}${metric('Fuel donations', qty(period.donated) + ' L', 'Selected period')}</div>${performance(data)}<h2 class="subheading">Detailed ledger</h2><section class="panel">${table(data)}</section>`;
    if (tab === 'Fuel stock' || tab === 'Reports')
        html += fuelReconciliation();
    return html;
}
function render() { root.innerHTML = `<div class="shell"><aside><a class="brand" href="./index.html"><img class="suite-logo" src="true-fish-logo.png" alt="True Fish Business Suite"></a><button class="sidebar-create" data-action="new" data-kind="finance">＋ Create new</button><nav aria-label="Main navigation">${hybridNavigation()}</nav><div class="aside-bottom"><div class="fleet-icon">${icon('boat', 26)}</div><b>Built around your business.</b><p>Financial clarity. Operational control.</p><span class="private">● ${globalThis.TRUEFISH_SERVER ? 'Shared server ledger' : 'Saved in this browser'}</span></div><div class="company"><div>TF</div><span><b>${esc(preferences.company)}</b><small>KSh · East Africa</small></span></div></aside><main><header><div class="breadcrumb"><span class="app-launcher" aria-hidden="true">⠿</span><span>True Fish <b>Business Suite</b></span></div><button class="global-search" data-action="workspace-search"><span>⌕</span> Search anything <kbd>Ctrl K</kbd></button>${button('navigate', '✦ Assistant', 'header-assistant', 'data-tab="Assistant"')}${profileSelector()}<span class="date">${new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' })}</span></header><div class="content"><div class="page-heading"><div><div class="eyebrow">${esc(preferences.company.toUpperCase())}</div><h1>${tab === 'Overview' ? 'Business overview' : tab}</h1><p>${descriptions[tab]}</p></div><div class="actions">${button('export', '↓ Export CSV', 'secondary', ready && (tab === 'Finances' ? financeReport(state.records, financeScope()).entries.length : rows().length) ? '' : 'disabled')}${button('new', '+ Add record', 'primary', `data-kind="${defaultRecordKind()}" ${ready ? '' : 'disabled'}`)}</div></div>${error ? `<div class="error" role="alert">${esc(error)} ${button('refresh', 'Refresh records', 'text-button')}</div>` : ''}${ready ? '' : '<div class="notice">Reading this browser’s records…</div>'}<div class="storage-strip"><span>● ${globalThis.TRUEFISH_SERVER ? 'Shared server ledger' : 'Saved in this browser'} · ${esc(backupLabel())}</span>${button('backup', 'Download backup', 'text-button')}</div>${content()}<footer><span>${esc(preferences.company.toUpperCase())} / Built for the working day</span><div class="top-actions">${button('refresh', '↻ Refresh records', 'text-button')}${button('backup', 'Download backup', 'text-button')}${button('restore', 'Restore backup', 'text-button')}</div></footer></div></main></div>`; applyRightsUI(); }
function toast(text) { const el = document.querySelector('#toast'); el.textContent = '✓ ' + text; el.hidden = false; setTimeout(() => el.hidden = true, 4000); }
async function load() {
    try {
        state = await browserLedger.read();
        if (globalThis.TRUEFISH_SERVER && state.preferences)
            preferences = cleanPreferences(state.preferences);
        reference = [];
        ready = true;
        error = '';
    }
    catch (e) {
        error = e.message;
        ready = false;
    }
    render();
}
function exportCSV(data, name) {
    const keys = [...new Set(data.flatMap(r => Object.keys(r)))];
    if (!keys.length)
        return toast('No rows to export.');
    const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const value = v => typeof v === 'string' && /^[=+@\-\t\r]/.test(v) ? "'" + v : v;
    const text = [keys, ...data.map(r => keys.map(k => value(r[k])))].map(r => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function close() {
    if (saving)
        return;
    dialogs.innerHTML = '';
    activeModal = null;
    lastFocus?.focus();
}
function dialog(title, body) { lastFocus = document.activeElement; dialogs.innerHTML = `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-head"><div><span class="eyebrow">TRUE FISH RECORDS</span><h2 id="dialog-title">${esc(title)}</h2></div>${button('close', '×', 'close', 'aria-label="Close dialog"')}</div><div id="modal-error" class="error modal-error" role="alert"></div>${body}</section></div>`; dialogs.querySelector('input,select,button')?.focus(); }
function openNew(kind, boat, existing = null, forcedDate = null) {
    if (BUSINESS_KINDS.includes(kind))
        return openBusinessForm(kind, existing);
    if (kind === 'finance' && existing?.documentId)
        return openDocumentPayment(businessLookup(state.records, existing.documentId), existing);
    if (kind === 'finance')
        return openFinance(existing?.transactionType || 'income', existing);
    if (!ready)
        return;
    activeModal = { kind, ...(existing ? { id: existing.id } : {}) };
    const number = (key, label, step = '0.01', initial = 0, min = '0') => `<label>${label}<input name="${key}" type="number" min="${min}" step="${step}" value="${initial}" required></label>`;
    let body = `<form id="record-form"><div class="form-grid"><label>Date<input type="date" name="date" value="${today()}" required></label>${!['purchase', 'opening'].includes(kind) ? `<label>Boat<select name="boat">${BOATS.map(b => `<option${selected(b, boat || filter.boat || 'Boat 1')}>${b}</option>`).join('')}</select></label>` : ''}`;
    body += kind === 'boat' ? fields.map(([key, label]) => number(key, label + (key === 'fuelLitres' ? ' (L)' : ' (KSh)'))).join('') : number('litres', kind === 'repayment' ? 'Debt litres cleared' : 'Quantity (litres)', '0.001', 0, '0.001') + (['purchase', 'sale', 'credit'].includes(kind) ? number('price', 'Price per litre (KSh)', '0.01', preferences.fuelPrice) : '') + (['sale', 'repayment'].includes(kind) ? number('cash', 'Cash received (KSh)') : '');
    body += `<label class="full">Notes<textarea name="note" maxlength="1000" placeholder="Optional details…"></textarea></label></div>${existing ? '<label class="correction-reason">Reason for correction<input name="correctionReason" maxlength="300" required placeholder="Explain what changed"></label>' : ''}<div id="form-summary" class="form-summary"></div><p id="draft-status" class="footnote">Drafts save in this browser while you type.</p><div class="dialog-actions">${button('close', 'Cancel', 'secondary', 'type="button"')}<button class="primary" type="submit">${existing ? 'Save correction' : '✓ Save record'}</button>${existing ? '' : '<button class="secondary" type="submit" data-next="true">Save &amp; add next</button>'}</div></form>`;
    dialog((existing ? 'Correct: ' : '') + labels[kind], body);
    const form = dialogs.querySelector('#record-form');
    let initial = existing || {};
    if (existing || (!boat && !forcedDate)) {
        try {
            const draft = JSON.parse(localStorage.getItem(draftKey()) || 'null');
            if (draft) {
                initial = draft;
                document.querySelector('#draft-status').textContent = 'Your unfinished draft has been restored.';
            }
        }
        catch { }
    }
    for (const [key, value] of Object.entries(initial)) {
        if (form.elements.namedItem(key))
            form.elements.namedItem(key).value = String(value);
    }
    if (forcedDate)
        form.elements.namedItem('date').value = forcedDate;
    updateSummary();
}
function updateSummary() {
    const form = dialogs.querySelector('#record-form');
    if (!form)
        return;
    if (activeModal.kind === 'finance') {
        updateFinanceSummary(form);
        return;
    }
    if (BUSINESS_KINDS.includes(activeModal.kind)) {
        updateBusinessSummary(form);
        return;
    }
    const f = new FormData(form), n = k => Number(f.get(k) || 0), kind = activeModal.kind;
    document.querySelector('#form-summary').innerHTML = kind === 'boat' ? `<span>Gross profit <b>${money(n('boss') - n('expenses'))}</b></span><span>Net profit <b>${money(n('boss') - n('expenses') - n('commission'))}</b></span>${preferences.commissionRate !== null ? button('commission', 'Apply ' + preferences.commissionRate + '% of Boss', 'text-button', 'type="button"') : ''}<small>Commission changes only when you enter it or use Apply.</small>` : ['purchase', 'sale', 'credit'].includes(kind) ? `<span>Total value <b>${money(n('litres') * n('price'))}</b></span>${kind === 'sale' ? `<span>Sales value less cash <b>${money(n('litres') * n('price') - n('cash'))}</b></span>${button('cash-total', 'Use sales value as cash received', 'text-button', 'type="button"')}` : ''}` : kind === 'repayment' ? 'Enter the agreed litres cleared and cash received. Physical stock does not change.' : 'Stock and debt balances are validated when saving.';
}
function detail(id) {
    const r = state.records.find(r => r.id === id);
    if (!r)
        return;
    if (BUSINESS_KINDS.includes(r.kind))
        return businessDetail(r);
    if (r.kind === 'finance')
        return financeDetail(r);
    activeModal = { id };
    const body = `<div class="details">${Object.entries(r).filter(([k]) => !['id', 'void'].includes(k)).map(([k, v]) => `<div><span>${esc(fields.find(f => f[0] === k)?.[1] || k)}</span><b>${esc(v)}</b></div>`).join('')}${r.kind === 'boat' ? `<div><span>Net profit</span><b>${money(profit(r).net)}</b></div>` : ''}</div>${r.void ? '<div class="notice warning">Voided — excluded from balances.</div>' : `<div class="toolbar">${button('edit', 'Edit &amp; correct', 'primary', `data-id="${esc(r.id)}"`)}</div><form id="void-form" class="correction"><h3>Void without replacing</h3><p>Void the original, then add the corrected record. The original stays in Activity.</p><label>Reason<input name="reason" maxlength="300" required placeholder="Explain the correction"></label><button class="danger" type="submit">Void record</button></form>`}`;
    dialog('Record details', body + receiptLinks(r));
}
async function save(payload, next = false) {
    if (saving)
        return;
    saving = true;
    const key = draftKey();
    dialogs.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
        state = await browserLedger.save(payload, state.version);
        try {
            localStorage.removeItem(key);
        }
        catch { }
        saving = false;
        close();
        render();
        toast(payload.action === 'void' ? 'Record voided. History preserved.' : payload.action === 'replace' ? 'Correction saved. Original kept in Activity.' : 'Record saved in this browser.');
        if (next && payload.record && !BUSINESS_KINDS.includes(payload.record.kind) && payload.record.kind !== 'finance') {
            const r = payload.record;
            const nextBoat = r.kind === 'boat' ? BOATS.find(b => !live().some(x => x.kind === 'boat' && x.date === r.date && x.boat === b)) : r.boat;
            openNew(r.kind, nextBoat || r.boat, null, r.date);
        }
    }
    catch (e) {
        dialogs.querySelector('#modal-error').textContent = e.message;
    }
    finally {
        saving = false;
        dialogs.querySelectorAll('button').forEach(b => b.disabled = false);
    }
}
document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled)
        return;
    const a = b.dataset.action;
    if (a === 'navigate') {
        tab = b.dataset.tab;
        error = '';
        render();
    }
    if (a === 'new')
        openNew(b.dataset.kind, b.dataset.boat, null, b.dataset.date || null);
    if (a === 'detail')
        detail(b.dataset.id);
    if (a === 'close')
        close();
    if (a === 'refresh')
        load();
    if (a === 'clear') {
        filter = { boat: '', start: '', end: '', search: '' };
        error = '';
        render();
    }
    if (a === 'export') {
        if (tab === 'Receipts')
            exportReceipts();
        else if (tab === 'Finances')
            exportFinancialCashbook();
        else
            exportCSV(rows().map(r => ({ ...r, ...(r.kind === 'boat' ? profit(r) : {}) })), 'true-fish-records');
    }
    if (a === 'audit-export')
        exportCSV(state.audit, 'true-fish-audit');
    if (a === 'reference-export') {
        const s = reference[Number(b.dataset.index)];
        if (s)
            exportCSV(s.rows, s.sheet);
    }
    if (a === 'print')
        window.print();
});
document.addEventListener('submit', e => {
    const form = e.target;
    if (!['filters', 'record-form', 'void-form'].includes(form.id))
        return;
    e.preventDefault();
    if (form.id === 'filters') {
        const next = Object.fromEntries(new FormData(form));
        if (next.start && next.end && next.start > next.end) {
            error = 'The start date must be on or before the end date.';
            render();
            return;
        }
        filter = next;
        error = '';
        render();
    }
    if (form.id === 'record-form') {
        const record = Object.fromEntries(new FormData(form));
        record.kind = activeModal.kind;
        for (const key of [...fields.map(f => f[0]), 'litres', 'price', 'cash', 'amount', 'taxAmount', 'salvage', 'lifeMonths', 'unitCost'])
            if (key in record)
                record[key] = Number(record[key]);
        for (const field of ['opening', 'taxRecoverable'])
            if (field in record)
                record[field] = record[field] === 'true';
        const reason = String(record.correctionReason || '');
        delete record.correctionReason;
        save({ action: activeModal.id ? 'replace' : 'add', id: activeModal.id, reason, record }, e.submitter?.dataset.next === 'true');
    }
    if (form.id === 'void-form')
        save({ action: 'void', id: activeModal.id, reason: new FormData(form).get('reason') });
});
dialogs.addEventListener('input', () => { updateSummary(); saveDraft(); });
dialogs.addEventListener('click', e => {
    if (e.target.classList.contains('overlay'))
        close();
});
document.addEventListener('keydown', e => {
    if (!activeModal)
        return;
    if (e.key === 'Escape')
        close();
    if (e.key === 'Tab') {
        const items = [...dialogs.querySelectorAll('button:not(:disabled),input,select,textarea')];
        if (!items.length)
            return;
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
});
render();
load();
function backupDownload() {
    if (!ready) {
        toast('Restore or recover your records before downloading a backup.');
        return;
    }
    const data = JSON.stringify({ ...state, schema: 1, preferences }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'true-fish-backup-' + today() + '.json';
    link.click();
    try {
        localStorage.setItem(browserLedger.key + ':last-backup', new Date().toISOString());
    }
    catch { }
    render();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b)
        return;
    if (b.dataset.action === 'backup')
        backupDownload();
    if (b.dataset.action === 'restore') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file)
                return;
            try {
                if (file.size > 10000000)
                    throw Error('Backup is too large.');
                const data = JSON.parse(await file.text());
                if (!confirm('Restore this backup? It replaces the records saved in this browser. Download your current backup first.'))
                    return;
                state = await browserLedger.restore(data, ready ? state.version : null);
                if (data.preferences) {
                    preferences = cleanPreferences(data.preferences);
                    try {
                        localStorage.setItem(preferenceKey, JSON.stringify(preferences));
                    }
                    catch { }
                }
                ready = true;
                error = '';
                render();
                toast('Backup restored in this browser.');
            }
            catch (e) {
                error = e.message;
                render();
            }
        });
        input.click();
    }
});
window.addEventListener('storage', e => {
    if (e.key === browserLedger.key && !activeModal)
        load();
});
function backupLabel() {
    try {
        const value = localStorage.getItem(browserLedger.key + ':last-backup');
        return value ? 'Backup downloaded ' + new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No backup downloaded yet';
    }
    catch {
        return 'Download regular backups';
    }
}
function draftKey() { return browserLedger.key + ':draft:' + activeModal?.kind + (activeModal?.kind === 'finance' ? ':' + activeModal.transactionType + (activeModal.sourceId ? ':' + activeModal.sourceId : '') : '') + (activeModal?.id ? ':' + activeModal.id : ''); }
function saveDraft() {
    const form = dialogs.querySelector('#record-form');
    if (!form || !activeModal || saving)
        return;
    try {
        localStorage.setItem(draftKey(), JSON.stringify(Object.fromEntries(new FormData(form))));
        document.querySelector('#draft-status').textContent = 'Draft saved in this browser. Close and reopen this record type to resume.';
    }
    catch {
        document.querySelector('#draft-status').textContent = 'Draft could not be stored. Save this record before closing.';
    }
}
function dailyBoard() {
    const d = daySummary(live(), focusDate), stock = totals(live()).stock;
    let alerts = '';
    if (preferences.lowStock > 0 && stock < preferences.lowStock)
        alerts += `<div class="status-alert warning">Low fuel: ${qty(stock)} L available. Your alert threshold is ${qty(preferences.lowStock)} L. ${newButton('purchase', 'Receive stock')}</div>`;
    if (Math.abs(d.fuel.variance) > .005)
        alerts += `<div class="status-alert warning">Fuel-sale cash difference for ${esc(focusDate)}: ${money(d.fuel.variance)}. Review cash received against sales value.</div>`;
    return `${alerts}<section class="panel day-board"><div class="section-head"><div><span class="eyebrow">DAILY CLOSE</span><h2>A clear picture of the day</h2></div><label class="day-picker">Record date <input id="day-selector" type="date" value="${focusDate}"></label></div><div class="daily-stats"><div><small>Boat income</small><strong>${money(d.income)}</strong></div><div><small>Net boat profit</small><strong>${money(d.net)}</strong></div><div><small>Fuel issued</small><strong>${qty(d.fuel.sold + d.fuel.credit + d.fuel.donated)} L</strong></div><div><small>Boat records</small><strong>${d.boats}<em> / ${BOATS.length}</em></strong></div></div><div class="day-bottom"><div><b>Boats without a daily entry</b><p>These boats have no daily record for the selected date.</p><div class="boat-chips">${d.missing.length ? d.missing.map(b => button('new', b, 'boat-chip', `data-kind="boat" data-boat="${b}" data-date="${focusDate}" ${ready ? '' : 'disabled'}`)).join('') : '<span class="badge">All boats recorded</span>'}</div></div>${button('day-export', 'Export day summary', 'secondary')}</div></section>`;
}
function trendChart() { const points = trend(live(), focusDate, 14); const max = Math.max(1, ...points.map(p => p.income), ...points.map(p => p.net)), min = Math.min(0, ...points.map(p => p.net)); const x = i => 20 + i * 620 / 13, y = v => 130 - (v - min) / (max - min) * 112; const path = key => points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p[key]).toFixed(1)).join(' '); return `<section class="panel trend-panel"><div class="section-head"><div><h2>Income &amp; profit</h2><p>14 days ending ${esc(focusDate)}</p></div><div class="chart-legend"><span class="legend-income">Income</span><span class="legend-profit">Net profit</span></div></div><div class="chart-wrap"><div class="chart-axis"><span>${money(points.every(p => p.income === 0 && p.net === 0) ? 0 : max)}</span><span>${money(min)}</span></div><svg viewBox="0 0 660 150" role="img" aria-label="Income and net profit over fourteen days"><title>Income and net profit</title><desc>${esc(points.map(p => p.date + ': income ' + money(p.income) + ', net ' + money(p.net)).join('; '))}</desc><line x1="20" y1="${y(0)}" x2="640" y2="${y(0)}" stroke="#CBD5E1" stroke-dasharray="4 4"/><path d="${path('income')}" fill="none" stroke="#137D56" stroke-width="3"/><path d="${path('net')}" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-dasharray="6 4"/>${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.income)}" r="3" fill="#137D56"><title>${p.date}: ${money(p.income)}</title></circle>`).join('')}</svg></div><div class="chart-dates"><span>${points[0].date}</span><span>${points.at(-1).date}</span></div></section>`; }
function fuelReconciliation() { const data = rows(), r = reconcile(data); const visible = new Set(data.map(r => r.id)); const movements = stockMovements(live()).filter(r => visible.has(r.id)); return `<section class="panel reconciliation"><div class="section-head"><div><h2>Fuel &amp; cash reconciliation</h2><p>Selected dates and boats · repayments shown separately</p></div>${button('fuel-report-export', 'Export reconciliation', 'text-button')}</div><div class="reconciliation-grid"><div><small>Purchases</small><b>${qty(r.purchased)} L</b><span>${money(r.purchaseCost)}</span></div><div><small>Cash-sale value</small><b>${money(r.salesValue)}</b><span>${qty(r.sold)} L sold</span></div><div><small>Sales cash received</small><b>${money(r.salesCash)}</b><span>Difference: ${money(r.variance)}</span></div><div><small>Debt cash received</small><b>${money(r.repaymentCash)}</b><span>${qty(r.credit)} L issued on credit</span></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Movement</th><th>Boat</th><th>In (L)</th><th>Out (L)</th><th>Fleet balance (L)</th></tr></thead><tbody>${movements.length ? movements.slice().reverse().map(r => `<tr><td>${r.date}</td><td>${esc(r.kind === 'finance' ? FINANCE_TYPES[r.transactionType] : labels[r.kind])}</td><td>${esc(r.boat || (BUSINESS_KINDS.includes(r.kind) ? r.name || 'Business record' : r.kind === 'finance' ? FINANCE_ACCOUNTS[r.account] || 'Loan liability' : 'Stock store'))}</td><td>${r.incoming ? qty(r.incoming) : '—'}</td><td>${r.outgoing ? qty(r.outgoing) : '—'}</td><td><b>${qty(r.balance)}</b></td></tr>`).join('') : `<tr><td colspan="6">${empty()}</td></tr>`}</tbody></table></div><p class="footnote report-note">Fleet balances include all earlier movements, including those outside your filters. Cash differences do not automatically create boat debt.</p></section>`; }
function settingsPage() {
    let recovery = null;
    try {
        recovery = browserLedger.readRecovery();
    }
    catch { }
    const bytes = new Blob([JSON.stringify(state)]).size;
    return `<div class="settings-grid"><section class="panel"><div class="section-head"><div><h2>Business preferences</h2><p>Defaults apply to new entries; saved records stay unchanged.</p></div></div><form id="settings-form" class="settings-form"><label>Business name<input name="company" value="${esc(preferences.company)}" maxlength="80" required></label><label>Default fuel price (KSh / L)<input name="fuelPrice" type="number" min="0" max="100000000" step="0.01" value="${preferences.fuelPrice}" required></label><label>Low-stock alert (litres)<input name="lowStock" type="number" min="0" max="100000000" step="0.001" value="${preferences.lowStock}" required><small>Enter 0 to turn this alert off.</small></label><label>Optional commission calculator (%)<input name="commissionRate" type="number" min="0" max="100" step="0.01" value="${preferences.commissionRate ?? ''}" placeholder="Leave blank for manual entry"><small>Provides an Apply button on the boat form. It does not change commission automatically.</small></label><button class="primary" type="submit">Save preferences</button></form></section><section class="panel"><div class="section-head"><div><h2>Backups &amp; data health</h2><p>${esc(backupLabel())}</p></div></div><div class="data-health"><div><span>Live records</span><b>${live().length}</b></div><div><span>Corrections / voids retained</span><b>${state.records.filter(r => r.void).length}</b></div><div><span>History entries</span><b>${state.audit.length}</b></div><div><span>Ledger size</span><b>${(bytes / 1024).toFixed(1)} KB</b></div><div><span>Ledger status</span><b>${ready ? 'Validated' : 'Needs recovery'}</b></div></div><div class="settings-actions">${button('backup', 'Download full backup', 'primary', ready ? '' : 'disabled')}${button('restore', 'Restore a backup', 'secondary')}${button('recover', 'Recover previous saved version', 'secondary', recovery ? '' : 'disabled')}</div><p class="footnote report-note">Backups include records, correction history and preferences. This browser keeps the previous saved ledger where storage space allows. Neither replaces an external backup.</p></section></div><section class="panel help-panel"><div class="section-head"><div><h2>Colour guide</h2><p>One visual language across records, charts and reports.</p></div></div><div class="colour-guide"><span><i style="--swatch:#10283F"></i>Navigation · Navy</span><span><i style="--swatch:#0B716A"></i>Actions &amp; profit · Teal</span><span><i style="--swatch:#137D56"></i>Income · Emerald</span><span><i style="--swatch:#2563EB"></i>Fuel · Blue</span><span><i style="--swatch:#9A5B08"></i>Debt &amp; attention · Amber</span></div></section><section class="panel help-panel"><div class="section-head"><h2>A reliable daily routine</h2></div><ol><li>Enter opening stock once, then record fuel purchases.</li><li>Record each fuel sale, credit issue or donation separately.</li><li>Add daily boat income, costs, Boss and Commission.</li><li>Review the daily close and fuel cash differences.</li><li>Download a full backup before clearing browser data or moving devices.</li></ol><p>${globalThis.TRUEFISH_SERVER ? 'Records are stored in the shared server database. Permissions are enforced by the server. Keep manual downloaded backups.' : 'Records are stored on this browser, not on GitHub. There is no account syncing. Use JSON backup and restore to move records between devices.'}</p></section>`;
}
function applyFormValue(name, value) {
    const input = dialogs.querySelector('#record-form')?.elements.namedItem(name);
    if (input) {
        input.value = Number(value).toFixed(2);
        updateSummary();
        saveDraft();
    }
}
document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled)
        return;
    const action = b.dataset.action;
    if (action === 'period') {
        const period = dateRange(b.dataset.period, today());
        filter = { ...filter, ...period };
        error = '';
        render();
    }
    if (action === 'edit') {
        const original = state.records.find(r => r.id === b.dataset.id && !r.void);
        if (original)
            openNew(original.kind, original.boat, original);
    }
    if (action === 'cash-total') {
        const f = new FormData(dialogs.querySelector('#record-form'));
        applyFormValue('cash', Number(f.get('litres')) * Number(f.get('price')));
    }
    if (action === 'commission') {
        const f = new FormData(dialogs.querySelector('#record-form'));
        applyFormValue('commission', Number(f.get('boss')) * preferences.commissionRate / 100);
    }
    if (action === 'day-export') {
        const d = daySummary(live(), focusDate);
        exportCSV([{ date: focusDate, boatsRecorded: d.boats, income: d.income, netProfit: d.net, fuelIssuedLitres: d.fuel.sold + d.fuel.credit + d.fuel.donated, fuelSalesValue: d.fuel.salesValue, fuelSalesCash: d.fuel.salesCash, fuelCashDifference: d.fuel.variance, debtCashReceived: d.fuel.repaymentCash }], 'true-fish-day-' + focusDate);
    }
    if (action === 'fuel-report-export') {
        const r = reconcile(rows());
        exportCSV([{ from: filter.start, to: filter.end, boat: filter.boat || 'All boats', ...r }], 'true-fish-fuel-reconciliation');
    }
    if (action === 'recover') {
        try {
            const backup = browserLedger.readRecovery();
            if (!backup)
                throw Error('No previous save is available.');
            if (!confirm('Recover the previous saved version? This replaces the current ledger. Download a current backup first.'))
                return;
            state = await browserLedger.restore(backup, ready ? state.version : null);
            ready = true;
            error = '';
            render();
            toast('Previous saved version recovered.');
        }
        catch (e) {
            error = e.message;
            render();
        }
    }
});
document.addEventListener('change', e => {
    if (e.target.id === 'day-selector' && e.target.value) {
        focusDate = e.target.value;
        render();
    }
});
document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'settings-form')
        return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        if (!canAct(localActor(), 'settings')) throw Error('Your account cannot change business settings.');
        const next = cleanPreferences({ company: data.company, fuelPrice: Number(data.fuelPrice), lowStock: Number(data.lowStock), commissionRate: data.commissionRate === '' ? null : Number(data.commissionRate) });
        if (globalThis.TRUEFISH_SERVER)
            state = await browserLedger.setPreferences(next, state.version);
        localStorage.setItem(preferenceKey, JSON.stringify(next));
        preferences = next;
        render();
        toast('Preferences saved.');
    }
    catch (e) {
        error = e.message;
        render();
    }
});
function icon(name, size = 20) { const paths = { dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', boat: '<path d="M3 16l2 4h14l2-4-9-4zM7 14V7h10v7M10 7V3h4v4M3 22c2-2 4 2 6 0s4 2 6 0 4 2 6 0"/>', fuel: '<rect x="4" y="3" width="10" height="18" rx="2"/><path d="M4 10h10M7 21h5M14 8h2l3 3v6a2 2 0 004 0V9l-4-4M19 5l-1 2 3 3"/>', debt: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z"/>', chart: '<path d="M4 3v17h17M8 15v-4M13 15V7M18 15V4"/>', document: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5"/>', history: '<path d="M3 11a9 9 0 119 10M3 4v7h7M12 7v5l3 2"/>', settings: '<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/><circle cx="12" cy="12" r="3"/>', anchor: '<circle cx="12" cy="4" r="2"/><path d="M12 6v16M7 10h10M3 15v2a9 9 0 0018 0v-2M3 15l-2 3M3 15l3 2M21 15l-3 2M21 15l2 3"/>', wallet: '<path d="M20 7H5a2 2 0 010-4h13v4M3 5v14a2 2 0 002 2h15V7M16 12h5v5h-5z"/>', arrow: '<path d="M5 19L19 5M5 5h14v14"/>' }; return `<svg class="app-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.dashboard}</svg>`; }
function financeOptions(selectedAccount = 'cash') { return Object.entries(FINANCE_ACCOUNTS).map(([key, name]) => `<option value="${key}"${selected(key, selectedAccount)}>${name}</option>`).join(''); }
function financeScope() { return { start: filter.start, end: filter.end, search: filter.search, account: financeAccount }; }
function financialFilters() { return `<div class="date-presets">${[['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month'], ['all', 'All dates']].map(([period, label]) => button('period', label, 'preset', `data-period="${period}"`)).join('')}</div><form id="finance-filters" class="filters"><div class="search"><input name="search" aria-label="Search financial entries" placeholder="Reference, category, counterparty…" value="${esc(filter.search)}"></div><select name="account" aria-label="Financial account"><option value="">All accounts</option>${financeOptions(financeAccount)}</select><label>From <input name="start" type="date" value="${filter.start}"></label><label>To <input name="end" type="date" value="${filter.end}"></label><button class="secondary" type="submit">Apply</button>${button('finance-clear', 'Clear', 'text-button', 'type="button"')}</form>`; }
function financesPage() {
    const report = financeReport(state.records, financeScope()), all = financeReport(state.records), balance = financeAccount ? all.balances[financeAccount] : Object.values(all.balances).reduce((a, b) => a + b, 0);
    const sourcePosted = sourcePostings(state.records);
    const sources = live().filter(r => ['boat', 'sale', 'repayment', 'purchase'].includes(r.kind) && sourceLimit(r) > (sourcePosted.get(r.id) || 0) && (!filter.start || r.date >= filter.start) && (!filter.end || r.date <= filter.end)).sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
    return `${financialFilters()}<div class="metrics">${metric(financeAccount ? FINANCE_ACCOUNTS[financeAccount] + ' recorded balance' : 'Total recorded cash', money(shillings(balance)), 'All dates · opening balances + postings')}${metric('Operating receipts', money(shillings(report.receipts)), 'Selected period · excludes capital and loans')}${metric('Operating payments', money(shillings(report.payments)), 'Selected period · excludes transfers and drawings')}${metric('Operating cash surplus', money(shillings(report.surplus)), 'Receipts minus payments · cash basis')}</div><div class="finance-accounts">${Object.entries(FINANCE_ACCOUNTS).map(([key, name]) => `<button class="account-card ${financeAccount === key ? 'account-selected' : ''}" data-action="account-filter" data-account="${key}"><span>${icon(key === 'bank' ? 'debt' : key === 'mpesa' ? 'document' : 'wallet')} ${name}</span><strong>${money(shillings(all.balances[key]))}</strong><small>All recorded dates${all.balances[key] < 0 ? ' · review negative balance' : ''}</small></button>`).join('')}</div><div class="toolbar">${[['opening', 'Opening balance'], ['income', 'Receive income'], ['expense', 'Pay expense'], ['transfer', 'Transfer'], ['reconcile', 'Check balance']].map(([type, text]) => button('finance-new', '+ ' + text, 'secondary', `data-type="${type}" ${ready ? '' : 'disabled'}`)).join('')}${button('finance-export', 'Export cashbook', 'secondary')}${button('print', 'Print financial report', 'secondary')}</div><div class="notice">Start by entering each account’s opening balance. Cashbook balances use confirmed financial postings only. Boat and fuel records are not automatically added. Post their actual cash once below. Capital, loans, transfers and equipment purchases are separated from operating cash surplus; boat profit remains a separate measure.</div><section class="panel"><div class="section-head"><div><h2>Cashbook</h2><p>Selected period and account · running balance includes earlier postings</p></div></div><div class="table-wrap"><table><thead><tr><th>Date / type</th><th>Account</th><th>Category / party</th><th>Reference</th><th>In (KSh)</th><th>Out (KSh)</th><th>Recorded balance</th><th></th></tr></thead><tbody>${report.entries.length ? report.entries.slice().reverse().map(r => `<tr><td><b>${r.date}</b><small>${esc(FINANCE_TYPES[r.transactionType])}</small></td><td>${esc(FINANCE_ACCOUNTS[r.account] || 'Loan liability')}${r.toAccount ? ' → ' + esc(FINANCE_ACCOUNTS[r.toAccount]) : ''}</td><td>${esc(r.categoryLabel)}<small>${esc(r.counterparty || r.note || '')}</small></td><td>${esc(r.reference || '—')}</td><td>${r.cashIn ? money(shillings(r.cashIn)) : '—'}</td><td>${r.cashOut ? money(shillings(r.cashOut)) : '—'}</td><td>${money(shillings(r.balance))}</td><td>${button('detail', 'View ›', 'text-button', `data-id="${r.id}"`)}</td></tr>`).join('') : `<tr><td colspan="8">${empty()}</td></tr>`}</tbody></table></div></section><section class="panel finance-pending"><div class="section-head"><div><h2>Boat &amp; fuel amounts to account for</h2><p>${sources.length} source records with posting capacity · source dates use the selected period</p></div></div><div class="table-wrap"><table><thead><tr><th>Source</th><th>Recorded reference amount</th><th>Already posted</th><th>Available to post</th><th></th></tr></thead><tbody>${sources.length ? sources.slice(0, 100).map(r => { const posted = sourcePosted.get(r.id) || 0; return `<tr><td><b>${r.date} · ${esc(labels[r.kind])}</b><small>${esc(r.boat || 'Fuel purchase')}</small></td><td>${money(shillings(sourceLimit(r)))}</td><td>${money(shillings(posted))}</td><td>${money(shillings(sourceLimit(r) - posted))}</td><td>${button('finance-source', r.kind === 'purchase' ? 'Post actual payment' : 'Post actual receipt', 'text-button', `data-id="${r.id}" ${ready ? '' : 'disabled'}`)}</td></tr>`; }).join('') : `<tr><td colspan="5">${empty()}</td></tr>`}</tbody></table></div><p class="footnote report-note">Boat reference amounts use total income as a ceiling, not a claim that this cash belongs to the business or is owed. Confirm the actual receipt. Fuel purchases use purchase value; sales and repayments use recorded cash received. Posting is capped to prevent repeated counting. ${sources.length > 100 ? 'Showing 100 sources; narrow the date range for more.' : ''}</p></section><div class="finance-report-grid"><section class="panel"><div class="section-head"><h2>Operating payment categories</h2></div><div class="table-wrap"><table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${report.expenseBreakdown.length ? report.expenseBreakdown.map(r => `<tr><td>${esc(r.category)}</td><td>${money(shillings(r.amount))}</td></tr>`).join('') : `<tr><td colspan="2">${empty()}</td></tr>`}</tbody></table></div><div class="finance-breakdown"><div>Owner capital received <b>${money(shillings(report.capital))}</b></div><div>Owner withdrawals <b>${money(shillings(report.drawings))}</b></div><div>Loans received / principal repaid <b>${money(shillings(report.loanIn))} / ${money(shillings(report.loanRepay))}</b></div><div>Equipment purchases <b>${money(shillings(report.assets))}</b></div></div></section><section class="panel"><div class="section-head"><div><h2>Cashbook trial balance</h2><p>All accounts up to ${filter.end || 'the latest recorded date'} · ignores account/search filters</p></div>${button('trial-export', 'Export', 'text-button')}</div><div class="table-wrap"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${report.trialBalance.map(r => `<tr><td>${esc(r.name)}</td><td>${r.debit ? money(shillings(r.debit)) : '—'}</td><td>${r.credit ? money(shillings(r.credit)) : '—'}</td></tr>`).join('')}<tr><td><b>Total</b></td><td><b>${money(shillings(report.trialDebits))}</b></td><td><b>${money(shillings(report.trialCredits))}</b></td></tr></tbody></table></div><p class="footnote report-note">${report.trialDebits === report.trialCredits ? 'Balanced: each posted entry has equal debits and credits.' : 'Review required: trial balance does not balance.'} This covers the recorded cashbook; it is not a complete accrual profit-and-loss statement.</p></section></div><section class="panel finance-checks"><div class="section-head"><div><h2>Account balance checks</h2><p>Compare an observed cash / statement balance with recorded postings.</p></div>${button('finance-new', 'Check a balance', 'secondary', `data-type="reconcile" ${ready ? '' : 'disabled'}`)}</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Account</th><th>Recorded then</th><th>Observed balance</th><th>Difference</th><th></th></tr></thead><tbody>${report.checks.length ? report.checks.slice().reverse().map(r => `<tr><td>${r.date}</td><td>${FINANCE_ACCOUNTS[r.account]}</td><td>${money(shillings(r.expected))}</td><td>${money(shillings(r.counted))}</td><td><span class="badge ${r.difference ? 'amber' : ''}">${money(shillings(r.difference))}</span></td><td>${button('detail', 'View', 'text-button', `data-id="${r.id}"`)}</td></tr>`).join('') : `<tr><td colspan="6">${empty()}</td></tr>`}</tbody></table></div><p class="footnote report-note">Checks do not adjust money automatically. Recorded-then balances are recalculated if earlier entries are corrected or backdated.</p></section>`;
}
function openFinance(type = 'income', existing = null, source = null, seed = null) {
    if (!ready)
        return;
    if (existing?.sourceId)
        source = resolveSource(state.records, existing.sourceId);
    if (source)
        type = source.kind === 'purchase' ? 'source_payment' : 'source_receipt';
    activeModal = { kind: 'finance', transactionType: type, ...(existing ? { id: existing.id } : {}), ...(source ? { sourceId: source.id } : {}) };
    const options = Object.entries(FINANCE_TYPES).filter(([key]) => (source || existing) ? key === type : !['source_receipt', 'source_payment', 'invoice_receipt', 'bill_payment', 'payroll_payment'].includes(key));
    const categoryOptions = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const sourceAlready = source ? live().filter(r => r.kind === 'finance' && r.id !== existing?.id && r.sourceId && resolveSource(state.records, r.sourceId)?.id === source.id).reduce((sum, r) => sum + cents(r.amount), 0) : 0;
    const available = source ? Math.max(0, sourceLimit(source) - sourceAlready) : null;
    const initial = existing || { date: today(), transactionType: type, account: financeAccount || 'cash', toAccount: 'bank', amount: source && source.kind !== 'boat' ? shillings(available) : 0, category: categoryOptions[0], sourceId: source?.id || '', counterparty: source?.boat || '', reference: '', note: '' };
    const min = type === 'reconcile' ? '-10000000000' : ['opening', 'loan_opening'].includes(type) ? '0' : '0.01';
    const body = `${source ? `<div class="notice">${esc(labels[source.kind])} · ${source.date} · ${esc(source.boat || 'Fuel store')}<br>Available posting ceiling: ${money(shillings(available))}. ${source.kind === 'boat' ? 'Enter only cash actually received, not assumed income or profit.' : 'Confirm actual cash, the account and date before posting.'}</div>` : ''}<form id="record-form"><div class="form-grid"><label>Transaction type<select name="transactionType" id="finance-type">${options.map(([key, label]) => `<option value="${key}"${selected(key, type)}>${label}</option>`).join('')}</select></label><label>Date<input name="date" type="date" value="${initial.date}" required></label>${type !== 'loan_opening' ? `<label>${type === 'transfer' ? 'From account' : 'Account'}<select name="account">${financeOptions(initial.account)}</select></label>` : ''}${type === 'transfer' ? `<label>To account<select name="toAccount">${financeOptions(initial.toAccount)}</select></label>` : ''}<label>${type === 'reconcile' ? 'Observed balance' : 'Amount'} (KSh)<input name="amount" type="number" step="0.01" min="${min}" max="10000000000" value="${initial.amount}" required></label>${['income', 'expense'].includes(type) ? `<label>Category<select name="category">${categoryOptions.map(c => `<option${selected(c, initial.category)}>${esc(c)}</option>`).join('')}</select></label>` : ''}<label>Paid to / received from<input name="counterparty" value="${esc(initial.counterparty || '')}" maxlength="120"></label><label>Unique payment / receipt reference<input name="reference" value="${esc(initial.reference || '')}" maxlength="80" placeholder="Optional transaction code"></label>${source ? `<input type="hidden" name="sourceId" value="${esc(existing?.sourceId || source.id)}">` : ''}<label class="full">Notes<textarea name="note" maxlength="1000">${esc(initial.note || '')}</textarea></label></div>${existing ? '<label class="correction-reason">Reason for correction<input name="correctionReason" maxlength="300" required></label>' : ''}<div id="form-summary" class="form-summary"></div><p id="draft-status" class="footnote">Amounts use KSh. Changes are saved only when you submit.</p><div class="dialog-actions">${button('close', 'Cancel', 'secondary', 'type="button"')}<button class="primary" type="submit">${existing ? 'Save correction' : 'Save financial entry'}</button></div></form>`;
    dialog(existing ? 'Correct financial entry' : 'Account for finances', body);
    const form = dialogs.querySelector('#record-form');
    let values = initial;
    if (!source && !existing && !seed) {
        try {
            const draft = JSON.parse(localStorage.getItem(draftKey()) || 'null');
            if (draft) {
                values = draft;
                document.querySelector('#draft-status').textContent = 'Unfinished financial draft restored.';
            }
        }
        catch { }
    }
    if (seed)
        values = { ...initial, ...seed, transactionType: type };
    for (const [key, value] of Object.entries(values))
        if (form.elements.namedItem(key))
            form.elements.namedItem(key).value = String(value ?? '');
    updateSummary();
}
function updateFinanceSummary(form) { const data = Object.fromEntries(new FormData(form)), amount = Number(data.amount || 0), type = data.transactionType; let text = type === 'transfer' ? `Move ${money(amount)} from ${FINANCE_ACCOUNTS[data.account] || '—'} to ${FINANCE_ACCOUNTS[data.toAccount] || '—'}. Total cash across all accounts does not change.` : type === 'reconcile' ? `Compare ${money(amount)} observed with the recorded balance as of this check. No automatic adjustment is made.` : type === 'loan_opening' ? `Record ${money(amount)} of pre-existing loan principal. Cash balances do not change.` : `${esc(FINANCE_TYPES[type] || 'Financial entry')}: ${money(amount)}${data.account ? ' · ' + esc(FINANCE_ACCOUNTS[data.account]) : ''}.`; document.querySelector('#form-summary').innerHTML = text; }
function financeDetail(r) { activeModal = { kind: 'finance', transactionType: r.transactionType, id: r.id }; const source = r.sourceId ? resolveSource(state.records, r.sourceId) : null, lines = journalFor(r, state.records); const body = `<div class="details"><div><span>Date</span><b>${r.date}</b></div><div><span>Type</span><b>${esc(FINANCE_TYPES[r.transactionType])}</b></div><div><span>Amount</span><b>${money(r.amount)}</b></div>${r.account ? `<div><span>Account</span><b>${FINANCE_ACCOUNTS[r.account]}</b></div>` : ''}${r.toAccount ? `<div><span>To account</span><b>${FINANCE_ACCOUNTS[r.toAccount]}</b></div>` : ''}${source ? `<div><span>Source</span><b>${esc(labels[source.kind])} · ${source.date} · ${esc(source.boat || 'Fuel store')}</b></div>` : ''}<div><span>Reference</span><b>${esc(r.reference || '—')}</b></div><div><span>Counterparty</span><b>${esc(r.counterparty || '—')}</b></div><div><span>Notes</span><b>${esc(r.note || '—')}</b></div></div>${lines.length ? `<h3 class="subheading">Journal entry</h3><div class="table-wrap"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${lines.map(p => `<tr><td>${esc(accountName(p.account, state.records))}</td><td>${p.debit ? money(shillings(p.debit)) : '—'}</td><td>${p.credit ? money(shillings(p.credit)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}${r.void ? '<div class="notice warning">Voided financial entry — excluded from balances.</div>' : `<div class="toolbar">${button('edit', 'Edit &amp; correct', 'primary', `data-id="${r.id}"`)}</div><form id="void-form" class="correction"><h3>Void without replacing</h3><label>Reason<input name="reason" maxlength="300" required></label><button class="danger" type="submit">Void financial entry</button></form>`}`; dialog('Financial entry', body + receiptLinks(r)); }
document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled)
        return;
    const action = b.dataset.action;
    if (action === 'finance-new')
        openFinance(b.dataset.type);
    if (action === 'finance-source') {
        const source = live().find(r => r.id === b.dataset.id);
        if (source)
            openFinance(source.kind === 'purchase' ? 'source_payment' : 'source_receipt', null, source);
    }
    if (action === 'account-filter') {
        financeAccount = financeAccount === b.dataset.account ? '' : b.dataset.account;
        render();
    }
    if (action === 'finance-clear') {
        financeAccount = '';
        filter = { boat: '', start: '', end: '', search: '' };
        error = '';
        render();
    }
    if (action === 'finance-export') {
        const report = financeReport(state.records, financeScope());
        exportCSV(report.entries.map(r => ({ date: r.date, type: FINANCE_TYPES[r.transactionType], account: FINANCE_ACCOUNTS[r.account] || 'Loan liability', toAccount: FINANCE_ACCOUNTS[r.toAccount] || '', category: r.categoryLabel, counterparty: r.counterparty, reference: r.reference, amount: r.amount, cashIn: shillings(r.cashIn), cashOut: shillings(r.cashOut), recordedBalance: shillings(r.balance), note: r.note })), 'true-fish-cashbook');
    }
    if (action === 'trial-export') {
        const report = financeReport(state.records, { end: filter.end });
        exportCSV(report.trialBalance.map(r => ({ account: r.name, debit: shillings(r.debit), credit: shillings(r.credit) })), 'true-fish-cashbook-trial-balance');
    }
});
document.addEventListener('change', e => {
    if (e.target.id === 'finance-type') {
        const form = dialogs.querySelector('#record-form'), data = Object.fromEntries(new FormData(form));
        if (activeModal.id)
            return;
        openFinance(data.transactionType, null, null, { date: data.date, account: data.account || 'cash', toAccount: data.toAccount || 'bank', amount: data.amount, counterparty: data.counterparty, reference: data.reference, note: data.note });
    }
});
document.addEventListener('submit', e => {
    if (e.target.id !== 'finance-filters')
        return;
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target));
    if (values.start && values.end && values.start > values.end) {
        error = 'The start date must be on or before the end date.';
        render();
        return;
    }
    financeAccount = values.account;
    filter = { ...filter, start: values.start, end: values.end, search: values.search };
    error = '';
    render();
});
function exportFinancialCashbook() { const report = financeReport(state.records, financeScope()); exportCSV(report.entries.map(r => ({ date: r.date, type: FINANCE_TYPES[r.transactionType], account: FINANCE_ACCOUNTS[r.account] || 'Loan liability', toAccount: FINANCE_ACCOUNTS[r.toAccount] || '', category: r.categoryLabel, counterparty: r.counterparty, reference: r.reference, amount: r.amount, cashIn: shillings(r.cashIn), cashOut: shillings(r.cashOut), recordedBalance: shillings(r.balance), note: r.note })), 'true-fish-cashbook'); }

let importState = null;
function localActor() {
    try {
        return actorFor(state, browserLedger.actorId);
    }
    catch {
        return { id: '', name: 'Choose a profile', role: 'viewer' };
    }
}
function defaultRecordKind() { return ({ 'Finances': 'finance', 'Receipts': 'finance', 'Fuel stock': 'purchase', 'Fuel debts': 'credit', 'Donations': 'donation', 'Customers & bills': 'party', 'Accounting': 'asset', 'Crew & maintenance': 'maintenance', 'Imports & matching': 'statement' })[tab] || 'boat'; }
function businessTable(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">${empty()}</td></tr>`}</tbody></table></div>`; }
const businessView = r => button('detail', 'View / correct', 'text-button', `data-id="${r.id}"`);
function docPaymentButton(r) { return button('document-pay', r.kind === 'invoice' ? 'Receive payment' : 'Record payment', 'text-button', `data-id="${r.id}" ${ready ? '' : 'disabled'}`); }
function businessPage(name) {
    if (name === 'Customers & bills')
        return partiesPage();
    if (name === 'Accounting')
        return accountingPage();
    if (name === 'Crew & maintenance')
        return crewMaintenancePage();
    if (name === 'Imports & matching')
        return importsMatchingPage();
    return controlsPage();
}
function partiesPage() { const asOf = filter.end || today(), parties = live().filter(r => r.kind === 'party'), invoices = partyOutstanding(state.records, 'invoice', asOf), bills = partyOutstanding(state.records, 'bill', asOf); const summary = rows => rows.reduce((n, r) => n + r.balance, 0); return `<div class="metrics three">${metric('Customer invoices due', money(shillings(summary(invoices))), 'As of ' + asOf)}${metric('Supplier bills due', money(shillings(summary(bills))), 'As of ' + asOf)}${metric('Overdue documents', String([...invoices, ...bills].filter(r => r.overdue).length), 'Unpaid and past their due date')}</div><div class="toolbar">${newButton('party', '+ Customer / supplier')}${newButton('invoice', '+ Invoice')}${newButton('bill', '+ Supplier bill')}${button('business-export', 'Export documents', 'secondary', 'data-report="documents"')}</div><div class="notice">Create documents for new sales / costs, or flag a pre-existing balance explicitly. Do not invoice sales already recorded in the fuel log again: fuel receivables are reported separately. Use a linked fuel supplier bill to avoid duplicating its stock cost.</div><section class="panel"><div class="section-head"><h2>Customer invoices</h2></div>${businessTable(['Customer / invoice', 'Date / due', 'Total', 'Paid', 'Balance', 'Status', ''], invoices.map(r => [`${esc(r.partyName)}<small>${esc(r.number)}</small>`, `${r.date}<small>Due ${r.dueDate}</small>`, money(shillings(documentTotal(r))), money(shillings(documentPayments(state.records, r))), money(shillings(r.balance)), `<span class="badge ${r.overdue ? 'amber' : ''}">${r.balance === 0 ? 'Paid' : r.overdue ? 'Overdue' : 'Open'}</span>`, docPaymentButton(r) + businessView(r)]))}</section><section class="panel section-space"><div class="section-head"><h2>Supplier bills</h2></div>${businessTable(['Supplier / bill', 'Date / due', 'Total', 'Paid', 'Balance', 'Status', ''], bills.map(r => [`${esc(r.partyName)}<small>${esc(r.number)}</small>`, `${r.date}<small>Due ${r.dueDate}</small>`, money(shillings(documentTotal(r))), money(shillings(documentPayments(state.records, r))), money(shillings(r.balance)), `<span class="badge ${r.overdue ? 'amber' : ''}">${r.balance === 0 ? 'Paid' : r.overdue ? 'Overdue' : 'Open'}</span>`, docPaymentButton(r) + businessView(r)]))}</section><section class="panel section-space"><div class="section-head"><h2>Customers &amp; suppliers</h2></div>${businessTable(['Name', 'Type', 'Contact', ''], parties.map(r => [esc(r.name), esc(r.partyType), esc([r.phone, r.email].filter(Boolean).join(' · ') || '—'), businessView(r)]))}</section>`; }
function accountingPage() { const end = filter.end || today(), report = accountingReport(state.records, { start: filter.start, end }), balanceRows = report.trial.filter(r => ['A:', 'L:', 'E:'].some(prefix => r.account.startsWith(prefix))); return `<form id="accounting-filters" class="filters"><label>From <input name="start" type="date" value="${filter.start}"></label><label>As of <input name="end" type="date" value="${end}" required></label><button class="secondary" type="submit">Refresh statements</button>${button('print', 'Print statements', 'secondary')}</form><div class="metrics">${metric('Recorded assets', money(shillings(report.assets)), 'As of ' + end)}${metric('Recorded liabilities', money(shillings(report.liabilities)), 'As of ' + end)}${metric('Accrual profit / loss', money(shillings(report.net)), (filter.start || 'All dates') + ' to ' + end)}${metric('Fuel inventory value', money(shillings(report.inventory.value)), qty(report.inventory.litres) + ' L · weighted average')}</div>${report.inventory.unvalued.length ? `<div class="error">${report.inventory.unvalued.length} opening fuel record(s) lack a cost valuation. Reported fuel cost and profit are incomplete until valued. ${newButton('fuel_value', 'Value opening fuel')}</div>` : ''}<div class="notice">These management statements combine recorded invoices/bills, fuel movements, cash postings, payroll and straight-line depreciation. Fuel sales use recorded sales value; boat financial income uses actual posted receipts until your ownership/allocation rules are confirmed. Tax amounts are entered manually; no tax return or automatic tax rate is produced.</div><div class="toolbar">${newButton('asset', '+ Asset register')}${newButton('fuel_value', '+ Opening fuel cost')}${button('business-export', 'Export trial balance', 'secondary', 'data-report="trial"')}${button('business-export', 'Export P&L', 'secondary', 'data-report="pnl"')}${button('business-export', 'Export balance sheet', 'secondary', 'data-report="balance"')}</div><div class="finance-report-grid"><section class="panel"><div class="section-head"><h2>Profit &amp; loss</h2></div>${businessTable(['Income', 'KSh'], report.income.map(r => [esc(r.name), money(shillings(r.amount))]))}${businessTable(['Expenses', 'KSh'], report.expenses.map(r => [esc(r.name), money(shillings(r.amount))]))}<div class="report-total">Profit / loss <b>${money(shillings(report.net))}</b></div></section><section class="panel"><div class="section-head"><h2>Balance sheet</h2></div>${businessTable(['Account', 'Debit', 'Credit'], balanceRows.map(r => [esc(r.name), r.debit ? money(shillings(r.debit)) : '—', r.credit ? money(shillings(r.credit)) : '—']))}<div class="finance-breakdown"><div>Assets <b>${money(shillings(report.assets))}</b></div><div>Liabilities <b>${money(shillings(report.liabilities))}</b></div><div>Opening equity / owner movements <b>${money(shillings(report.equity))}</b></div><div>Accumulated profit / loss <b>${money(shillings(report.retained))}</b></div><div>Balance difference <b>${money(shillings(report.balanceDifference))}</b></div></div></section></div><section class="panel section-space"><div class="section-head"><h2>Full trial balance</h2></div>${businessTable(['Account', 'Debit', 'Credit'], report.trial.map(r => [esc(r.name), r.debit ? money(shillings(r.debit)) : '—', r.credit ? money(shillings(r.credit)) : '—']))}</section><section class="panel section-space"><div class="section-head"><h2>Assets &amp; depreciation</h2></div>${businessTable(['Asset', 'In service', 'Cost', 'Salvage', 'Life', 'Recognition', ''], live().filter(r => r.kind === 'asset').map(r => [esc(r.name), r.date, money(r.amount), money(r.salvage), r.lifeMonths + ' months', r.origin === 'opening' ? 'Opening asset' : 'Existing purchase', businessView(r)]))}<p class="footnote report-note">Straight-line depreciation starts at the end of the month after the in-service date. The register does not duplicate a linked equipment purchase. Full report values depend on complete source records.</p></section>`; }
function crewMaintenancePage() { const crew = live().filter(r => r.kind === 'crew'), payroll = live().filter(r => r.kind === 'payroll'), jobs = live().filter(r => r.kind === 'maintenance'); return `<div class="toolbar">${newButton('crew', '+ Crew member')}${newButton('payroll', '+ Accrue wages')}${newButton('maintenance', '+ Maintenance task')}</div><section class="panel"><div class="section-head"><h2>Crew &amp; boat assignments</h2></div>${businessTable(['Name', 'Position', 'Boat', 'Contact', ''], crew.map(r => [esc(r.name), esc(r.position || '—'), esc(r.boat || 'Unassigned'), esc(r.phone || '—'), businessView(r)]))}</section><section class="panel section-space"><div class="section-head"><h2>Earned wages &amp; payments</h2></div>${businessTable(['Crew', 'Month', 'Earned', 'Paid', 'Outstanding', ''], payroll.map(r => [esc(businessLookup(state.records, r.crewId)?.name || '—'), r.period, money(r.amount), money(shillings(documentPayments(state.records, r))), money(shillings(cents(r.amount) - documentPayments(state.records, r))), docPaymentButton(r) + businessView(r)]))}</section><section class="panel section-space"><div class="section-head"><h2>Boat maintenance schedule</h2></div>${businessTable(['Boat / work', 'Due date', 'Status', 'Estimated cost', ''], jobs.map(r => [`${esc(r.boat)}<small>${esc(r.title)}</small>`, r.dueDate, `<span class="badge ${r.status === 'planned' && r.dueDate < today() ? 'amber' : ''}">${r.status === 'done' ? 'Completed' : r.dueDate < today() ? 'Overdue' : 'Planned'}</span>`, money(r.amount), businessView(r)]))}<p class="footnote report-note">Maintenance costs are estimates / work-log information. Record actual bills or expenses separately; work logs do not duplicate financial costs. Crew payments should settle their payroll record, not repeat wage expense.</p></section>`; }
function selectField(name, label, options, value = '', required = true) { return `<label>${label}<select name="${name}" ${required ? 'required' : ''}><option value="">Choose…</option>${options.map(([v, t]) => `<option value="${esc(v)}"${selected(String(v), String(value))}>${esc(t)}</option>`).join('')}</select></label>`; }
function inputField(name, label, type = 'text', value = '', extra = '') { return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`; }
function recordOptions(kind, formatter = r => r.name || r.number || r.date) { return live().filter(r => r.kind === kind).map(r => [r.id, formatter(r)]); }
function openBusinessForm(kind, existing = null, seed = {}) {
    if (!ready)
        return;
    activeModal = { kind, ...(existing ? { id: existing.id } : {}) };
    const v = { date: today(), amount: 0, taxAmount: 0, dueDate: today(), salvage: 0, lifeMonths: 60, origin: 'opening', partyType: 'customer', period: today().slice(0, 7), status: 'planned', category: 'expense', opening: false, taxRecoverable: false, ...existing, ...seed };
    let fields = inputField('date', kind === 'asset' ? 'In-service date' : 'Date', 'date', v.date, 'required');
    const text = (n, l, required = true) => inputField(n, l, 'text', v[n] || '', `maxlength="250" ${required ? 'required' : ''}`), num = (n, l, zero = false) => inputField(n, l, 'number', v[n] ?? 0, `step="${n === 'lifeMonths' ? '1' : '0.01'}" min="${zero ? 0 : .01}" max="10000000000" required`), sel = (n, l, options, required = true) => selectField(n, l, options, v[n] || '', required);
    if (kind === 'party')
        fields += text('name', 'Name') + sel('partyType', 'Type', [['customer', 'Customer'], ['supplier', 'Supplier'], ['both', 'Both']]) + text('phone', 'Phone', false) + text('email', 'Email', false) + text('address', 'Address', false);
    if (['invoice', 'bill'].includes(kind)) {
        const parties = live().filter(r => r.kind === 'party' && (r.partyType === 'both' || r.partyType === (kind === 'invoice' ? 'customer' : 'supplier'))).map(r => [r.id, r.name]);
        fields += sel('partyId', kind === 'invoice' ? 'Customer' : 'Supplier', parties) + text('number', 'Document number') + num('amount', 'Amount before separately recorded tax (KSh)') + num('taxAmount', 'Tax amount entered manually (KSh)', true) + inputField('dueDate', 'Due date', 'date', v.dueDate, 'required') + sel('opening', 'Is this a pre-existing opening balance?', [['false', 'No — new sale / cost'], ['true', 'Yes — opening balance only']]);
        if (kind === 'bill')
            fields += sel('taxRecoverable', 'Treat entered bill tax as recoverable?', [['false', 'No — include it in cost'], ['true', 'Yes — record separately as recoverable tax']]) + sel('category', 'Bill category', [['expense', 'Operating expense'], ['fuel', 'Fuel inventory — link purchase'], ['equipment', 'Equipment / asset']]) + sel('sourceId', 'Fuel purchase (required for fuel bills)', recordOptions('purchase', r => r.date + ' · ' + qty(r.litres) + ' L · ' + money(r.litres * r.price)), false);
    }
    if (kind === 'asset')
        fields += text('name', 'Asset name') + num('amount', 'Recorded cost (KSh)') + num('salvage', 'Salvage value (KSh)', true) + num('lifeMonths', 'Useful life (months)') + sel('origin', 'Cost recognition', [['opening', 'Opening asset not yet in the ledger'], ['linked', 'Cost already in a purchase / bill']]) + sel('sourceId', 'Existing equipment purchase / bill', live().filter(r => (r.kind === 'finance' && r.transactionType === 'asset_buy') || (r.kind === 'bill' && r.category === 'equipment')).map(r => [r.id, r.date + ' · ' + money(r.amount) + ' · ' + (r.number || r.counterparty || 'Equipment purchase')]), false);
    if (kind === 'fuel_value')
        fields += sel('sourceId', 'Opening fuel', recordOptions('opening', r => r.date + ' · ' + qty(r.litres) + ' L')) + num('unitCost', 'Cost per litre (KSh)', true);
    if (kind === 'crew')
        fields += text('name', 'Name') + text('position', 'Role / position', false) + text('phone', 'Phone', false) + sel('boat', 'Assigned boat', BOATS.map(b => [b, b]), false);
    if (kind === 'payroll')
        fields += sel('crewId', 'Crew member', recordOptions('crew')) + inputField('period', 'Wages for month', 'month', v.period, 'required') + num('amount', 'Wages earned (KSh)');
    if (kind === 'maintenance')
        fields += sel('boat', 'Boat', BOATS.map(b => [b, b])) + text('title', 'Work / service description') + inputField('dueDate', 'Due date', 'date', v.dueDate, 'required') + sel('status', 'Status', [['planned', 'Planned'], ['done', 'Completed']]) + num('amount', 'Estimated / logged cost (KSh)', true) + sel('sourceId', 'Optional related financial record', live().filter(r => r.kind === 'bill' || (r.kind === 'finance' && ['expense', 'bill_payment'].includes(r.transactionType))).map(r => [r.id, r.date + ' · ' + money(r.amount) + ' · ' + (r.number || r.counterparty || 'Expense')]), false);
    if (kind === 'statement')
        fields += sel('account', 'Account', Object.entries(FINANCE_ACCOUNTS)) + inputField('amount', 'Signed amount: money in + / money out −', 'number', v.amount, 'step="0.01" required') + text('reference', 'Reference', false) + text('description', 'Statement description', false);
    if (kind === 'match') {
        const statement = businessLookup(state.records, v.statementId, 'statement');
        fields += `<input name="statementId" type="hidden" value="${esc(v.statementId)}">` + sel('financeId', 'Matching account movement', statement ? statementSuggestions(state.records, statement).map(r => [r.id, r.date + ' · ' + FINANCE_TYPES[r.transactionType] + ' · ' + money(shillings(cashLeg(r, statement.account))) + ' · ' + (r.reference || r.counterparty || '')]) : []);
    }
    fields += `<label class="full">Notes<textarea name="note" maxlength="1000">${esc(v.note || '')}</textarea></label>`;
    const body = `<form id="record-form"><div class="form-grid">${fields}</div>${existing ? '<label class="correction-reason">Reason for correction<input name="correctionReason" required maxlength="300"></label>' : ''}<div id="form-summary" class="form-summary"></div><p id="draft-status" class="footnote">Review the source dates and amounts before saving.</p><div class="dialog-actions">${button('close', 'Cancel', 'secondary', 'type="button"')}<button class="primary" type="submit">${existing ? 'Save correction' : 'Save record'}</button></div></form>`;
    dialog(BUSINESS_LABELS[kind], body);
    const form = dialogs.querySelector('#record-form');
    for (const [key, value] of Object.entries(v))
        if (form.elements.namedItem(key))
            form.elements.namedItem(key).value = String(value ?? '');
    if (kind === 'fuel_value' && !existing) {
        const source = businessLookup(state.records, form.elements.namedItem('sourceId').value);
        if (source)
            form.elements.namedItem('date').value = source.date;
    }
    updateSummary();
}
function updateBusinessSummary(form) {
    const values = Object.fromEntries(new FormData(form));
    let text = 'This record will be validated with the complete ledger before saving.';
    if (['invoice', 'bill'].includes(activeModal.kind))
        text = 'Document total: ' + money(Number(values.amount || 0) + Number(values.taxAmount || 0)) + '. Tax is entered manually; no rate is assumed.';
    if (activeModal.kind === 'asset')
        text = 'Monthly straight-line depreciation starts at the month-end after the in-service date. Do not recognise an existing purchase cost twice.';
    if (activeModal.kind === 'maintenance')
        text = 'Work-log cost does not create an expense automatically. Record the actual bill / payment separately.';
    if (activeModal.kind === 'payroll')
        text = 'Saving accrues a wage expense and crew payable. Record its payment from the crew page.';
    document.querySelector('#form-summary').textContent = text;
}
function businessDetail(r) {
    activeModal = { kind: r.kind, id: r.id };
    const fieldName = { partyId: 'Customer / supplier', crewId: 'Crew member', sourceId: 'Linked source', financeId: 'Matched financial entry', statementId: 'Statement line', enteredByName: 'Entered by', taxAmount: 'Tax amount' };
    const visible = Object.entries(r).filter(([k]) => !['id', 'enteredBy', 'importKey'].includes(k));
    const body = `<div class="details">${visible.map(([k, v]) => {
        let value = v;
        if (['partyId', 'crewId', 'sourceId', 'financeId', 'statementId'].includes(k) && v) {
            const found = businessLookup(state.records, v);
            value = found ? (found.name || found.number || [labels[found.kind], found.date, found.amount !== undefined ? money(found.amount) : ''].join(' · ')) : 'Missing source';
        }
        return `<div><span>${esc(fieldName[k] || k)}</span><b>${esc(value)}</b></div>`;
    }).join('')}</div>${r.void ? '<div class="notice warning">Voided record</div>' : `<div class="toolbar">${button('edit', 'Edit &amp; correct', 'primary', `data-id="${r.id}"`)}</div><form id="void-form" class="correction"><label>Reason to void<input name="reason" maxlength="300" required></label><button class="danger" type="submit">Void record</button></form>`}`;
    dialog(labels[r.kind], body + receiptLinks(r));
}
function openDocumentPayment(doc, existing = null) {
    if (!doc)
        return toast('Document not found.');
    const type = { invoice: 'invoice_receipt', bill: 'bill_payment', payroll: 'payroll_payment' }[doc.kind], total = doc.kind === 'payroll' ? cents(doc.amount) : documentTotal(doc), paid = documentPayments(state.records.filter(r => r.id !== existing?.id), doc), remaining = total - paid;
    if (remaining <= 0 && !existing)
        return toast('This document is fully paid.');
    activeModal = { kind: 'finance', transactionType: type, ...(existing ? { id: existing.id } : {}) };
    const body = `<div class="notice">${esc(doc.number || businessLookup(state.records, doc.crewId)?.name || 'Payroll')} · ${doc.date}<br>Remaining before this payment: ${money(shillings(remaining))}</div><form id="record-form"><input name="transactionType" type="hidden" value="${type}"><input name="documentId" type="hidden" value="${doc.id}"><div class="form-grid">${inputField('date', 'Payment date', 'date', existing?.date || today(), 'required')}${selectField('account', 'Account', Object.entries(FINANCE_ACCOUNTS), existing?.account || 'cash')}${inputField('amount', 'Amount actually paid / received (KSh)', 'number', existing?.amount ?? shillings(remaining), 'step="0.01" min="0.01" required')}${inputField('reference', 'Unique transaction reference', 'text', existing?.reference || '', 'maxlength="80"')}${inputField('counterparty', 'Counterparty', 'text', existing?.counterparty || businessLookup(state.records, doc.partyId || doc.crewId)?.name || '', 'maxlength="120"')}<label class="full">Notes<textarea name="note">${esc(existing?.note || '')}</textarea></label></div>${existing ? '<label class="correction-reason">Reason for correction<input name="correctionReason" required></label>' : ''}<div id="form-summary" class="form-summary"></div><p id="draft-status" class="footnote">Payment clears the document balance; it does not repeat the invoice income or bill/payroll expense.</p><div class="dialog-actions">${button('close', 'Cancel', 'secondary', 'type="button"')}<button class="primary" type="submit">Save payment</button></div></form>`;
    dialog(FINANCE_TYPES[type], body);
    updateSummary();
}
function importsMatchingPage() { const statements = live().filter(r => r.kind === 'statement'), matches = live().filter(r => r.kind === 'match'), unmatched = statements.filter(s => !matches.some(m => businessLookup(state.records, m.statementId)?.id === s.id)); return `<div class="notice">CSV and XLSX files are read locally. Select the worksheet, header row, date format and column mapping, then review the preview before importing. Formulas without saved values and invalid rows are not guessed. Statement matching never creates cash entries automatically.</div><section class="panel"><div class="section-head"><div><h2>Spreadsheet import</h2><p>Excel .xlsx and comma-separated .csv · no upload to a server</p></div>${button('import-template', 'Download CSV template', 'secondary')}</div><div class="import-body"><label>Choose a local file<input id="import-file" type="file" accept=".csv,.xlsx"></label>${importState ? importMappingForm() : ''}</div></section><section class="panel section-space"><div class="section-head"><div><h2>Unmatched statement lines</h2><p>${unmatched.length} statement lines await review</p></div>${newButton('statement', '+ Manual statement line')}</div>${businessTable(['Date', 'Account', 'Reference / description', 'Signed amount', 'Suggestions', ''], unmatched.map(r => [r.date, FINANCE_ACCOUNTS[r.account], `${esc(r.reference || '—')}<small>${esc(r.description || '')}</small>`, money(r.amount), String(statementSuggestions(state.records, r).length), button('statement-match', 'Review match', 'text-button', `data-id="${r.id}"`) + businessView(r)]))}</section><section class="panel section-space"><div class="section-head"><h2>Reviewed matches</h2></div>${businessTable(['Statement', 'Account', 'Financial entry', ''], matches.map(r => { const s = businessLookup(state.records, r.statementId), f = businessLookup(state.records, r.financeId); return [s ? `${s.date} · ${money(s.amount)}` : 'Missing', s ? FINANCE_ACCOUNTS[s.account] : '—', f ? `${f.date} · ${esc(f.reference || FINANCE_TYPES[f.transactionType])}` : 'Missing', businessView(r)]; }))}</section>`; }
function importMappingForm() { const s = importState, sheet = s.sheets[s.sheet || 0], header = s.header ?? 0, headers = sheet.rows[header] || [], kind = s.kind || 'boat', mapping = s.mapping || guessMapping(headers, kind), defaults = s.config || {}; return `<form id="import-config"><div class="form-grid">${selectField('kind', 'Import type', Object.entries(IMPORT_NAMES), kind)}${selectField('sheet', 'Worksheet', s.sheets.map((x, i) => [String(i), x.name]), String(s.sheet || 0))}${inputField('header', 'Header row (1-based)', 'number', header + 1, 'min="1" required')}${inputField('start', 'First data row', 'number', s.start || header + 2, 'min="1" required')}${inputField('end', 'Last data row (max 1000 per batch)', 'number', s.end || Math.min(sheet.rows.length, header + 1001), 'min="1" required')}${selectField('dateFormat', 'Text date format', [['DMY', 'Day / month / year'], ['MDY', 'Month / day / year']], defaults.dateFormat || 'DMY')}${inputField('defaultDate', 'Optional explicit date for every selected row', 'date', defaults.defaultDate || '')}${inputField('dueDate', 'Default due date when its column is blank', 'date', defaults.dueDate || '')}${selectField('fillDate', 'Blank dates', [['false', 'Reject blank transaction dates'], ['true', 'Use the previous valid row date']], defaults.fillDate ? 'true' : 'false')}${selectField('boat', 'Default boat if its cell is blank', BOATS.map(b => [b, b]), defaults.boat || '', false)}${selectField('account', 'Confirmed statement / cashbook account', Object.entries(FINANCE_ACCOUNTS), defaults.account || 'bank')}</div><h3 class="subheading">Map each field to a source column</h3><div class="form-grid">${(IMPORT_FIELDS[kind] || []).map(f => selectField('map_' + f, f, headers.map((h, i) => [String(i), importColumn(i) + ' · ' + String(h || 'Column ' + (i + 1))]), String(mapping[f] ?? -1), false)).join('')}</div><p class="footnote">Unmapped optional boat costs default to zero. Income, Boss, Commission, quantities and transaction amounts must be supplied. Check date discrepancies in the original files before choosing a date override.</p><div class="toolbar"><button class="primary" type="submit">Build import preview</button>${button('import-remap', 'Refresh worksheet / header / type', 'secondary', 'type="button"')}</div></form>${s.preview ? `<h3 class="subheading">Preview — choose rows to save</h3><p class="footnote">Changing a mapping or date requires rebuilding this preview before import.</p><div class="table-wrap"><table><thead><tr><th>Use</th><th>Source row</th><th>Converted record</th><th>Validation</th></tr></thead><tbody>${s.preview.map((r, i) => `<tr><td><input type="checkbox" name="import-row" value="${i}" ${r.error ? 'disabled' : 'checked'} aria-label="Import source row ${r.row}"></td><td>${r.row}</td><td>${r.record ? esc(JSON.stringify(r.record)) : '—'}</td><td class="${r.error ? 'error-text' : ''}">${esc(r.error || 'Valid row — complete ledger checked again on save')}</td></tr>`).join('')}</tbody></table></div><div class="toolbar">${button('import-commit', 'Import selected preview rows', 'primary')}</div>` : ''}`; }
async function applyControl(action, values) {
    try {
        let credential = null;
        const actorId = browserLedger.actorId;
        if (action === 'team' && deviceAccess) {
            const old = deviceAccess.read().users.find(u => u.id === values.id);
            credential = await deviceAccess.prepare(values.loginName, values.password, old);
            if (deviceAccess.read().users.some(u => u.id !== values.id && u.username === credential.username)) throw Error('That username already exists.');
        }
        state = await browserLedger.control(action, values, state.version);
        if (credential) {
            const user = state.controls.staff.find(s => s.id === values.id) || state.controls.staff.at(-1);
            deviceAccess.setUser(user.id, credential);
            if (user.id === actorId) { location.reload(); return; }
        }
        ready = true;
        error = '';
        close();
        render();
        toast('Users and review controls updated.');
    }
    catch (e) {
        const el = dialogs.querySelector('#modal-error');
        if (activeModal && el)
            el.textContent = e.message;
        else {
            error = e.message;
            render();
        }
    }
}
document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled)
        return;
    const a = b.dataset.action;
    if (a === 'document-pay')
        openDocumentPayment(businessLookup(state.records, b.dataset.id));
    if (a === 'staff-new')
        openStaffForm();
    if (a === 'staff-edit')
        openStaffForm(normalControls(state.controls).staff.find(s => s.id === b.dataset.id));
    if (a === 'statement-match')
        openBusinessForm('match', null, { statementId: b.dataset.id });
    if (a === 'business-export') {
        const report = accountingReport(state.records, { start: filter.start, end: filter.end || today() });
        if (b.dataset.report === 'trial')
            exportCSV(report.trial.map(r => ({ account: r.name, debit: shillings(r.debit), credit: shillings(r.credit) })), 'true-fish-full-trial');
        if (b.dataset.report === 'pnl')
            exportCSV([...report.income.map(r => ({ type: 'Income', ...r, amount: shillings(r.amount) })), ...report.expenses.map(r => ({ type: 'Expense', ...r, amount: shillings(r.amount) })), { type: 'Result', name: 'Profit / loss', amount: shillings(report.net) }], 'true-fish-profit-loss');
        if (b.dataset.report === 'balance')
            exportCSV([{ item: 'Assets', amount: shillings(report.assets) }, { item: 'Liabilities', amount: shillings(report.liabilities) }, { item: 'Opening equity / owner movements', amount: shillings(report.equity) }, { item: 'Accumulated profit / loss', amount: shillings(report.retained) }, { item: 'Balance difference', amount: shillings(report.balanceDifference) }], 'true-fish-balance-sheet');
        if (b.dataset.report === 'documents')
            exportCSV([...partyOutstanding(state.records, 'invoice', filter.end || today()), ...partyOutstanding(state.records, 'bill', filter.end || today())].map(r => ({ type: r.kind, party: r.partyName, number: r.number, date: r.date, dueDate: r.dueDate, total: shillings(documentTotal(r)), balance: shillings(r.balance), overdue: r.overdue })), 'true-fish-documents');
    }
    if (a === 'import-remap') {
        const data = Object.fromEntries(new FormData(document.querySelector('#import-config')));
        importState = { ...importState, kind: data.kind, sheet: Number(data.sheet), header: Number(data.header) - 1, start: null, end: null, mapping: null, preview: null };
        render();
    }
    if (a === 'import-template') {
        const kind = importState?.kind || 'boat';
        exportCSV([Object.fromEntries(IMPORT_FIELDS[kind].map(f => [f, '']))], 'true-fish-' + kind + '-template');
    }
    if (a === 'import-commit') {
        try {
            if (!importState?.preview || importState.previewStale)
                throw Error('Build a fresh preview after changing import settings.');
            const selectedRows = [...document.querySelectorAll('input[name="import-row"]:checked')].map(x => importState.preview[Number(x.value)]).filter(r => r && !r.error).map(r => r.record);
            state = await browserLedger.saveBatch(selectedRows, state.version);
            importState.preview = null;
            ready = true;
            error = '';
            render();
            toast('Selected rows imported; originals are unchanged.');
        }
        catch (e) {
            error = e.message;
            render();
        }
    }
});
document.addEventListener('change', async (e) => {
    if (e.target.id === 'active-profile') {
        if (deviceAccess || globalThis.TRUEFISH_SERVER) return;
        browserLedger.actorId = e.target.value;
        try {
            localStorage.setItem(browserLedger.key + ':actor', e.target.value);
        }
        catch { }
        render();
    }
    if (e.target.id === 'import-file') {
        const file = e.target.files[0];
        if (!file)
            return;
        try {
            const sheets = /\.xlsx$/i.test(file.name) ? await readXlsx(await file.arrayBuffer()) : /\.csv$/i.test(file.name) ? [{ name: file.name, rows: parseCsv(await file.text()), date1904: false }] : null;
            if (!sheets)
                throw Error('Choose .xlsx or .csv.');
            const index = sheets[0].rows.findIndex(row => row.some(v => String(v).trim().toLowerCase() === 'date'));
            importState = { sheets, sheet: 0, header: index >= 0 ? index : 0, kind: 'boat', preview: null };
            error = '';
            render();
        }
        catch (e) {
            error = e.message;
            render();
        }
    }
});
document.addEventListener('submit', async (e) => {
    const id = e.target.id;
    if (!['team-form', 'review-form', 'reopen-form', 'accounting-filters', 'import-config'].includes(id))
        return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (id === 'team-form') {
        const target = normalControls(state.controls).staff.find(s => s.id === data.id);
        const permissions = target?.id === 'owner' ? Object.keys(RIGHTS) : Object.keys(RIGHTS).filter(p => data['right_' + p] === 'true');
        return applyControl('team', { ...data, permissions, active: data.active === 'true' });
    }
    if (id === 'review-form')
        return applyControl(e.submitter?.value || 'approve', { through: data.through });
    if (id === 'reopen-form') {
        if (confirm('Reopen all closed periods? The reason and local profile will be recorded.'))
            return applyControl('reopen', data);
        return;
    }
    if (id === 'accounting-filters') {
        if (data.start && data.start > data.end) {
            error = 'Start date must not follow end date.';
            render();
            return;
        }
        filter = { ...filter, start: data.start, end: data.end };
        render();
    }
    if (id === 'import-config') {
        try {
            const mapping = Object.fromEntries(IMPORT_FIELDS[data.kind].map(f => [f, data['map_' + f] === '' ? -1 : Number(data['map_' + f])]));
            const config = { kind: data.kind, mapping, start: Number(data.start), end: Number(data.end), dateFormat: data.dateFormat, defaultDate: data.defaultDate, dueDate: data.dueDate, fillDate: data.fillDate === 'true', boat: data.boat, account: data.account };
            importState = { ...importState, kind: data.kind, sheet: Number(data.sheet), header: Number(data.header) - 1, start: config.start, end: config.end, mapping, config, previewStale: false, preview: mapImportRows(importState.sheets[Number(data.sheet)], config, state.records) };
            error = '';
            render();
        }
        catch (e) {
            error = e.message;
            render();
        }
    }
});
function importColumn(index) {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
        name = String.fromCharCode(65 + (n - 1) % 26) + name;
    return name;
}
document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]');
    if (b?.dataset.action === 'server-logout') {
        await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        location.href = '/login.html';
    }
});
for (const event of ['input', 'change'])
    document.addEventListener(event, e => {
        if (e.target.closest?.('#import-config') && importState?.preview) {
            importState.previewStale = true;
            const button = document.querySelector('[data-action="import-commit"]');
            if (button)
                button.disabled = true;
        }
    });

function hybridNavigation() {
    const groups = [['BUSINESS', ['Overview', 'Finances', 'Receipts', 'Customers & bills', 'Accounting']], ['OPERATIONS', ['Boat records', 'Fuel stock', 'Fuel debts', 'Donations', 'Crew & maintenance']], ['INTELLIGENCE', ['Assistant', 'Reports', 'Imports & matching']], ['ADMINISTRATION', ['Review & staff', 'Activity', 'Workbook review', 'Settings']]];
    return groups.map(([title, names]) => `<div class="nav-group">${title}</div>${names.map(name => `<button data-action="navigate" data-tab="${name}" class="${tab === name ? 'selected' : ''}" title="${name}" aria-pressed="${tab === name}"><span class="nav-symbol">${icon(nav.find(n => n[0] === name)?.[1] || 'chart')}</span><span>${name}</span>${name === 'Assistant' ? '<small class="ai-tag">AI</small>' : ''}</button>`).join('')}`).join('');
}
function businessSnapshot() { return intelligenceSnapshot(state.records, today()); }
function cashFigure(n) { return money(shillings(n)); }
function hybridOverview() {
    const s = businessSnapshot(), income = Math.max(0, s.income), expenses = Math.max(0, s.expenses), total = Math.max(income, expenses, 1);
    const cue = (label, value, note, target, color) => `<button class="cue ${color}" data-action="navigate" data-tab="${target}"><span>${label} <span aria-hidden="true">↗</span></span><strong>${value}</strong><small>${note}</small></button>`;
    return `<div class="role-strip"><span><b>Business owner workspace</b><small>Finance, fleet and decisions in one view</small></span><span class="period-pill">Month to date · ${s.month} → ${s.asOf}</span></div>
    <section class="hybrid-hero"><div><div class="eyebrow">YOUR BUSINESS. IN FOCUS.</div><h2>Welcome to your<br>business command centre.</h2><p>Keep the books clear. Keep the fleet moving.</p><div class="hero-actions">${button('new', '+ Create transaction', 'primary', 'data-kind="finance"')}${button('navigate', '✦ Ask True Fish', 'hero-assistant', 'data-tab="Assistant"')}</div></div><div class="hero-balance"><span>RECORDED CASH POSITION</span><strong>${cashFigure(s.availableCash)}</strong><small>Cash + M-Pesa + Bank · through today</small><div class="hero-accounts">${s.accounts.map(a => `<span>${esc(FINANCE_ACCOUNTS[a.account] || a.account)}<b>${cashFigure(a.balance)}</b></span>`).join('')}</div></div></section>
    <div class="workspace-tabs"><b>Business overview</b>${button('navigate', 'Financial statements', 'text-button', 'data-tab="Accounting"')}${button('navigate', 'Fleet performance', 'text-button', 'data-tab="Reports"')}</div>
    <div class="cue-grid">${cue('Money to collect', cashFigure(s.receivables), 'Unpaid customer invoices', 'Customers & bills', 'cue-green')}${cue('Money to pay', cashFigure(s.payables), 'Unpaid supplier bills', 'Customers & bills', 'cue-blue')}${cue('Fuel on hand', qty(s.fuelLitres) + ' L', s.fuelDays === null ? 'No recent usage estimate' : '~' + s.fuelDays.toFixed(1) + ' days of estimated cover', 'Fuel stock', 'cue-teal')}${cue('Needs attention', String(s.findings.filter(f => f.severity === 'warning').length), 'Checks for you to review', 'Assistant', 'cue-amber')}</div>
    <div class="business-dashboard-grid"><section class="panel money-panel"><div class="section-head"><div><h2>Profit &amp; loss</h2><p>Accounting result · month to date</p></div>${button('navigate', 'View report ↗', 'text-button', 'data-tab="Accounting"')}</div><div class="profit-value"><strong class="${s.net < 0 ? 'negative' : ''}">${cashFigure(s.net)}</strong><span>NET RESULT${s.valuationIncomplete ? ' · INCOMPLETE FUEL COSTS' : ''}</span></div><div class="horizontal-chart"><div><span>Income<b>${cashFigure(s.income)}</b></span><i><em style="width:${income / total * 100}%"></em></i></div><div class="expense-bar"><span>Expenses<b>${cashFigure(s.expenses)}</b></span><i><em style="width:${expenses / total * 100}%"></em></i></div></div><p class="panel-caption">Accrual basis. Boat daily profit is reported separately.</p></section>
    <section class="panel priorities"><div class="section-head"><div><h2>Focus for today</h2><p>Based on records through ${s.asOf}</p></div><span class="spark-symbol">✦</span></div>${s.findings.slice(0, 3).map(f => `<button class="priority-item" data-action="navigate" data-tab="${f.tab}"><span class="priority-dot ${f.severity}"></span><span><b>${esc(f.title)}</b><small>${esc(f.detail)}</small></span><span aria-hidden="true">›</span></button>`).join('')}${button('navigate', 'Open all insights →', 'text-button priorities-link', 'data-tab="Assistant"')}</section></div>
    <section class="panel task-ribbon"><span class="ribbon-label">QUICK CREATE</span>${[['boat', 'Boat day'], ['sale', 'Fuel issue'], ['invoice', 'Invoice'], ['bill', 'Supplier bill'], ['payroll', 'Crew wages']].map(([kind, label]) => button('new', '+ ' + label, 'text-button', `data-kind="${kind}"`)).join('')}</section>
    ${dailyBoard()}${trendChart()}<section class="panel"><div class="section-head"><div><h2>Latest transactions</h2><p>Your recent activity across the business</p></div>${button('navigate', 'View ledger ↗', 'text-button', 'data-tab="Reports"')}</div>${table(live().slice().sort((a,b) => String(a.correctedAt || a.created).localeCompare(String(b.correctedAt || b.created))).slice(-6))}</section>`;
}
function assistantPage() {
    const s = businessSnapshot();
    return `<section class="assistant-intro"><div class="assistant-mark">✦</div><div><div class="eyebrow">TRUE FISH INTELLIGENCE</div><h2>A clearer answer. A better next step.</h2><p>Ask about your books, understand cash, and find what needs attention.</p></div><span class="mode-pill">${assistantMode === 'model' ? 'Local AI model' : 'Built-in record analysis'}</span></section>
    <div class="assistant-layout"><section class="panel chat-panel"><div class="section-head"><div><h2>Ask your business</h2><p>Snapshot as of ${s.asOf} · amounts in KSh</p></div>${button('assistant-clear', 'Clear chat', 'text-button')}</div><div class="assistant-settings"><label>Answer mode<select id="assistant-mode"><option value="records"${selected(assistantMode, 'records')}>Built-in record analysis · available now</option><option value="model"${selected(assistantMode, 'model')}${globalThis.TRUEFISH_SERVER ? '' : ' disabled'}>Local AI · optional server setup</option></select></label><p>${assistantMode === 'model' ? 'Sends your question and a calculated business summary to the AI model configured on your server. No raw notes, contacts or transaction rows are included. AI answers may be wrong; check the reports.' : 'Private, rule-based explanations calculated from your ledger. This mode is not a generative AI model and makes no network requests.'}</p></div>
    <div class="chat-messages" aria-live="polite">${assistantMessages.length ? assistantMessages.map(m => `<article class="chat-message ${m.role}"><div class="chat-avatar">${m.role === 'user' ? 'YOU' : '✦'}</div><div><b>${m.role === 'user' ? 'You' : m.mode === 'model' ? 'Local AI response' : 'Record analysis'}</b><p>${esc(m.text).replace(/\n/g, '<br>')}</p>${m.tab ? button('navigate', 'Review source report ↗', 'text-button', `data-tab="${m.tab}"`) : ''}${m.asOf ? `<small>Calculated through ${m.asOf} · verify against source records</small>` : ''}</div></article>`).join('') : '<div class="chat-welcome"><span>✦</span><h3>What would you like to understand?</h3><p>Start with a question below, or write your own.</p></div>'}${assistantBusy ? '<p class="assistant-working" role="status">Preparing your answer…</p>' : ''}</div>
    <div class="prompt-grid">${['Summarise my business', 'What needs attention?', 'Explain my profit', 'Show the 30-day cash scenario'].map(q => button('assistant-prompt', esc(q) + ' ↗', 'prompt-chip', `data-question="${esc(q)}" ${assistantBusy ? 'disabled' : ''}`)).join('')}</div><form id="assistant-form"><label class="sr-only" for="assistant-question">Ask about your business records</label><textarea id="assistant-question" name="question" required maxlength="1500" rows="2" placeholder="Ask about cash, invoices, fuel, profit or next actions…" ${assistantBusy ? 'disabled' : ''}></textarea><button class="primary" type="submit" ${assistantBusy ? 'disabled' : ''}>Ask ✦</button></form><p class="assistant-footnote">Read-only guidance. The assistant cannot post, approve, pay or change your records. Chat is kept only until this page is reloaded.</p></section>
    <div class="assistant-context"><section class="panel"><div class="section-head"><h2>Live business context</h2></div><div class="context-values">${[['Recorded cash', cashFigure(s.availableCash)], ['Month-to-date net', cashFigure(s.net)], ['Overdue invoices', cashFigure(s.overdueReceivables)], ['Fuel stock', qty(s.fuelLitres) + ' L']].map(([a,b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div></section><section class="panel scenario-card"><div class="section-head"><h2>30-day cash scenario</h2></div><strong>${cashFigure(s.scenario)}</strong><p>Assumes all invoices and bills due within 30 days are settled, plus accrued crew wages. Includes overdue items. Excludes new trading and other cash movements.</p>${button('assistant-prompt', 'Explain assumptions →', 'text-button', 'data-question="Explain the 30-day cash scenario"')}</section></div></div>
    <div class="insight-heading"><h2>Checks &amp; next actions</h2><span>${s.findings.length} findings · through ${s.asOf}</span></div><div class="insight-grid">${s.findings.map(f => `<article class="panel insight-card"><span class="insight-status ${f.severity}">${f.severity === 'warning' ? 'REVIEW' : f.severity === 'good' ? 'CHECKED' : 'INFORMATION'}</span><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p><div>${button('navigate', 'Open workspace →', 'text-button', `data-tab="${f.tab}"`)}${f.ids[0] ? button('detail', 'Source record', 'text-button', `data-id="${esc(f.ids[0])}"`) : ''}</div></article>`).join('')}</div>`;
}
async function askAssistant(question) {
    if (!canAct(localActor(), 'assistant')) return toast('Your account cannot use the assistant.');
    question = String(question || '').trim().slice(0, 1500);
    if (!question || assistantBusy) return;
    const snapshot = businessSnapshot(), mode = assistantMode;
    assistantMessages.push({ role: 'user', text: question });
    assistantBusy = true; render();
    try {
        let response;
        if (mode === 'model') {
            if (!globalThis.TRUEFISH_SERVER) throw Error('Local AI requires server mode. Built-in record analysis is available now.');
            const result = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }), signal: AbortSignal.timeout(95000) });
            const value = await result.json();
            if (!result.ok) throw Error(value.error || 'AI request failed.');
            response = { text: value.answer, asOf: value.asOf, tab: 'Accounting' };
        } else response = { ...answerFromRecords(question, snapshot), asOf: snapshot.asOf };
        assistantMessages.push({ role: 'assistant', ...response, mode });
    } catch (e) { assistantMessages.push({ role: 'assistant', text: e.message + ' You can switch to built-in record analysis for an immediate answer.', mode }); }
    finally { assistantBusy = false; assistantMessages = assistantMessages.slice(-20); render(); }
}
function openWorkspaceSearch() {
    if (saving) return;
    activeModal = null;
    dialog('Find a workspace or record', `<form id="workspace-search"><label class="search-dialog-label">Search pages, boat names, dates, references or amounts<input name="query" id="workspace-query" autofocus autocomplete="off" placeholder="Try invoices, Boat 1, fuel or 2026-11…"></label></form><div id="workspace-results">${workspaceResults('')}</div>`);
    document.querySelector('#workspace-query')?.focus();
}
function workspaceResults(query) {
    const q = String(query).trim().toLowerCase(), pages = nav.filter(([name]) => !q || name.toLowerCase().includes(q));
    const records = q ? live().filter(r => [r.date, r.boat, r.name, r.number, r.reference, r.title, r.note, r.amount, labels[r.kind], BUSINESS_LABELS[r.kind]].some(v => String(v || '').toLowerCase().includes(q))).slice(-12).reverse() : [];
    return `<div class="search-section-label">WORKSPACES</div>${pages.map(([name]) => button('search-navigate', esc(name) + ' →', 'search-result', `data-tab="${name}"`)).join('') || '<p class="footnote">No matching workspaces</p>'}${q ? `<div class="search-section-label">RECORDS · UP TO 12 MATCHES</div>${records.map(r => button('search-detail', esc(r.date + ' · ' + (labels[r.kind] || BUSINESS_LABELS[r.kind]) + ' · ' + (r.boat || r.name || r.number || r.reference || r.title || 'Record')), 'search-result', `data-id="${r.id}"`)).join('') || '<p class="footnote">No matching records</p>'}` : ''}`;
}
document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
    if (b.dataset.action === 'assistant-prompt') askAssistant(b.dataset.question);
    if (b.dataset.action === 'assistant-clear' && !assistantBusy) { assistantMessages = []; render(); }
    if (b.dataset.action === 'workspace-search') openWorkspaceSearch();
    if (b.dataset.action === 'search-navigate') { close(); tab = b.dataset.tab; render(); }
    if (b.dataset.action === 'search-detail') { close(); detail(b.dataset.id); }
});
document.addEventListener('change', e => { if (e.target.id === 'assistant-mode') { assistantMode = e.target.value === 'model' && globalThis.TRUEFISH_SERVER ? 'model' : 'records'; render(); } });
document.addEventListener('input', e => { if (e.target.id === 'workspace-query') document.querySelector('#workspace-results').innerHTML = workspaceResults(e.target.value); });
document.addEventListener('submit', e => { if (e.target.id === 'assistant-form') { e.preventDefault(); askAssistant(new FormData(e.target).get('question')); } if (e.target.id === 'workspace-search') e.preventDefault(); });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openWorkspaceSearch(); } });

function profileSelector() {
    if (globalThis.TRUEFISH_SERVER || deviceAccess) {
        const actor = localActor();
        return `<div class="profile-select signed-in-user"><span class="user-avatar">${esc(actor.name.slice(0, 1))}</span><span><b>${esc(actor.name)}</b><small>${roleLabel(actor)}</small></span>${button(globalThis.TRUEFISH_SERVER ? 'server-logout' : 'device-logout', 'Sign out', 'text-button')}</div>`;
    }
    const controls = normalControls(state.controls);
    return `<label class="profile-select"><span>Local profile</span><select id="active-profile" aria-label="Local workflow profile">${controls.staff.filter(s => s.active !== false).map(s => `<option value="${s.id}"${selected(s.id, browserLedger.actorId)}>${esc(s.name)} · ${roleLabel(s)}</option>`).join('')}</select></label>`;
}
function loginNameFor(id) { return globalThis.TRUEFISH_SERVER ? browserLedger.accounts?.find(u => u.id === id)?.username : deviceAccess?.read().users.find(u => u.id === id)?.username; }
function controlsPage() {
    const controls = normalControls(state.controls), actor = localActor(), manage = canAct(actor, 'team');
    return `<div class="notice ${globalThis.TRUEFISH_SERVER ? '' : 'warning'}">${globalThis.TRUEFISH_SERVER ? 'Shared server edition: every account signs in separately. The server enforces assigned rights on every change.' : 'Local device sign-in controls this browser interface. It cannot secure records against someone with access to browser storage. Use the server edition for shared-user security.'}</div><div class="metrics three">${metric('Signed-in user', actor.name, roleLabel(actor))}${metric('Closed through', controls.closedThrough || 'Open', 'Changes require a reviewed, approved period')}${metric('Active users', String(controls.staff.filter(s => s.active !== false).length), 'The super administrator cannot be disabled')}</div>
    <section class="panel user-panel"><div class="section-head"><div><h2>Users &amp; access rights</h2><p>${manage ? 'Create accounts, assign roles, reset passwords and deactivate users.' : 'Your account and assigned permissions. Contact the super administrator for changes.'}</p></div>${manage ? button('staff-new', '+ Create user', 'primary') : ''}</div>${businessTable(['User / username', 'Role', 'Rights', 'Status', ''], controls.staff.filter(s => manage || s.id === actor.id).map(s => [`<b>${esc(s.name)}</b><small>${esc(loginNameFor(s.id) || (s.id === 'owner' && globalThis.TRUEFISH_SERVER ? 'Server administrator' : 'Login not configured'))}</small>`, `<span class="badge ${s.id === 'owner' ? 'super-badge' : ''}">${roleLabel(s)}</span>`, s.id === 'owner' ? '<span class="global-rights">All system privileges</span>' : `<span title="${esc(effectiveRights(s).map(p => RIGHTS[p]).join(', '))}">${effectiveRights(s).length} assigned rights</span>`, `<span class="badge ${s.active === false ? 'amber' : ''}">${s.active === false ? 'Inactive' : 'Active'}</span>`, manage && (s.id !== 'owner' || actor.id === 'owner') ? button('staff-edit', 'Manage user', 'text-button', `data-id="${s.id}"`) : '—']))}<div class="user-rights-note"><b>Your permissions</b><div class="rights-tags">${effectiveRights(actor).map(p => `<span>${esc(RIGHTS[p])}</span>`).join('') || '<span>View records only</span>'}</div><p>All roles can view the business records. Permissions below control actions; they do not create separate confidential departments. Clerks can correct only their own records.</p></div></section>
    <section class="panel section-space"><div class="section-head"><h2>Role guide</h2></div><div class="role-guide"><article><b>Super administrator</b><p>The protected owner account has every right across the system and manages other administrators.</p></article>${Object.entries(ROLES).map(([role,label]) => `<article><b>${label}</b><p>${role === 'admin' ? 'Full administrative defaults. The owner can customise individual rights.' : role === 'approver' ? 'Enter and correct records, review figures and close approved periods.' : role === 'clerk' ? 'Enter and import records; correct own entries. No approval or user administration by default.' : 'View records and use the assistant. No posting or administration by default.'}</p></article>`).join('')}</div></section>
    <section class="panel section-space"><div class="section-head"><h2>Review &amp; period closing</h2></div><form id="review-form" class="settings-form"><label>Review through<input name="through" type="date" value="${today()}" required></label><p class="footnote">Review the financial statements before approving. A closed period must be reopened before dated records can change, including changes by the super administrator.</p><div class="toolbar"><button class="primary" name="reviewAction" value="approve" type="submit" ${canAct(actor, 'approve') ? '' : 'disabled'}>Approve reviewed figures</button><button class="secondary" name="reviewAction" value="close" type="submit" ${canAct(actor, 'close') ? '' : 'disabled'}>Close approved period</button></div></form>${canAct(actor, 'reopen') ? '<form id="reopen-form" class="settings-form"><label>Reason to reopen<input name="reason" maxlength="300" required></label><button class="danger" type="submit">Reopen closed periods</button></form>' : ''}</section>
    <section class="panel section-space"><div class="section-head"><h2>Approval snapshots</h2></div>${businessTable(['Through', 'Reviewed by', 'When', 'Status'], controls.approvals.map(a => [a.through, esc(a.by), esc(a.at), a.hash === fingerprint(state.records, a.through) ? 'Current figures' : 'Changed — review again']))}</section><section class="panel section-space"><div class="section-head"><h2>User &amp; review history</h2></div>${businessTable(['Action', 'By', 'When', 'Reason / period'], controls.history.map(h => [esc(h.action), esc(h.by), esc(h.at), esc(h.reason || h.through || '—')]))}</section>`;
}
function openStaffForm(existing = null) {
    const actor = localActor();
    if (!canAct(actor, 'team')) return toast('Your account cannot manage users.');
    if (existing?.id === 'owner' && actor.id !== 'owner') return toast('Only the super administrator can change this account.');
    activeModal = { kind: 'staff' };
    const owner = existing?.id === 'owner', rights = existing ? effectiveRights(existing) : roleRights('clerk'), login = globalThis.TRUEFISH_SERVER || deviceAccess;
    dialog(existing ? 'Manage user' : 'Create user', `<div class="notice">${owner ? 'This is the protected super administrator. It always retains all rights and stays active.' : 'Choose a role, then adjust the individual action rights. Password resets end existing sessions.'}</div><form id="team-form"><input type="hidden" name="id" value="${existing?.id || ''}"><div class="form-grid">${inputField('name', 'Full name', 'text', existing?.name || '', 'required maxlength="80"')}${owner ? '<label>Role<input value="Super administrator" disabled><input type="hidden" name="role" value="admin"></label>' : selectField('role', 'Role', Object.entries(ROLES), existing?.role || 'clerk')}${login && !(owner && globalThis.TRUEFISH_SERVER) ? inputField('loginName', 'Username', 'text', loginNameFor(existing?.id) || '', `${existing ? '' : 'required'} autocomplete="off" minlength="3" maxlength="50"`) + inputField('password', existing ? 'New password (leave blank to retain)' : 'Password (at least 16 characters)', 'password', '', `${existing ? '' : 'required'} autocomplete="new-password" minlength="16" maxlength="1024"`) : ''}${owner ? '<input type="hidden" name="active" value="true">' : selectField('active', 'Account status', [['true', 'Active'], ['false', 'Inactive']], existing?.active === false ? 'false' : 'true')}</div>${owner && globalThis.TRUEFISH_SERVER ? '<p class="footnote">The owner username and password are maintained in the private server configuration. Change them there and restart the server.</p>' : ''}<fieldset class="rights-fieldset"><legend>Assigned action rights</legend><p>All users can view records. Selecting a role resets the checkboxes to that role’s defaults.</p><div class="rights-grid">${Object.entries(RIGHTS).map(([key,label]) => `<label><input type="checkbox" name="right_${key}" value="true" ${rights.includes(key) ? 'checked' : ''} ${owner || (actor.id !== 'owner' && !canAct(actor, key)) ? 'disabled' : ''}><span>${esc(label)}</span></label>`).join('')}</div></fieldset><div class="dialog-actions">${button('close', 'Cancel', 'secondary', 'type="button"')}<button class="primary" type="submit">${existing ? 'Save user & rights' : 'Create user'}</button></div></form>`);
}
document.addEventListener('change', e => { if (e.target.name === 'role' && e.target.closest?.('#team-form')) { const defaults = roleRights(e.target.value); dialogs.querySelectorAll('input[name^="right_"]').forEach(input => { if (!input.disabled) input.checked = defaults.includes(input.name.slice(6)); }); } });
document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b?.dataset.action === 'device-logout') { deviceAccess.logout(); location.reload(); } });
function applyRightsUI() {
    const actor = localActor();
    const map = { new: 'write', 'finance-new': 'write', 'document-pay': 'write', edit: 'edit', 'staff-new': 'team', 'staff-edit': 'team', 'import-commit': 'import', restore: 'restore', 'recover-previous': 'restore' };
    root.querySelectorAll('[data-action]').forEach(b => { const right = map[b.dataset.action]; if (right && !canAct(actor, right)) { b.disabled = true; b.title = 'Your account does not have this permission'; } });
    root.querySelectorAll('#settings-form input,#settings-form button').forEach(input => { input.disabled = !canAct(actor, 'settings'); });
}

function receiptModels() {
    return state.records.filter(isReceiptRecord).map(r => receiptFor(state.records, r.id, preferences.company)).filter(r => (!filter.start || r.date >= filter.start) && (!filter.end || r.date <= filter.end) && (!filter.boat || r.boat === filter.boat) && (!filter.search || [r.number,r.payer,r.reference,r.description].join(' ').toLowerCase().includes(filter.search.toLowerCase()))).sort((a,b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt));
}
function receiptButton(record) { return isReceiptRecord(record) ? button('receipt-view', record.void ? 'View voided receipt' : 'Receipt / Print PDF', 'secondary', `data-id="${esc(record.id)}"`) : ''; }
function receiptLinks(record) {
    if (isReceiptRecord(record)) return `<div class="toolbar">${receiptButton(record)}</div>`;
    const payments = live().filter(r => isReceiptRecord(r) && (record.kind === 'invoice' ? businessLookup(state.records, r.documentId)?.id === record.id : r.sourceId && resolveSource(state.records, r.sourceId)?.id === record.id));
    if (payments.length) return `<div class="receipt-linked"><b>Payment receipts</b><div class="toolbar">${payments.map(p => receiptButton(p)).join('')}</div></div>`;
    return '';
}
function receiptsPage() {
    const models = receiptModels(), valid = models.filter(r => !r.voided);
    return `${filters()}<div class="metrics three">${metric('Valid payment receipts', String(valid.length), 'Selected dates and filters')}${metric('Money received', money(shillings(valid.reduce((n,r) => n+r.amount,0))), 'Includes capital and loans received')}${metric('Voided receipts', String(models.length-valid.length), 'History remains clearly marked')}</div><div class="notice">Receipts are produced from saved incoming cashbook payments. Printing or reprinting never adds money again. Post actual boat/fuel cash under Finances first; collect invoice payments under Customers &amp; bills. Unpaid invoices, opening balances and transfers do not produce receipts.</div><section class="panel"><div class="section-head"><div><h2>Payment receipts</h2><p>Branded receipts · print or choose Save as PDF in your browser</p></div>${button('receipts-export','Export receipt register','secondary')}</div>${businessTable(['Date / receipt','Received from','Payment account','Reference','Amount received','Status',''],models.map(r => [`<b>${r.date}</b><small class="receipt-number-cell">${esc(r.number)}</small>`,esc(r.payer),esc(r.method),esc(r.reference || '—'),money(shillings(r.amount)),`<span class="badge ${r.voided ? 'amber' : ''}">${r.voided ? 'VOIDED' : 'Recorded'}</span>`,button('receipt-view','View / Print','text-button',`data-id="${esc(r.recordId)}"`)]))}</section>`;
}
function openReceipt(id) {
    try {
        const r = receiptFor(state.records,id,preferences.company);
        activeModal = { kind:'receipt', id };
        const receipt = `<article id="receipt-document" class="receipt-paper ${r.voided ? 'receipt-voided' : ''}"><div class="receipt-top"><img src="true-fish-logo.png" alt="True Fish Business Suite"><div><span>PAYMENT RECEIPT</span><b>${r.voided ? 'VOIDED' : 'RECORDED PAYMENT'}</b></div></div><div class="receipt-company">${esc(r.company)}</div><div class="receipt-meta"><div><span>Receipt number</span><b class="receipt-number">${esc(r.number)}</b></div><div><span>Payment date</span><b>${r.date}</b></div></div>${r.voided ? `<div class="receipt-void-banner">VOIDED — NOT A VALID PAYMENT RECEIPT<br><small>${esc(r.voidReason)}${r.replacement ? '<br>Replacement receipt: '+esc(r.replacement) : ''}</small></div>` : ''}<div class="receipt-meta"><div><span>Received from</span><b>${esc(r.payer)}</b></div><div><span>Payment account / method</span><b>${esc(r.method)}</b></div></div><div class="receipt-reference"><span>Payment reference</span><b>${esc(r.reference || 'Not supplied')}</b></div><table class="receipt-lines"><thead><tr><th>Description</th><th>Amount (KSh)</th></tr></thead><tbody><tr><td>${esc(r.description)}</td><td>${money(shillings(r.amount))}</td></tr></tbody></table><div class="receipt-total"><span>AMOUNT RECEIVED</span><strong>${money(shillings(r.amount))}</strong></div>${r.note ? `<div class="receipt-note"><b>Notes</b><p>${esc(r.note)}</p></div>` : ''}${r.replaces ? `<p class="receipt-correction">Corrects receipt ${esc(r.replaces)}. The original receipt is void.</p>` : ''}<div class="receipt-signoff"><div><span>Recorded by</span><b>${esc(r.receivedBy)}</b></div><div><span>Ledger record</span><b>${esc(r.recordId)}</b></div></div><div class="receipt-footer"><b>Thank you for your payment.</b><p>Generated from a saved ledger entry. This document does not post another transaction. A reprint keeps the same receipt number.</p><span>Payment acknowledgement · not a tax invoice</span></div></article>`;
        dialog('Payment receipt', `<div class="receipt-controls no-print">${button('receipt-print','Print / Save as PDF','primary',`data-id="${esc(id)}"`)}${button('close','Close','secondary')}</div>${receipt}`);
    } catch(e) { toast(e.message); }
}
function exportReceipts() { exportCSV(receiptModels().map(r => ({receipt:r.number,date:r.date,payer:r.payer,account:r.method,reference:r.reference,amount:shillings(r.amount),status:r.voided?'VOIDED':'Recorded',record:r.recordId})),'true-fish-receipts'); }
document.addEventListener('click',e => { const b=e.target.closest('[data-action]');if(!b||b.disabled)return;if(b.dataset.action==='receipt-view')openReceipt(b.dataset.id);if(b.dataset.action==='receipts-export')exportReceipts();if(b.dataset.action==='receipt-print'){const previous=document.title;document.title=receiptNumber(state.records.find(r=>r.id===b.dataset.id));window.addEventListener('afterprint',()=>{document.title=previous;},{once:true});window.print();} });

})();
})();
