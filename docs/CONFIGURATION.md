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
