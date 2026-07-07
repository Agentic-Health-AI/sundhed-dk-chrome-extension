# Sundhed.dk API-audit

Dato: 2026-06-17

Metode: Playwright-kontrolleret Chromium med extensionen loadet fra `dist/`. Brugeren loggede selv ind. Audit-runneren loggede kun metode, path, status, query-key-navne, content-type og JSON-shape. Den loggede ikke response-værdier fra sundhedsdata.

Rå auditfiler fra denne lokale kørsel blev skrevet til `/tmp/sundhed-api-audit-2026-06-17T18-29-35-516Z/`.

## Opsamling

Extensionen samler API-svar op via `src/injected.ts`, som hooker `fetch` og `XMLHttpRequest` i page context for `https://www.sundhed.dk/*`. Den forsøger at parse JSON fra alle `/api/` og `/app/` kald, bortset fra åbenlyse binære content-types.

`src/shared/apiMatchers.ts` klassificerer derefter svaret:

- Kendte endpoints mappes til en `SectionId` via `HEALTH_SECTIONS.matchers`.
- `Svaroversigt` i response body mappes til `proevesvar`.
- Andre JSON API-kald fra sundhed.dk gemmes som `ukendt`, så nye endpoints ikke forsvinder.

## Sektioner

| Sektion | API-kald set i browser-run | Klassifikation |
| --- | --- | --- |
| Medicin | `GET /app/medicinkort2borger/api/v1/tekster/` | `medicin` |
| Medicin | `GET /app/medicinkort2borger/api/v1/identity/hasWriteAccess` | `medicin` |
| Medicin | `GET /app/medicinkort2borger/api/v1/identity/selectedname` | `medicin` |
| Medicin | `GET /app/medicinkort2borger/api/v1/ordinations/` with query keys `orderBy`, `sortBy`, `status` | `medicin` |
| Medicin | `GET /app/medicinkort2borger/api/v1/prescriptions/overview/` | `medicin` |
| Medicin | `GET /app/medicinkort2borger/api/v1/ordinations/overview/` | `medicin` |
| Prøvesvar | `GET /app/proevesvarportal/api/v1/usekommunaleproevesvargateway` | `proevesvar` |
| Prøvesvar | `GET /app/proevesvarportal/api/v1/filter` | `proevesvar` |
| Prøvesvar | `POST /app/proevesvarportal/api/v1/IsLoggedIn` with query key `IncludeCPRInResponse` | `proevesvar` |
| Prøvesvar | `GET /app/proevesvarportal/api/v1/adminbeskeder` | `proevesvar` |
| Prøvesvar | `GET /app/proevesvarportal/api/v1/svaroversigt` with query keys `fra`, `omraade`, `source`, `til` | `proevesvar` |
| Vaccinationer | `GET /app/vaccination/api/v1/texts/` | `vaccinationer` |
| Vaccinationer | `GET /app/vaccination/api/v1/appsettings/` | `vaccinationer` |
| Vaccinationer | `GET /app/vaccination/api/v1/effectuatedvaccinations/` with query keys `onlyDeletedVaccines`, `orderBy`, `sortBy` | `vaccinationer` |
| Vaccinationer | `GET /app/vaccination/api/v1/overview` | `vaccinationer` |
| Aftaler | `GET /app/aftalerborger/api/v1/tekster` | `aftaler` |
| Aftaler | `POST /app/aftalerborger/api/v1/aftaler/cpr` | `aftaler` |
| Henvisninger | `GET /app/DenNationaleHenvisningsformidling/api/v1/henvisninger` | `henvisninger` |
| Egen læge | `GET /api/minlaegeorganization/` | `egen-laege` |
| Egen læge | `GET /api/core/organisation/{id}/children` | `egen-laege` |
| Egen læge | `GET /api/core/organisation/{id}` | `egen-laege` |
| Egen læge | `GET /api/eserviceslink/{id}` | `egen-laege` |
| Røntgen | `GET /app/billedbeskrivelserborger/api/v1/billedbeskrivelser/config/` | `roentgen` |
| Røntgen | `GET /app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger/` with query keys `CurrentPage`, `Direction`, `Fra`, `ItemsPerPage`, `SortColumn`, `Til` | `roentgen` |
| Diagnoser | `GET /app/diagnoserborger/api/v1/diagnoser` | `diagnoser` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/isLoggedIn` with query key `IncludeCPRInResponse` | `journaler` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/adminbeskeder` | `journaler` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/valgtperson` with query key `AppId` | `journaler` |
| Journaler | `POST /app/ejournalportalborger/api/ejournal/filtervalg` | `journaler` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/datofiltrering` | `journaler` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/forloebsoversigt` with query keys `ItemsPerPage`, `Side`, `SortDesc`, `Sortering` | `journaler` |
| Journaler | `POST /app/ejournalportalborger/api/ejournal/filter` with body keys `DatoFra`, `DatoTil`, `Diagnoser`, `Filtre`, `ItemsPerPage`, `Sektorer`, `Side`, `SortDesc`, `Sortering` | `journaler` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/vaerdispringcheck` | `journaler` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/kontaktperioder` with query key `noegle` | `journaler` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/epikriser` with query key `noegle` | `journaler` |
| Journaler | `POST /app/ejournalportalborger/api/ejournal/epikriser-page` with query key `noegle` and DataTables body | `journaler` |
| Journaler | `GET /app/ejournalportalborger/api/ejournal/notater` with query key `noegle` | `journaler` |
| Journaler | `POST /app/ejournalportalborger/api/ejournal/notater-page` with query key `noegle` and DataTables body | `journaler` |
| Hjemmemålinger | `POST /app/hjemmemaalingerborger/api/v1/maalinger` | `hjemmemaalinger` |
| Forløbsplaner | `GET /app/planerportalborger/api/v1/plans/` | `forloebsplaner` |

