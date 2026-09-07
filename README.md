# Prepaid Card Inventory

Tracks prepaid card stock across vessels, offices, warehouses and agents, where
the physical cards are never within arm's reach of the person answering for them.

The app keeps two positions apart on purpose:

- the **book position** — what the system believes, derived from a movement ledger
- the **verified position** — what somebody last physically confirmed, via a stock count

Every screen surfaces the gap between them, because a tidy-looking number from a
vessel that has not been counted in five months is not the same as a confirmed one.

## Running it

```bash
npm install
cp .env.example .env      # DATABASE_URL="file:./dev.db"
npm run setup             # create the database, generate the client, load demo data
npm run dev               # http://localhost:3000
```

`npm run setup` seeds ~1,000 demo cards across six locations so the dashboard has
something to show. It refuses to seed over an existing database. To start clean:

```bash
rm prisma/dev.db && npm run setup
```

For production: `npm run build && npm start`.

### Sample spreadsheet

`sample-data/vessel-report.xlsx` is a deliberately untidy vessel report — title
block above the table, non-obvious column names, text dates, mixed-case statuses —
for exercising the importer. Regenerate it with `npx tsx scripts/make-sample-xlsx.ts`.

## How stock gets updated

Three routes in, all of which land in the same ledger:

**1. Excel import** (`/import`) — the main route. Upload a report, and the app
detects the header row, guesses which column feeds which field, and shows you a
preview. Nothing is written until you commit.

- Column mapping is yours to confirm and adjust; mappings can be saved by name
  and reapplied to next month's file.
- Statuses are normalised from real-world wording: *available*, *unissued* and
  *on hand* all become **In stock**; *missing* and *unaccounted* become **Lost**.
- Dates are read as day-first or month-first — you choose, rather than the app
  guessing and silently corrupting expiry dates.
- The **as-of date** is the date the vessel reported, not the date you uploaded.
  Movements are stamped with it.
- **Treat this file as physical confirmation** decides whether the import counts
  as verification. Leave it on for a report a human filled in; turn it off for an
  issuer extract nobody physically checked.
- `/api/template` (the "Download blank template" button) produces a blank workbook
  pre-filled with your own location and card-type codes, so vessels report in
  vocabulary the importer already recognises.

**2. Manual entry** — add or edit cards at `/cards`, move stock between locations
in bulk, or change status for a selection of cards. Locations and card types are
managed at `/locations` and `/card-types`.

**3. Stock counts** (`/stock-counts`) — the reconciliation route. Record what a
location physically holds (pasted serials or an uploaded sheet) and the app sorts
the result into three buckets:

| Bucket | Meaning |
| --- | --- |
| **Matched** | Expected there and found. Stamped as verified on the count date. |
| **Missing** | System says it is there, nobody saw it. |
| **Unexpected** | Found there, but booked elsewhere, in another state, or unknown. |

Cards already *issued* to crew are not expected in the ship's safe, so their
absence is not counted as a variance — but if one does turn up it lands in
Unexpected with its real status attached.

You then choose what the variances should do: mark the missing ones lost or leave
them for investigation, relocate the strays or leave them, and whether to create
records for serials the system has never seen. Applying is deliberate and separate
from recording, and it writes a movement against every affected card.

## Data model

| Model | Role |
| --- | --- |
| `Card` | One physical card, keyed on its serial. Carries `lastVerifiedAt`/`lastVerifiedBy`. |
| `Location` | Vessel, office, warehouse, agent or transit. Holds `reorderPoint` and `countIntervalDays`. |
| `CardType` | The product — currency and description. |
| `Movement` | Append-only ledger. Every change to a card writes one, whatever caused it. |
| `StockCount` / `StockCountLine` | A physical count and its variance lines. |
| `ImportBatch` | What each upload did, with its errors and column mapping. |
| `ImportMapping` | A saved, reusable column mapping. |

All card mutations funnel through `applyCardChange` in `src/lib/inventory.ts`, so
the ledger is complete by construction rather than by discipline. Alerts key off
per-location settings: `reorderPoint` drives low-stock warnings, and
`countIntervalDays` drives the overdue-verification warnings.

## Card numbers

Only the **last 4 digits** of a card number are ever stored. Full PANs are
discarded during import and on manual entry, and never written to the database.

## Known limits

- **No authentication.** Anyone who can reach the app has full access. It is built
  for a single trusted HQ team on a private network. Put it behind a VPN or a
  reverse proxy with auth before exposing it, and add per-location accounts before
  letting vessels enter their own counts.
- **`.xlsx` / `.xlsm` only, 20 MB.** Save `.xls` and `.csv` files as `.xlsx` first.
- **Excel loses precision past 15 digits.** Long serials must be formatted as Text
  in the source sheet. The importer detects affected columns and warns you, but it
  cannot recover digits Excel has already rounded away.
- **SQLite**, so one writer at a time. Fine for an HQ team; move to Postgres by
  changing the datasource in `prisma/schema.prisma` if concurrent use grows.
- **Reconciliation cannot be undone** from the UI. Corrections are made as new
  movements, which is what keeps the audit trail honest.

## Layout

```
prisma/schema.prisma      data model
prisma/seed.ts            demo data
src/lib/                  domain logic — ledger, import, reconciliation, Excel
src/app/                  routes; *.tsx pages, actions.ts server actions
src/app/api/              CSV exports and the blank .xlsx template
scripts/                  sample spreadsheet generator
```
