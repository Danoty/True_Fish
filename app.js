import { LOGO_DATA_URI } from './brand-data.js';
import { brandedReport } from './documents.js';
import { isReceiptRecord, receiptNumber, receiptFor } from './receipts.js';
import { ServerLedger } from './server-client.js';
import { intelligenceSnapshot, answerFromRecords } from './intelligence.js';
import { BUSINESS_KINDS, BUSINESS_LABELS, businessLookup, documentTotal, documentPayments, accountingReport, accountingName, partyOutstanding, statementSuggestions, cashLeg } from './business.js';
import { ROLES, RIGHTS, roleRights, roleLabel, effectiveRights, normalControls, actorFor, canAct, fingerprint } from './workflow.js';
import { parseCsv, readXlsx, importDate, importNumber, IMPORT_FIELDS, IMPORT_NAMES, guessMapping, mapImportRows } from './imports.js';
import { FINANCE_ACCOUNTS, FINANCE_TYPES, INCOME_CATEGORIES, EXPENSE_CATEGORIES, cents, shillings, validateFinance, resolveSource, sourceLimit, sourcePostings, financeCategory, journalFor, accountName, financeReport } from './finance.js';
import { dateRange, reconcile, stockMovements, daySummary, trend, cleanPreferences } from './analytics.js';
import { BrowserLedger } from './storage.js';
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
import { BOATS, labels, money, qty, totals, profit, validate, validateLedger } from './ledger.js';
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
function render() { root.innerHTML = `<div class="shell"><aside><a class="brand" href="./index.html"><img class="suite-logo" src="true-fish-logo.png" alt="True Fish Business Suite"></a><button class="sidebar-create" data-action="new" data-kind="finance">＋ Create new</button><nav aria-label="Main navigation">${hybridNavigation()}</nav><div class="aside-bottom"><div class="fleet-icon">${icon('boat', 26)}</div><b>Built around your business.</b><p>Financial clarity. Operational control.</p><span class="private">● ${globalThis.TRUEFISH_SERVER ? 'Shared server ledger' : 'Saved in this browser'}</span></div><div class="company"><div>TF</div><span><b>${esc(preferences.company)}</b><small>KSh · East Africa</small></span></div></aside><main><header><div class="breadcrumb"><span class="app-launcher" aria-hidden="true">⠿</span><span>True Fish <b>Business Suite</b></span></div><button class="global-search" data-action="workspace-search"><span>⌕</span> Search anything <kbd>Ctrl K</kbd></button>${button('navigate', '✦ Assistant', 'header-assistant', 'data-tab="Assistant"')}${profileSelector()}<span class="date">${new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' })}</span></header><div class="content">${printBrand()}<div class="page-heading"><div><div class="eyebrow">${esc(preferences.company.toUpperCase())}</div><h1>${tab === 'Overview' ? 'Business overview' : tab}</h1><p>${descriptions[tab]}</p></div><div class="actions">${button('export', '↓ Download report', 'secondary', ready && (tab === 'Finances' ? financeReport(state.records, financeScope()).entries.length : rows().length) ? '' : 'disabled')}${button('new', '+ Add record', 'primary', `data-kind="${defaultRecordKind()}" ${ready ? '' : 'disabled'}`)}</div></div>${error ? `<div class="error" role="alert">${esc(error)} ${button('refresh', 'Refresh records', 'text-button')}</div>` : ''}${ready ? '' : '<div class="notice">Reading this browser’s records…</div>'}<div class="storage-strip"><span>● ${globalThis.TRUEFISH_SERVER ? 'Shared server ledger' : 'Saved in this browser'} · ${esc(backupLabel())}</span>${button('backup', 'Download backup', 'text-button')}</div>${content()}<footer><span>${esc(preferences.company.toUpperCase())} / Built for the working day</span><div class="top-actions">${button('refresh', '↻ Refresh records', 'text-button')}${button('backup', 'Download backup', 'text-button')}${button('restore', 'Restore backup', 'text-button')}</div></footer></div></main></div>`; applyRightsUI(); }
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
function exportDataCSV(data, name) {
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
            exportReport(rows().map(r => ({ ...r, ...(r.kind === 'boat' ? profit(r) : {}) })), 'true-fish-records');
    }
    if (a === 'audit-export')
        exportReport(state.audit, 'true-fish-audit');
    if (a === 'reference-export') {
        const s = reference[Number(b.dataset.index)];
        if (s)
            exportReport(s.rows, s.sheet);
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
        exportReport([{ date: focusDate, boatsRecorded: d.boats, income: d.income, netProfit: d.net, fuelIssuedLitres: d.fuel.sold + d.fuel.credit + d.fuel.donated, fuelSalesValue: d.fuel.salesValue, fuelSalesCash: d.fuel.salesCash, fuelCashDifference: d.fuel.variance, debtCashReceived: d.fuel.repaymentCash }], 'true-fish-day-' + focusDate);
    }
    if (action === 'fuel-report-export') {
        const r = reconcile(rows());
        exportReport([{ from: filter.start, to: filter.end, boat: filter.boat || 'All boats', ...r }], 'true-fish-fuel-reconciliation');
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
        exportReport(report.entries.map(r => ({ date: r.date, type: FINANCE_TYPES[r.transactionType], account: FINANCE_ACCOUNTS[r.account] || 'Loan liability', toAccount: FINANCE_ACCOUNTS[r.toAccount] || '', category: r.categoryLabel, counterparty: r.counterparty, reference: r.reference, amount: r.amount, cashIn: shillings(r.cashIn), cashOut: shillings(r.cashOut), recordedBalance: shillings(r.balance), note: r.note })), 'true-fish-cashbook');
    }
    if (action === 'trial-export') {
        const report = financeReport(state.records, { end: filter.end });
        exportReport(report.trialBalance.map(r => ({ account: r.name, debit: shillings(r.debit), credit: shillings(r.credit) })), 'true-fish-cashbook-trial-balance');
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
function exportFinancialCashbook() { const report = financeReport(state.records, financeScope()); exportReport(report.entries.map(r => ({ date: r.date, type: FINANCE_TYPES[r.transactionType], account: FINANCE_ACCOUNTS[r.account] || 'Loan liability', toAccount: FINANCE_ACCOUNTS[r.toAccount] || '', category: r.categoryLabel, counterparty: r.counterparty, reference: r.reference, amount: r.amount, cashIn: shillings(r.cashIn), cashOut: shillings(r.cashOut), recordedBalance: shillings(r.balance), note: r.note })), 'true-fish-cashbook'); }
