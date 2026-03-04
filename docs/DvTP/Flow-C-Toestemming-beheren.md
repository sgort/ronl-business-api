# Flow C - Toestemming beheren

## Bron

De flowchart is afkomstig uit het document dat de Functionele Requirements (FR) voor DvTP (Delen via Toestemming met Private partijen) beschrijft als toetsbaar fundament voor ontwerp, realisatie en beheer van de voorzieningen die toestemming door de burger mogelijk maken in de gegevensuitwisseling tussen publieke en private partijen. De set met functionele requirements is gebaseerd op de use cases uit het Beschrijvend document DvTP v0.2.

## Flowchart

```mermaid
flowchart TB
    %% =========================================================
    %% Flow C — Toestemming beheren & intrekken
    %% =========================================================

    %% --- Definities van Stijlen ---
    classDef actor fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef auth fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,stroke-dasharray: 5 5;
    classDef system fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef decision fill:#ffffff,stroke:#333333,stroke-width:2px;

    %% --- Subgraphs / Domeinen ---
    subgraph UserDomain ["1. Gebruikersdomein"]
        Burger(("Burger")):::actor
    end

    subgraph AuthDomain ["2. Authenticatie"]
        DigiD{{"DigiD<br>(FR-01)"}}:::auth
    end

    subgraph SystemDomain ["3. De GBO-DvTP-voorziening"]
        Portal["<b>Toestemmingsportaal</b><br>(Beheeromgeving)"]:::system
        ConsentDB[("<b>Register</b><br>Historie & Status<br>(FR-20/22)")]:::system
        ConfigDB[("<b>Stamgegevens</b><br>PD + Privacy Officer<br>(FR-25)")]:::system
    end

    %% --- FLOW C: Beheer & Intrekking ---

    %% Toegang
    Burger -- "C-00. Inloggen (FR-01)" --> DigiD
    DigiD -. "C-00b. Auth-resultaat" .-> Portal

    %% Overzicht + inzage
    Burger -- "C-01. Vraag overzicht toestemmingen (FR-20)" --> Portal
    Portal -- "C-02. Haal consent-historie + status (FR-20/22)" --> ConsentDB
    ConsentDB -- "C-03. Retour: lijst + statusdetails (FR-22)" --> Portal
    Portal -- "C-04. Toon overzicht + detailselectie (FR-21/22)" --> Burger

    %% Intrekken starten
    Burger -- "C-05. Actie: Intrekken toestemming (FR-23)" --> Portal
    Portal -- "C-06. Check status: is data al opgehaald? (FR-24)" --> RevokeCheck{"Status = Gebruikt/Opgehaald?<br>(FR-24)"}:::decision

    %% Tak 1: Nog niet opgehaald => intrekken kan
    RevokeCheck -- "C-07a. Nee (Status: Open)" --> RevokeAction["Intrekken / annuleren (FR-23)"]:::system
    RevokeAction -- "C-08a. Update status: Geannuleerd (FR-23)" --> ConsentDB
    ConsentDB -- "C-09a. Bevestig wijziging + actuele status (FR-22)" --> Portal
    Portal -- "C-10a. Toon bevestiging intrekking (FR-23/22)" --> Burger

    %% Tak 2: Al opgehaald => intrekken geblokkeerd + AVG verwijzing
    RevokeCheck -- "C-07b. Ja (Status: Gebruikt)" --> Blocked["Blokkade: intrekken niet mogelijk (FR-24)"]:::system
    Blocked -- "C-08b. Haal contact Privacy Officer (FR-25)" --> ConfigDB
    ConfigDB -- "C-09b. Retour: contactgegevens (FR-25)" --> Blocked
    Blocked -- "C-10b. Toon AVG-uitleg + contact (FR-25)" --> Burger
```
