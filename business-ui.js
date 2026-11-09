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
