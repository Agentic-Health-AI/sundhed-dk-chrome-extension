# Sundhedsarkiv product backlog

Dette er en prioriteret opsamling fra UX-, reliability-, privacy-, test- og idé-review.

## Byg først

- Eksportens sundhedstjek: vis hentet, tomt, usikkert og kræver handling pr. sektion.
- Patientvenlige statusord: brug "tekniske svar", "læsbart dokument", "regneark" og "tekniske originaldata" i UI.
- Prøvesvar-dækning: vis antal hentede datovinduer og ældste dækkede dato.
- Journal-komplethed: vis fangede journaltekster mod forventede notater/epikriser/kontaktperioder fra forløbsoversigten.
- Auto-hentning status: vis planlagt, i gang, lykkedes, fejlet eller sprunget over for ekstra API-kald.
- Efter-download kvittering: vis hvad der blev hentet, hvad der mangler, og mind brugeren om at rydde lokal opsamling.
- Background/sidepanel tests: dæk runtime-state, Kør alle, download, clear og fejltilstande.

## Biohacker / power-user features

- Lab-trends pr. biomarkør med referenceinterval, seneste værdi og ændring over tid.
- Biomarker alias-mapping, så lokale laboratorienavne kan samles under samme markør.
- Personlig baseline og afvigelser fra egen historik.
- Health timeline på tværs af prøvesvar, medicin, journaler, diagnoser, vaccinationer og aftaler.
- Eksporthistorik og diff mellem to lokale ZIP-eksporter.
- Egne noter/tags på datoer, prøvesvar og medicinændringer.
- Data quality report med dubletter, huller, manglende datoer og ufuldstændige sektioner.
- Power exports: long CSV, JSONL, SQLite/DuckDB eller FHIR-lignende struktur.

## Patient / almindelig bruger

- "Er alt kommet med?"-panel med rolig status pr. sektion.
- Forklaring af 0 fund: det kan være korrekt, hvis sundhed.dk ikke viser data.
- Forhåndsvisning før ZIP-download.
- Hjælp pr. status, især ved prøvesvar og journaler.
- Tydelig privatlivsstatus: data bliver lokalt i browseren og sendes ikke til en server.
- Efter-download flow: hvor gemmes filen, hvad indeholder den, og hvornår bør brugeren rydde data.

## Privacy og sikkerhed

- Overvej debug-opt-in for rå JSON i eksporten.
- Rediger eller minimer URL query values i raw exports.
- Aktiv oprydning af IndexedDB efter udløb via alarms/startup-cleanup.
- Secret/privacy check i CI eller pre-commit for live exports, HAR, traces, zip-filer og CPR-lignende mønstre.
- Behandl page-context bridge som ubetroet input: schema-validering, allowlist og rate-limits.
