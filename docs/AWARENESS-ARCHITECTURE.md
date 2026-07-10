# Architecture Awareness

## Objectif

La plateforme gere des campagnes internes de sensibilisation a la cybersécurité sans embarquer de mecanisme d'envoi libre vers des destinataires reels.

## Couches logicielles

### 1. API et securite

- `server/index.js`
- Authentification par session Bearer en memoire
- Roles `admin`, `operateur`, `beta`
- Protection CSRF sur les routes d'ecriture
- Rate limiting global par IP

### 2. Domaine Awareness

- `server/awarenessCampaigns.js`
- Campagnes
- Destinataires
- Groupes
- Modeles generiques
- Journal d'audit
- Suivi des evenements
- Exports CSV/PDF
- Tableaux de bord

### 3. Provider d'integration

- `server/campaignProvider.js`
- Interface `CampaignProvider`
- Implementation `PreviewCampaignProvider`

Responsabilite :
- preparer des messages en local ;
- recevoir plus tard des statuts d'une solution institutionnelle ;
- ne jamais fournir ici un moteur SMTP libre.

### 4. Stockage local

- `server/data/awareness-campaigns.store.json`
- `server/data/awareness-outbox.store.json`

Le stockage est fichier pour la phase actuelle. Une migration vers MySQL ou un stockage applicatif pourra reprendre le meme modele logique.

## Entites principales

### Campagne

- identite : nom, description, responsable
- cycle de vie : `brouillon`, `validee`, `active`, `terminee`, `annulee`
- planification : dates, volume journalier, fenetres horaires
- autorisation : reference et trace de validation

### Groupe

- nom
- description
- membres par email autorise

### Modele

- sujet
- corps HTML
- corps texte
- variables limitees

### Evenement

- `campaign.created`
- `message_distribue`
- `ouverture`
- `clic`
- `signalement`
- `fin_campagne`

## Flux principal

1. Creation campagne
2. Import CSV ou import depuis groupe
3. Attachement d'un modele generique
4. Validation administrative
5. Activation
6. Preparation locale via `CampaignProvider`
7. Reception optionnelle d'evenements d'un systeme externe
8. Reporting et exports

## Extension future

Le point d'integration externe unique est `CampaignProvider`.

Une solution institutionnelle pourra plus tard :
- recevoir les lots prepares ;
- retourner des `providerMessageId` ;
- pousser des statuts vers `POST /api/awareness/provider/events`.

Cela permet de garder le coeur applicatif stable tout en remplaçant seulement l'adaptateur d'integration.
