import assert from 'node:assert/strict';
import {dateRange,reconcile,stockMovements,daySummary,trend,cleanPreferences} from '../analytics.js';
assert.deepEqual(dateRange('week','2026-03-02'),{start:'2026-02-24',end:'2026-03-02'});assert.equal(dateRange('month','2026-11-08').start,'2026-11-01');assert.deepEqual(dateRange('all','2026-11-08'),{start:'',end:''});
const date='2026-11-08';const rows=[{id:'1',kind:'opening',date,created:'00',litres:100},{id:'2',kind:'purchase',date,created:'01',litres:50,price:180},{id:'3',kind:'sale',date,created:'02',litres:20,price:200,cash:3900},{id:'4',kind:'credit',date,created:'03',boat:'Boat 1',litres:10,price:200},{id:'5',kind:'repayment',date,created:'04',boat:'Boat 1',litres:5,cash:1000},{id:'6',kind:'donation',date,created:'05',litres:5},{id:'7',kind:'boat',date,created:'06',boat:'Boat 1',income:7000,boss:1580,expenses:100,commission:158}];
const r=reconcile(rows);assert.equal(r.purchaseCost,9000);assert.equal(r.variance,100);assert.equal(r.repaymentCash,1000);assert.equal(stockMovements(rows).at(-1).balance,115);assert.equal(stockMovements(rows).length,5);
const d=daySummary(rows,date);assert.equal(d.boats,1);assert.equal(d.missing.length,14);assert.equal(d.net,1322);assert.equal(d.fuel.sold,20);
const series=trend(rows,date,3);assert.equal(series[0].income,0);assert.equal(series[2].income,7000);assert.equal(series[2].net,1322);
assert.equal(cleanPreferences({commissionRate:101}).commissionRate,null);assert.equal(cleanPreferences({lowStock:-2}).lowStock,0);assert.equal(cleanPreferences({company:' '}).company,'True Fish Ent.');
console.log('Passed: reporting dates, cash reconciliation, stock balances, daily summaries, chart series and preferences.');
