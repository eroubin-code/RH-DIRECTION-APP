# Configuration

## Fichier `.env`

Le backend charge un fichier `.env` place a la racine du projet.

Exemple minimal :

```env
PORT=3001
RH_DATA_SOURCE=mysql
RH_PASSWORD_SALT=rh-direction-salt
RH_JSON_LIMIT=100kb
RH_SESSION_TTL_MS=28800000
RH_LOGIN_WINDOW_MS=900000
RH_LOGIN_MAX_ATTEMPTS=5
RH_HEALTH_DETAILS=false
RH_INITIAL_ADMIN_USERNAME=
RH_INITIAL_ADMIN_PASSWORD=

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=iecbman2020

MYSQL_VIEW_EFFECTIF=vw_rh_effectif
MYSQL_VIEW_DEPARTS=vw_rh_departs
MYSQL_VIEW_BADGES=vw_rh_badges
MYSQL_VIEW_ENTITES=vw_rh_entites

RH_CSRF_HEADER_NAME=x-csrf-token
RH_REQUEST_WINDOW_MS=60000
RH_REQUEST_MAX_PER_WINDOW=120

RH_AWARENESS_ENABLED=true
RH_AWARENESS_STORE_PATH=server/data/awareness-campaigns.store.json
RH_AWARENESS_OUTBOX_PATH=server/data/awareness-outbox.store.json
RH_AWARENESS_DISPATCH_INTERVAL_MS=300000
RH_AWARENESS_CLEANUP_INTERVAL_MS=3600000
RH_AWARENESS_ALLOWED_DOMAINS=iecb.fr
RH_AWARENESS_LINK_SECRET=change-me
RH_AWARENESS_LINK_TTL_HOURS=1080
RH_AWARENESS_RETENTION_DAYS=90
RH_AWARENESS_ANONYMIZE_REPORTS=true
RH_AWARENESS_WARNING_BANNER=Exercice interne de sensibilisation IECB.
RH_AWARENESS_PUBLIC_BASE_URL=http://127.0.0.1:3001
RH_AWARENESS_FROM_EMAIL=communication-rh@iecb.fr
RH_AWARENESS_FROM_NAME=Communication RH
RH_AWARENESS_REPLY_TO=communication-rh@iecb.fr
RH_AWARENESS_PROVIDER=preview
```

## Sources de donnees

Mode mock :

```env
RH_DATA_SOURCE=mock
```

Le backend sert les donnees locales de `server/data/rhData.js`.

Mode MySQL :

```env
RH_DATA_SOURCE=mysql
```

Le backend interroge MySQL via `mysql2`.

## Variables disponibles

- `PORT` : port du backend Express, par defaut `3001`.
- `RH_PASSWORD_SALT` : sel utilise pour verifier les mots de passe scrypt.
- `RH_JSON_LIMIT` : limite de taille des corps JSON Express, par defaut `100kb`.
- `RH_SESSION_TTL_MS` : duree de validite des sessions en memoire, par defaut 8 heures.
- `RH_LOGIN_WINDOW_MS` : fenetre de limitation des tentatives de connexion, par defaut 15 minutes.
- `RH_LOGIN_MAX_ATTEMPTS` : nombre maximum d'echecs de connexion par fenetre, par defaut `5`.
- `RH_HEALTH_DETAILS` : expose les details MySQL dans `/api/health` si `true`; garder `false` en production.
- `RH_INITIAL_ADMIN_USERNAME` : identifiant admin initial optionnel si aucun store utilisateur n'existe.
- `RH_INITIAL_ADMIN_PASSWORD` : mot de passe admin initial optionnel, a garder hors Git.
- `RH_CSRF_HEADER_NAME` : nom du header CSRF attendu sur les routes d'ecriture authentifiees.
- `RH_REQUEST_WINDOW_MS` : fenetre du rate limit global.
- `RH_REQUEST_MAX_PER_WINDOW` : nombre max de requetes par IP et par fenetre.
- `RH_DATA_SOURCE` : `mock` ou `mysql`.
- `MYSQL_HOST` : hote MySQL.
- `MYSQL_PORT` : port MySQL.
- `MYSQL_USER` : utilisateur MySQL.
- `MYSQL_PASSWORD` : mot de passe MySQL.
- `MYSQL_DATABASE` : base cible.
- `MYSQL_CONNECTION_LIMIT` : taille du pool MySQL, par defaut `10`.
- `MYSQL_SSL` : active SSL si `true`, `1`, `yes` ou `on`.
- `MYSQL_VIEW_EFFECTIF` : vue effectif.
- `MYSQL_VIEW_DEPARTS` : vue departs.
- `MYSQL_VIEW_BADGES` : vue badges.
- `MYSQL_VIEW_ENTITES` : vue entites.
- `RH_AWARENESS_ENABLED` : active le module de sensibilisation.
- `RH_AWARENESS_STORE_PATH` : stockage JSON des campagnes et evenements.
- `RH_AWARENESS_OUTBOX_PATH` : stockage JSON des messages prepares par le provider factice.
- `RH_AWARENESS_DISPATCH_INTERVAL_MS` : frequence de preparation des messages dus.
- `RH_AWARENESS_CLEANUP_INTERVAL_MS` : frequence de purge des campagnes hors retention.
- `RH_AWARENESS_ALLOWED_DOMAINS` : liste blanche de domaines autorises, separes par des virgules.
- `RH_AWARENESS_LINK_SECRET` : secret de signature des liens de suivi.
- `RH_AWARENESS_LINK_TTL_HOURS` : duree de validite des liens signes.
- `RH_AWARENESS_RETENTION_DAYS` : duree de retention des campagnes terminees ou annulees.
- `RH_AWARENESS_ANONYMIZE_REPORTS` : anonymise les rapports collectifs par defaut.
- `RH_AWARENESS_WARNING_BANNER` : bandeau interne ajoute aux messages prepares.
- `RH_AWARENESS_PUBLIC_BASE_URL` : URL publique de base utilisee pour les liens signes.
- `RH_AWARENESS_FROM_EMAIL` : adresse d'expedition fixe.
- `RH_AWARENESS_FROM_NAME` : nom d'affichage fixe.
- `RH_AWARENESS_REPLY_TO` : adresse de reponse fixe.
- `RH_AWARENESS_PROVIDER` : provider local actuel, `preview` uniquement dans cette implementation.

