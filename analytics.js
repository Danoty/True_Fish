import { BOATS, totals, profit } from './ledger.js';
export function dateRange(period, date) {
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
export function reconcile(records) { const rows = records.filter(r => !r.void); const sum = (kind, fn) => rows.filter(r => r.kind === kind).reduce((n, r) => n + fn(r), 0); return { purchased: sum('purchase', r => r.litres), purchaseCost: sum('purchase', r => r.litres * r.price), sold: sum('sale', r => r.litres), salesValue: sum('sale', r => r.litres * r.price), salesCash: sum('sale', r => r.cash), credit: sum('credit', r => r.litres), creditValue: sum('credit', r => r.litres * r.price), donated: sum('donation', r => r.litres), repaymentCash: sum('repayment', r => r.cash), get variance() { return this.salesValue - this.salesCash; } }; }
export function stockMovements(records) { let balance = 0; return records.filter(r => !r.void && ['opening', 'purchase', 'sale', 'credit', 'donation'].includes(r.kind)).slice().sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created)).map(r => { const incoming = ['opening', 'purchase'].includes(r.kind) ? r.litres : 0, outgoing = incoming ? 0 : r.litres; balance += incoming - outgoing; return { ...r, incoming, outgoing, balance }; }); }
export function daySummary(records, date) { const rows = records.filter(r => !r.void && r.date === date), boats = rows.filter(r => r.kind === 'boat'), recorded = new Set(boats.map(r => r.boat)); return { date, records: rows, boats: boats.length, missing: BOATS.filter(b => !recorded.has(b)), ...totals(rows), fuel: reconcile(rows) }; }
export function trend(records, end, days = 14) {
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
export function cleanPreferences(value = {}) { const finite = (n, fallback) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e8 ? n : fallback; return { company: String(value.company || 'True Fish Ent.').trim().slice(0, 80) || 'True Fish Ent.', fuelPrice: finite(value.fuelPrice, 200), lowStock: finite(value.lowStock, 0), commissionRate: typeof value.commissionRate === 'number' && value.commissionRate >= 0 && value.commissionRate <= 100 ? value.commissionRate : null }; }
