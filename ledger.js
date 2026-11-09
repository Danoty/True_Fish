import { BUSINESS_KINDS, BUSINESS_LABELS, validateBusiness, validateBusinessLinks } from './business.js';
import { validateFinance, validateFinancialLinks } from './finance.js';
export const BOATS = Array.from({ length: 15 }, (_, i) => 'Boat ' + (i + 1));
export const kinds = ['boat', 'opening', 'purchase', 'sale', 'credit', 'donation', 'repayment', 'finance', ...BUSINESS_KINDS];
export const labels = { boat: 'Daily boat record', opening: 'Opening stock', purchase: 'Fuel purchase', sale: 'Cash fuel sale', credit: 'Fuel on credit', donation: 'Fuel donation', repayment: 'Debt repayment', finance: 'Financial entry', ...BUSINESS_LABELS };
export const money = (n) => 'KSh ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 3 });
export function profit(r) { return { gross: r.boss - r.expenses, net: r.boss - r.expenses - r.commission }; }
export function totals(records) {
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
export function validate(r) {
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
export function validateLedger(records) {
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
