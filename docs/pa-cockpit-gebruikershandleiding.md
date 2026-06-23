# PA-Cockpit — Gebruikershandleiding (test)

**Provincie Flevoland · versie 3.4.2**

---

## Navigatie

De cockpit heeft vier hoofdsecties in de topbalk:

| Sectie         | Doel                                           |
| -------------- | ---------------------------------------------- |
| **Vandaag**    | Startscherm: topissues, verse signalen, agenda |
| **Dossiers**   | Per-dossier werkblad (Issuekaart + subtabs)    |
| **Monitoring** | Gecureerde signalen per signaalbron            |
| **Voortgang**  | Mijlpalenvoortgang alle actieve dossiers       |

---

## Deel 1 — Dossiers

### Wat is een dossier?

Een dossier bundelt alles rondom één politiek-inhoudelijk thema: het Flevolands Kompas, stakeholders, het lobby- en communicatieritme, frames en tegenframes, en de tijdlijn van relevante gebeurtenissen. Het is het centrale werkblad van de PA-medewerker.

### Huidige dossiers (testomgeving)

| ID          | Naam                      | Status     |
| ----------- | ------------------------- | ---------- |
| `stikstof`  | Stikstof & gebiedsproces  | Actief     |
| `lelystad`  | Lelystad Airport          | Actief     |
| `energie`   | Netcongestie & energy hub | Actief     |
| `jeugdzorg` | Jeugdzorg                 | Sluimerend |

> **Testbeperking:** Dossiers toevoegen, bewerken en archiveren via de UI is nog niet gebouwd. De vier bovenstaande zijn de testset. Noteer tijdens de sessie welke velden/acties je mist — dat is directe input voor de volgende sprint.

### Een dossier openen

Ga naar **Dossiers** in de topbalk → klik op een dossiernaam in de linker zijbalk.

Je landt op de **Issuekaart** (standaardsubtab), met bovenaan:

- De naam en het onderwerp
- Kompas-totaalscore (0–12) en momentum (↑ / → / ↓)

### Subtabs van de Issuekaart

| Subtab                 | Wat je ziet / kunt doen                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Issuekaart**         | Contexttekst, Kompas, PA 2.0-plan, stakeholdertabel                                          |
| **Monitoring**         | Signalen specifiek voor dit dossier (zie §Monitoring)                                        |
| **Narratief**          | Ons verhaal, dominante frames, onze tegenframes                                              |
| **Actie & co-creatie** | Productsjablonen starten, stakeholders plannen, samenwerken _(knoppen zijn stubs in v3.4.2)_ |
| **OverlegBox**         | Teamchat gekoppeld aan het dossier _(lokale state, nog niet gepersisteerd)_                  |
| **Tijdlijn**           | Lobby-canon: verleden + geplande mijlpalen                                                   |

### Flevolands Kompas lezen

Het Kompas scoort zes criteria op 0–2. Totaal maximaal 12.

| Criterium     | Vraag                                           |
| ------------- | ----------------------------------------------- |
| Opgaven       | Draagt het bij aan regionale/nationale opgaven? |
| Momentum      | Speelt het nú politiek?                         |
| Coalitie      | Wie trekt er mee?                               |
| Uitvoering    | Kunnen wij leveren?                             |
| Zichtbaarheid | Versterkt het ons verhaal?                      |
| Opbrengst     | Levert het regel- of investeringsruimte op?     |

Score **0** = niet/nauwelijks · **1** = enige mate · **2** = sterk

### Dossiers onderhouden (wat je nú kunt testen)

Hoewel er nog geen bewerkscherm is, zijn er wél werkende interacties:

1. **OverlegBox** — schrijf een bericht en kijk of collega's het zien. Noteer of de chatfunctie aansluit bij hoe het team overlegt.
2. **Tijdlijn** — loop de events door en geef aan of de indeling (verleden vs. gepland, docs koppelen) klopt met de praktijk.
3. **Narratief** — beoordeel of de frames/tegenframes-structuur bruikbaar is voor voorbereiding op debatten.

---

## Deel 2 — Monitoring

### Hoe werkt de curatiepijplijn?

```
Opgeslagen zoekvraag (per dossier)
        ↓
Ophalen uit Tweede Kamer + Officiële Bekendmakingen
        ↓
Regelscoring (relevantie 1–10, koppeling aan dossier)
        ↓
[optioneel] AI stelt duiding voor
        ↓
PA-medewerker bevestigt → verschijnt in Gecureerd
```

Alleen bevestigde signalen zijn zichtbaar voor het hele team. De inbox is persoonlijk.

### Tabs en bronnen

