export const FINANCE_ACCOUNTS = { cash: 'Cash', mpesa: 'M-Pesa', bank: 'Bank' };
export const FINANCE_TYPES = { opening: 'Opening account balance', income: 'Business income received', expense: 'Business expense paid', transfer: 'Account transfer', capital: 'Owner capital introduced', drawing: 'Owner withdrawal', loan_in: 'Loan received', loan_repay: 'Loan principal repaid', loan_opening: 'Opening loan liability', asset_buy: 'Equipment / asset purchase', source_receipt: 'Receipt from boat / fuel record', source_payment: 'Payment for fuel purchase', reconcile: 'Check account balance', invoice_receipt: 'Customer invoice receipt', bill_payment: 'Supplier bill payment', payroll_payment: 'Crew wages paid' };
export const INCOME_CATEGORIES = ['Other business income', 'Fish sales', 'Services', 'Other sales'];
export const EXPENSE_CATEGORIES = ['General expenses', 'Repairs & maintenance', 'Wages & crew', 'Rent', 'Charging', 'Transport', 'Fees & charges', 'Interest paid', 'Other operating expenses'];
export const cents = value => Math.round(Number(value || 0) * 100);
export const shillings = value => value / 100;
const cashTypes = ['opening', 'income', 'expense', 'transfer', 'capital', 'drawing', 'loan_in', 'loan_repay', 'asset_buy', 'source_receipt', 'source_payment', 'reconcile', 'invoice_receipt', 'bill_payment', 'payroll_payment'];
export function validateFinance(r) {
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
export function resolveSource(records, id) {
    let source = records.find(r => r.id === id);
    const seen = new Set();
    while (source?.void && !seen.has(source.id)) {
        seen.add(source.id);
        source = records.find(r => r.replaces === source.id);
    }
    return source && !source.void ? source : null;
}
export function sourceLimit(source) {
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
export function sourcePostings(records) {
    const posted = new Map();
    for (const r of records.filter(r => !r.void && r.kind === 'finance' && r.sourceId)) {
        const source = resolveSource(records, r.sourceId);
        if (source)
            posted.set(source.id, (posted.get(source.id) || 0) + cents(r.amount));
    }
    return posted;
}
export function validateFinancialLinks(records) {
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
export function financeCategory(r, records) {
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
export function journalFor(r, records) {
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
export function accountName(code, records = []) { const [prefix, ...parts] = code.split(':'); const name = parts.join(':'); return prefix === 'A' && FINANCE_ACCOUNTS[name] ? FINANCE_ACCOUNTS[name] : name; }
export function financeReport(records, { start = '', end = '', account = '', search = '' } = {}) {
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