## Generiske kald

Disse kald blev set på tværs af sider. De kan være nyttige kontekstdata, men er ikke primære sundhedsdata og ender typisk som `ukendt`, medmindre en sektion matcher.

| API-kald | Bemærkning |
| --- | --- |
| `GET /app/personvaelgerportal/api/v1/GlobalPersonSelectorAllowedAppIds` | Personvælger |
| `GET /app/personvaelgerportal/api/v1/GetPersonSelection` | Personvælger |
| `GET /api/personvaelger/valgtperson` | Personvælger |
| `GET /api/personvaelger/valgtperson/` with query key `AppId` | Personvælger |
| `GET /app/minsideportal/api/v1/GetLoginInfo` | Min Side |
| `GET /app/minsideportal/api/v1/GetPersonDelegation` | Min Side |
| `GET /app/minsideportal/api/v1/GetMenuItemBlocks` | Min Side |
| `GET /app/minsideportal/api/v1/GetRootPortalUrl` | Min Side |
| `GET /api/auth/mitid/` with query keys `ott_token`, `returnUrl`, `sessionId` | Login redirect |
| `GET /api/application/geturlbyid/514` | Portal navigation |
| `GET /app/findbehandlerv2/api/v1/findbehandler/categories` | Finder service |

## Ikke-data assets set under `/app/`

Disse bliver forsøgt parset af audit-runneren, men extensionens runtime ignorerer dem, fordi de ikke er JSON.

- `/app/*/wwwroot/js/...`
- `/app/*/wwwroot/css/...`
- `/app/*/wwwroot/html/...`
- `/app/*/wwwroot/images/...`
- `/app/*/wwwroot/fonts/...`

## Mangler

Run’et dækkede side-load for hver sektion. Nogle moduler kan have ekstra detail-endpoints, som først kaldes efter klik, filtrering eller pagination:

- Journal: klik på et forløb/notat bør udløse detailkald til `kontaktperioder`, `epikriser` og/eller `notater`.
- Røntgen: klik på en billedbeskrivelse kan udløse detailkald.
- Medicin: historik, receptdetaljer og interaktionsvisninger kan udløse ekstra kald.
- Prøvesvar: ændring af dato/filter kan udløse flere `svaroversigt` kald med andre query keys.
