# Prepaid Card Administration

Administers prepaid card programmes end to end — from ordering cards with an
issuer, through delivery onboard, issuance and registration, to disposal —
across clients whose physical stock is never within arm's reach.

Two ideas shape the whole system:

1. **Book position versus verified position.** What the movement ledger says is
   kept separate from what a human last physically confirmed. Every screen
   surfaces the gap, because a tidy number from a vessel nobody has counted in
   five months is not the same as a confirmed one.
2. **Cards are client-owned from the order.** A card order is placed for a client
   with an issuer, and its serial ranges become real card records when the order
   is received. That is the only route by which stock enters the system.

## Running it

```bash
npm install
cp .env.example .env      # DATABASE_URL="file:./dev.db"
npm run setup             # apply migrations, generate the client, load demo data
npm run dev               # http://localhost:3000
```

`npm run setup` seeds two issuers, two clients, six locations, eight
cardholders, ~1,000 cards and one open order. It refuses to seed over a database
that already holds cards. To start clean: `npm run db:reset`.

Schema changes go through migrations (`npm run db:migrate` in development,
`npm run db:deploy` in production), so upgrades preserve data.

For production: `npm run build && npm start`.

## The card lifecycle

```
Order placed  →  Order received  →  Delivered onboard  →  Issued  →  Registered  →  Disposed
   (pipeline)      IN_STOCK           IN_TRANSIT →          ISSUED     REGISTERED     DISPOSED
                                      IN_STOCK
```

**Ordering** (`/orders`) — place an order for a client with Monavate, FAB or any
other issuer. Each line carries a product and an inclusive **serial range**; the
quantity is derived from the range so the two can never disagree. Nothing enters
inventory yet — open orders show as a pipeline figure, clearly separate from
stock in hand.

**Receiving** — booking an order in expands its serial ranges into real card
records at the delivery location, owned by the client, each with a ledger entry.
Part-shipments are supported: receiving 200 of 500 books in the first 200
serials, and the next receipt continues where it left off. Serials already on
file are skipped and reported rather than failing the receipt.

**Delivery** (`/deliveries`) — deliberately two-step. Dispatching marks cards
`IN_TRANSIT` and takes them off the sender's available stock, but they do **not**
appear on the vessel until someone onboard confirms receipt. At confirmation you
tick off what actually arrived; anything unticked stays in transit and is
reported short. Confirmed cards are stamped as physically verified.

**Issuing** — hand cards to a cardholder from the cards list, in bulk. Issuing
records who holds a card; it does not make it live.

**Registration** (`/registrations`) — the milestone that makes a card live.
Paste or upload serials, optionally with a crew reference to link the cardholder
in the same pass. **A registered card stops counting as available stock
automatically** — that is the deduction, and nothing else needs doing.

Registration data usually arrives from the issuer after the fact, so a card still
sitting as in stock or in transit is registered anyway rather than rejected: the
issuer knows better than the book does, and the ledger keeps the correction
visible. Every line comes back as registered, already registered, serial not in
system, or rejected (the card had already left circulation).

**Disposal** (`/disposals`) — terminal, with the trail an auditor asks for: who
disposed of them, who witnessed it, by what method, against which certificate.

## Other ways inventory gets updated

**Excel import** (`/import`) — for loading an existing position or applying bulk
updates. Detects the header row, auto-maps columns, normalises real-world status
wording (*available* → In stock, *missing* → Lost), reads dates day-first or
month-first as you choose, and previews every change before anything is written.
Mappings can be saved by name and reapplied next month. A registration date in
the file registers the card, whatever the status column says.

**Manual entry** — add or edit individual cards, move stock, change status in
bulk.

**Stock counts** (`/stock-counts`) — reconcile a physical count against the book
position. Results sort into matched, missing and unexpected; you choose what the
variances do, and applying writes a movement against every affected card.

## What the dashboard watches

- Cards still on order versus cards actually in hand
- Locations past their agreed count interval, and stock below its reorder point
- Deliveries dispatched over three weeks ago and never confirmed
- Cards in transit that **no open delivery accounts for** — short deliveries whose
  shipment was closed around them, which nothing else would chase
- Position by client and by issuer, so the Monavate/FAB split is always visible

## Data model

| Model | Role |
| --- | --- |
| `Client` | A customer programme. Owns locations, cardholders, orders and cards. |
| `Issuer` | Monavate, FAB, and whoever comes next. Products and orders belong to one. |
| `CardOrder` / `CardOrderLine` | What was ordered, with the serial range that becomes stock on receipt. |
| `Card` | One physical card, keyed on serial. Carries client, cardholder, status and verification trail. |
| `Cardholder` | The seafarer or staff member a card is issued to, with their full card history. |
| `Delivery` / `DeliveryLine` | A shipment and its manifest, with per-card receipt confirmation. |
| `RegistrationBatch` / `RegistrationLine` | A batch of registrations and the outcome of each serial. |
| `Disposal` / `DisposalLine` | Cards taken out of circulation, with the certificate trail. |
| `Movement` | Append-only ledger. Every card change writes one, whatever caused it. |
| `StockCount` / `StockCountLine` | A physical count and its variance lines. |
| `Location`, `CardType`, `ImportBatch`, `ImportMapping` | Supporting reference data. |

Every card mutation funnels through `applyCardChange` in `src/lib/inventory.ts`,
so the ledger is complete by construction rather than by discipline. A single
card's history reads end to end:

```
ORDER_RECEIVED     IN_STOCK    Singapore Warehouse   Received against ORD-NORDLINE-2026Q4
DELIVERY_DISPATCH  IN_TRANSIT                        Dispatched on DLV-MV-NORDIC-20260916
DELIVERY_RECEIPT   IN_STOCK    MV Nordic Wind        Received onboard
REGISTER           REGISTERED                        Registered — removed from available stock
```

## Card numbers and personal data

Only the **last 4 digits** of a card number are ever stored; full PANs are
discarded on import and on manual entry. Cardholder records hold names, crew
references, rank, nationality and contact details — no dates of birth or
identity-document data. Keep the app behind your own access controls.

## Known limits

- **No authentication.** Anyone who can reach the app has full access. It is built
  for a single trusted HQ team on a private network. Put it behind a VPN or a
  reverse proxy with auth before exposing it, and add per-client accounts before
  letting vessels enter their own data.
- **`.xlsx` / `.xlsm` only, 20 MB.** Save `.xls` and `.csv` files as `.xlsx` first.
- **Excel loses precision past 15 digits.** Long serials must be formatted as Text
  in the source sheet. The importer detects affected columns and warns, but it
  cannot recover digits Excel has already rounded away.
- **Serial ranges are capped at 100,000 per order line.** Split larger orders
  across lines.
- **SQLite**, so one writer at a time. Fine for an HQ team; switch the datasource
  in `prisma/schema.prisma` to Postgres if concurrent use grows.
- **Registration and disposal cannot be undone** from the UI. Corrections are made
  as new movements, which is what keeps the audit trail honest.

## Layout

```
prisma/schema.prisma      data model
prisma/migrations/        versioned schema history
prisma/seed.ts            demo data
src/lib/                  domain logic — ledger, orders, deliveries, registration,
                          disposal, reconciliation, serial ranges, Excel
src/app/                  routes; *.tsx pages, actions.ts server actions
src/app/api/              CSV exports and the blank .xlsx template
scripts/                  sample spreadsheet generator
```