## Vues SQL attendues

- `vw_rh_effectif` : `nom`, `prenom`, `categorie`, `fonction`, `entite`, `badge`, `statut_badge`, `civilite`
- `vw_rh_departs` : `nom`, `prenom`, `date_depart`, `entite`, `action_recommandee`, `badge`
- `vw_rh_badges` : `nom`, `prenom`, `badge`, `interne`, `type_carte`, `statut`
- `vw_rh_entites` : `entite`, `responsable`, `effectif`

## Verification

```bash
curl -s http://127.0.0.1:3001/api/health
```

La reponse expose par defaut uniquement le mode de donnees et l'etat de connexion. Les details MySQL ne sont visibles que si `RH_HEALTH_DETAILS=true`.

## Module awareness

L'implementation actuelle respecte un cadre de sensibilisation interne :

- aucun moteur SMTP operationnel ;
- aucun expediteur libre ;
- aucun domaine imitateur ;
- aucun formulaire de connexion ;
- liens signes et expirables ;
- page pedagogique immediate apres clic ;
- journalisation limitee aux evenements de campagne utiles ;
- provider factice local via `CampaignProvider`.

Le provider actif est `preview`. Il prepare les messages dans `server/data/awareness-outbox.store.json` sans emission reseau.

Exemple de creation d'une campagne :

```bash
curl -X POST http://127.0.0.1:3001/api/awareness/campaigns \
  -H "Authorization: Bearer <token-admin>" \
  -H "x-csrf-token: <csrf-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sensibilisation RH Juillet 2026",
    "description": "Exercice interne IECB.",
    "responsable": "Equipe RH",
    "authorizationReference": "AUT-2026-07-RH",
    "startDate": "2026-07-13",
    "endDate": "2026-07-31",
    "maxPerDay": 4,
    "minGapMinutes": 30,
    "maxGapMinutes": 90,
    "dayStart": "08:30",
    "dayEnd": "16:30"
  }'
```

Routes principales :

- `GET /api/awareness/campaigns`
- `GET /api/awareness/campaigns/:campaignId`
- `GET /api/awareness/dashboard`
- `GET /api/awareness/groups`
- `POST /api/awareness/groups`
- `PATCH /api/awareness/groups/:groupId`
- `GET /api/awareness/templates`
- `POST /api/awareness/templates`
- `PATCH /api/awareness/templates/:templateId`
- `POST /api/awareness/campaigns`
- `PATCH /api/awareness/campaigns/:campaignId`
- `POST /api/awareness/campaigns/:campaignId/recipients/import`
- `POST /api/awareness/campaigns/:campaignId/groups/:groupId/import`
- `POST /api/awareness/campaigns/:campaignId/recipients/exclude`
- `PUT /api/awareness/campaigns/:campaignId/template`
- `POST /api/awareness/campaigns/:campaignId/template/attach`
- `POST /api/awareness/campaigns/:campaignId/validate`
- `POST /api/awareness/campaigns/:campaignId/activate`
- `POST /api/awareness/dispatch`
- `GET /api/awareness/outbox`
- `GET /api/awareness/audit`
- `GET /api/awareness/campaigns/:campaignId/report.csv`
- `GET /api/awareness/campaigns/:campaignId/report.pdf`
- `POST /api/awareness/provider/events`

Les routes publiques signees sont :

- `/awareness/click/:trackingId`
- `/awareness/report/:trackingId`
- `/awareness/unsubscribe/:trackingId`
