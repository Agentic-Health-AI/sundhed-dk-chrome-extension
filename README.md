# Sundhedsarkiv

Chrome-extension til lokal eksport af egne sundhed.dk-data.

Extensionen automatiserer ikke MitID. Brugeren logger selv ind på sundhed.dk, starter opsamling i sidepanelet og besøger de relevante sider. Extensionen opsamler JSON API-svar fra brugerens egen browser-session og kan downloade et samlet ZIP-arkiv med rå JSON, Markdown og CSV for understøttede sektioner.

## Udvikling

```bash
npm install
npm run build
npm test
```

Indlæs derefter `dist/` som unpacked extension i Chrome:

1. Åbn `chrome://extensions`.
2. Slå Developer mode til.
3. Vælg Load unpacked.
4. Vælg mappen `dist/`.

## Brug

1. Åbn sidepanelet via extension-ikonet.
2. Gå til sundhed.dk og log ind med MitID.
3. Tryk `Start opsamling`.
4. Besøg de sundhed.dk-sider, der skal eksporteres.
5. Tryk `Download arkiv`.

## Data og sikkerhed

- Data gemmes midlertidigt i Chrome under sessionen.
- Der sendes ingen sundhedsdata til en server.
- `Ryd opsamlede data` sletter den midlertidige capture-state.
- ZIP-arkivet indeholder følsomme sundhedsoplysninger og bør opbevares lokalt med omtanke.

## Understøttede sektioner

- Medicin
- Prøvesvar
- Journaler
- Vaccinationer
- Aftaler
- Henvisninger
- Egen læge
- Røntgen
- Diagnoser
- Hjemmemålinger
- Forløbsplaner

Første parser-MVP laver struktureret Markdown og CSV for medicin, aftaler, vaccinationer og diagnoser. Øvrige sektioner eksporteres med rå JSON og summarisk Markdown.

## Tests

Testene bruger lokale fixtures og en simuleret sundhed.dk-side. De automatiserer ikke MitID og kalder ikke live sundhed.dk.

```bash
npm test
```
