import { cents, shillings, journalFor, resolveSource, FINANCE_ACCOUNTS } from './finance.js';
export const BUSINESS_KINDS = ['party', 'invoice', 'bill', 'asset', 'fuel_value', 'crew', 'payroll', 'maintenance', 'statement', 'match'];
export const BUSINESS_LABELS = { party: 'Customer / supplier', invoice: 'Customer invoice', bill: 'Supplier bill', asset: 'Fixed asset', fuel_value: 'Opening fuel valuation', crew: 'Crew member', payroll: 'Crew wages accrued', maintenance: 'Boat maintenance', statement: 'Statement line', match: 'Statement match' };
const text = (v, n = 120) => String(v || '').trim().slice(0, n);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const amount = (v, zero = false) => typeof v === 'number' && Number.isFinite(v) && v >= (zero ? 0 : .01) && v <= 1e10 && Math.abs(v * 100 - Math.round(v * 100)) < .0001;
export function validateBusiness(r) {
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
export function businessLookup(records, id, kind) { const found = resolveSource(records, id); return found && (!kind || found.kind === kind) ? found : null; }
export const documentTotal = r => cents(r.amount) + cents(r.taxAmount || 0);
export function documentPayments(records, document) {
    let paid = 0;
    for (const r of records.filter(r => !r.void && r.kind === 'finance')) {
        if (r.documentId && businessLookup(records, r.documentId)?.id === document.id)
            paid += cents(r.amount);
        if (document.kind === 'bill' && document.sourceId && r.transactionType === 'source_payment' && businessLookup(records, r.sourceId)?.id === businessLookup(records, document.sourceId)?.id)
            paid += cents(r.amount);
    }
    return paid;
}
export function cashLeg(r, account) {
    if (r.kind !== 'finance' || r.void)
        return 0;
    return journalFor(r, []).filter(p => p.account === 'A:' + account).reduce((n, p) => n + p.debit - p.credit, 0);
}
export function validateBusinessLinks(records) {
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
export function documentJournal(r, records) {
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
export function inventoryJournal(records, end = '9999-12-31') {
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
export function fullJournal(records, end = '9999-12-31') {
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
export function accountingName(code, records) {
    const parts = code.split(':'), id = parts.slice(2).join(':');
    if (['Customers', 'Suppliers'].includes(parts[1]))
        return parts[1] + ' · ' + (businessLookup(records, id, 'party')?.name || id);
    if (parts[1] === 'Crew')
        return 'Crew payable · ' + (businessLookup(records, id, 'crew')?.name || id);
    if (parts[1] === 'Fuel customers')
        return 'Fuel receivable · ' + id;
    return FINANCE_ACCOUNTS[parts[1]] || parts.slice(1).join(' · ');
}
export function accountingReport(records, { start = '', end = '9999-12-31' } = {}) {
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
export function partyOutstanding(records, kind, asOf) { return records.filter(r => !r.void && r.kind === kind && r.date <= asOf).map(r => { const balance = documentTotal(r) - documentPayments(records.filter(x => x.date <= asOf), r); return { ...r, partyName: businessLookup(records, r.partyId)?.name || 'Unknown', balance, overdue: balance > 0 && r.dueDate < asOf }; }); }
export function statementSuggestions(records, lineRecord) { const matched = records.filter(r => !r.void && r.kind === 'match'); return records.filter(r => !r.void && r.kind === 'finance' && cashLeg(r, lineRecord.account) === cents(lineRecord.amount) && !matched.some(m => businessLookup(records, m.financeId)?.id === r.id && businessLookup(records, m.statementId)?.account === lineRecord.account)).sort((a, b) => (a.reference && a.reference === lineRecord.reference ? -1 : 0) - (b.reference && b.reference === lineRecord.reference ? -1 : 0) || Math.abs(Date.parse(a.date) - Date.parse(lineRecord.date)) - Math.abs(Date.parse(b.date) - Date.parse(lineRecord.date))); }
