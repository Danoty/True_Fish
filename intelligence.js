import { accountingReport, partyOutstanding, businessLookup } from './business.js';
import { financeReport } from './finance.js';
import { totals, profit } from './ledger.js';

const sum = (rows, key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
const ksh = n => 'KSh ' + (n / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 });
export function intelligenceSnapshot(records, asOf) {
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
export function answerFromRecords(question, snapshot) {
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
