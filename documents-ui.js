function printBrand() { return `<div class="print-brand"><img src="true-fish-logo.png" alt="True Fish Business Suite"><div><b>${esc(preferences.company)}</b><strong>${esc(tab)}</strong><span>Printed ${today()} · KSh</span></div></div>`; }
function exportReport(data, name) {
    if (!data.length) return toast('No rows to export.');
    const titles = {'true-fish-records':'Boat, fuel & business records','true-fish-audit':'Record history','true-fish-full-trial':'Trial balance','true-fish-profit-loss':'Profit & loss','true-fish-balance-sheet':'Balance sheet','true-fish-cashbook':'Cashbook','true-fish-cashbook-trial-balance':'Cashbook trial balance','true-fish-receipts':'Payment receipt register','true-fish-fuel-reconciliation':'Fuel reconciliation'};
    const title=titles[name] || name.replace(/^true-fish-/,'').replaceAll('-',' ').replace(/^./,c=>c.toUpperCase());
    const report = brandedReport(data,{company:preferences.company,title,logo:LOGO_DATA_URI,period:(filter.start || 'All dates')+' to '+(filter.end || 'latest recorded date')+(filter.boat?' · '+filter.boat:''),generated:new Date().toLocaleString('en-GB',{timeZone:'Africa/Nairobi'})+' EAT',preparedBy:localActor().name});
    const url=URL.createObjectURL(new Blob([report],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Branded report downloaded. Open it to print or save as PDF.');
}
