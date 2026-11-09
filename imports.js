// Local-only CSV and XLSX reader. File contents are never uploaded.
const decodeXml = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, v) => v[0] === '#' ? String.fromCodePoint(v[1].toLowerCase() === 'x' ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[v.toLowerCase()]));
export function parseCsv(text) {
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
export async function readXlsx(buffer) {
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
export function importDate(value, format = 'DMY', date1904 = false) {
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
export function importNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    const s = String(value ?? '').trim().replace(/^KSh\s*/i, '').replace(/,/g, '');
    if (!s || !/^[-+]?\d+(?:\.\d+)?$/.test(s))
        throw Error('Missing or invalid number.');
    return Number(s);
}
export const IMPORT_FIELDS = { boat: ['date', 'boat', 'income', 'rent', 'uganda', 'fuelLitres', 'fuelCash', 'gowi', 'charging', 'amali', 'boss', 'expenses', 'commission', 'note'], purchase: ['date', 'litres', 'price', 'note'], sale: ['date', 'boat', 'litres', 'price', 'cash', 'note'], credit: ['date', 'boat', 'litres', 'price', 'note'], donation: ['date', 'boat', 'litres', 'note'], repayment: ['date', 'boat', 'litres', 'cash', 'note'], finance_income: ['date', 'amount', 'counterparty', 'reference', 'note'], finance_expense: ['date', 'amount', 'counterparty', 'reference', 'note'], statement: ['date', 'amount', 'moneyIn', 'moneyOut', 'reference', 'description'], party_customer: ['name', 'phone', 'email', 'address'], party_supplier: ['name', 'phone', 'email', 'address'], invoice: ['date', 'partyName', 'number', 'amount', 'taxAmount', 'dueDate', 'note'], bill: ['date', 'partyName', 'number', 'amount', 'taxAmount', 'dueDate', 'note'], crew: ['name', 'position', 'boat', 'phone'], payroll: ['date', 'crewName', 'amount', 'period', 'note'], maintenance: ['date', 'boat', 'title', 'dueDate', 'status', 'amount', 'note'] };
export const IMPORT_NAMES = { boat: 'Daily boat records', purchase: 'Fuel purchases', sale: 'Cash fuel sales', credit: 'Fuel on credit', donation: 'Fuel donations', repayment: 'Fuel repayments', finance_income: 'Additional business income', finance_expense: 'Additional operating expenses', statement: 'Bank / M-Pesa statement', party_customer: 'Customers', party_supplier: 'Suppliers', invoice: 'Customer invoices', bill: 'Operating supplier bills', crew: 'Crew members', payroll: 'Earned crew wages', maintenance: 'Maintenance tasks' };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function guessMapping(headers, kind) {
    const aliases = { income: ['totalincome', 'income'], fuelLitres: ['fuelltr', 'fuelltrs', 'fuellitres'], charging: ['charginghome', 'charging'], commission: ['commission', 'commissions', 'comissions', 'comission'], price: kind === 'purchase' ? ['unitcostperpurch', 'unitcostperpurchase', 'price'] : ['unitcostpersale', 'price'], litres: kind === 'purchase' ? ['fuelltrspurchased', 'litrespurchased', 'litres'] : ['litres', 'qty', 'totalqtysold'], partyName: ['party', 'customer', 'supplier', 'name'], crewName: ['crew', 'crewmember', 'name'], amount: ['amount', 'total', 'wages'], cash: ['cash', 'cashreceived', 'totalcashreceived'], moneyIn: ['moneyin', 'credit', 'paidin'], moneyOut: ['moneyout', 'debit', 'paidout', 'withdrawn'], reference: ['reference', 'receiptno', 'transactionid'] };
    const result = {};
    for (const field of IMPORT_FIELDS[kind] || []) {
        const keys = [norm(field), ...(aliases[field] || [])];
        result[field] = headers.findIndex(h => keys.includes(norm(h)));
    }
    return result;
}
import { validate } from './ledger.js';
import { rowKey } from './workflow.js';
export function mapImportRows(sheet, config, references = []) {
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