| Tab                  | Bronnen                                | Status             |
| -------------------- | -------------------------------------- | ------------------ |
| **Politiek (NL)**    | Tweede Kamer, Officiële Bekendmakingen | ✓ Gekoppeld        |
| **Regionaal**        | Officiële Bekendmakingen               | ✓ Gekoppeld        |
| **Europa (EU)**      | —                                      | Nog geen connector |
| **Media & omgeving** | —                                      | Nog geen connector |

Europa en Media tonen een eerlijke melding. Dat is bewust — geen gesimuleerde data.

### Gecureerd-weergave

Klik op de **Gecureerd**-tab (standaard). Je ziet per signaal:

- **Relevantiescore** (1–10) — hoe relevant is het signaal voor Flevoland?
- **Bronbadge** — Tweede Kamer of Off. Bekendmakingen
- **Titel** van het document
- **Bronvermelding** — type, datum, provenance-link (↗ klikt door naar het originele document)
- **Duiding** — de PA-interpretatie van het signaal
- **Impact** — Kans of Risico
- **Bevestigd door** — wie het signaal heeft goedgekeurd en wanneer
- Knop **Naar dossier** — springt naar de Issuekaart van het gekoppelde dossier

### Inbox — signalen beoordelen

Klik op de **Inbox**-tab. Je ziet kandidaat-signalen die door de regels zijn opgepikt maar nog niet bevestigd zijn.

Een kandidaat heeft twee varianten:

- **✦ AI-concept** — de AI heeft alvast een duiding en impactbeoordeling voorgesteld. Controleer of die klopt.
- **Regel-kandidaat** — alleen door regels gescoord, nog geen duiding. Handmatige duiding nodig.

**Acties per signaal:**

| Knop           | Effect                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------- |
| **Bevestigen** | Signaal verschijnt in Gecureerd. De beslissing wordt vastgelegd als _AI adviseerde · mens besloot_. |
| **Negeren**    | Signaal verdwijnt uit de inbox voor deze sessie.                                                    |

> **Testtip:** Klik door naar het originele document via de provenance-link (↗) vóór je bevestigt. Beoordeel of de AI-duiding de Flevolandse relevantie correct inschat.

### Dossier-specifieke monitoring (Issuekaart → Monitoring)

Open een dossier → ga naar de subtab **Monitoring**. Je ziet:

1. **Opgeslagen zoekvraag** — de query + hashtags die de pijplijn gebruikt om signalen voor dit dossier op te halen. Controleer of de termen kloppen met wat je in de praktijk zou zoeken.
2. **Te bevestigen** — inbox-kandidaten die aan dit dossier zijn gekoppeld.
3. **Gecureerd** — bevestigde signalen voor dit dossier.

---

## Deel 3 — Vandaag (startscherm)

Het startscherm geeft een 30-secondenoverzicht:

1. **Top-issues** — vijf dossiers op Kompas-score + momentum
2. **Signalen vandaag** — de drie meest relevante bevestigde signalen van vandaag + een banner als er inbox-kandidaten wachten
3. **Aanbevolen interventies** — IOU-suggesties uit de dossiers met de hoogste score
4. **Agenda-venster** — aankomende events gekoppeld aan dossiers
5. **Voortgang in één oogopslag** — voortgangsbalk per actief dossier

---

## Testscenario's (suggesties)

| #   | Scenario                                                                      | Doel                                     |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Open Monitoring → Politiek (NL) → Inbox → bevestig een AI-concept signaal     | Curatieflow einde-tot-einde              |
| 2   | Negeer een regel-kandidaat, verifieer dat die verdwijnt uit de inbox          | Dismiss-flow                             |
| 3   | Ga naar dossier Stikstof → subtab Monitoring → bekijk de opgeslagen zoekvraag | Klopt de query met jullie zoekpraktijk?  |
| 4   | Klik op een provenance-link (↗) bij een bevestigd signaal                     | Traceerbaarheid naar bron                |
| 5   | Open Vandaag → kijk of de top-issues overeenkomen met de actuele prioritering | Kompas-calibratie                        |
| 6   | Open Europa (EU) → lees de empty-state                                        | Verwachtingsmanagement connector-roadmap |

---

## Bekende beperkingen testversie

- Dossiers **toevoegen / bewerken / archiveren**: nog geen UI — nodig voor volgende sprint
- OverlegBox-berichten: lokale state, **niet gepersisteerd** na page refresh
- Actieknoppen (Analyseer, Maak, Plan, Transcribeer): stubs — klikken doet nog niets
- Curation scheduler: pipeline draait **niet automatisch** in dev — signalen worden éénmalig geladen bij opstarten van de backend of via handmatige aanroep
- Europa en Media: **geen connector** — bewuste keuze voor v3.4.2

---

Vragen of bevindingen → meld ze direct tijdens de testsessie of open een issue op GitHub.
