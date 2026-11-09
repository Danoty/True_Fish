# True Fish — Ocean hybrid design

This is an original design for a boat and fuel workspace, informed by patterns found in related operational and accounting products. Product logos, screenshots and proprietary interface assets are not included.

## Research and synthesis
- Fleetio: fuel metrics, exceptions and dashboard reporting. The official material informed a clear summary of operational quantities, followed by detailed reconciliation. https://www.fleetio.com/solutions/fuel-management-software and https://marketing-cdn.fleetio.com/documents/sales-sheets/fleetio-booklet.pdf
- Samsara: an overview with consistent left-side navigation into fleet, fuel and reporting functions. https://kb.samsara.com/hc/en-us/articles/48621492984589-Dashboard-Menus
- QuickBooks: readable accounting summaries, cash-flow reporting and a clear distinction between financial totals and detailed reports. https://quickbooks.intuit.com/uk/accounting-reports/
- Xero: financial analytics and cash-position summaries presented as separate, understandable panels. https://www.xero.com/us/accounting-software/analytics/

The interpretation and combination of these patterns is a design decision for True Fish, not a claim that those systems use this exact palette.

## Colour roles
| Role | Colour | Hex |
|---|---|---|
| Navigation and structure | Deep navy | #10283F |
| Primary actions and profit | Ocean teal | #0B716A |
| Income | Emerald | #137D56 |
| Fuel and analytical detail | Blue | #2563EB |
| Debt and items needing attention | Amber | #9A5B08 |
| Errors and negative results | Muted red | #B33B3B |
| Page background | Cool white | #F3F6FB |
| Working surfaces | White | #FFFFFF |
| Main text | Navy ink | #172B45 |
| Supporting text | Slate | #5B6D82 |

Colour accents appear at meaningful points: category icons and metric edges, active navigation, selected actions, stock/debt status and chart series. Dense reports remain primarily white for readability. Debt colour identifies a category; it does not assert a payment is overdue. Income and profit chart lines also differ by solid/dashed patterns.

## Verification
Ten key foreground/background pairs meet at least 4.5:1 contrast in the included automated theme check. This does not constitute a full WCAG audit. The existing ledger, storage, analytics, navigation and form tests remain in place. Styling includes keyboard focus rings, reduced-motion support, mobile navigation labels and print-specific colours. No external font, image service or build service is required for the published app.
