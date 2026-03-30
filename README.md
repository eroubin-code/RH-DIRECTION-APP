# RH Direction App

Application web RH de pilotage pour la direction, construite avec React + Vite côté frontend et Node/Express côté backend.

L'interface propose un tableau de bord RH, des pages de suivi de l'effectif, des départs, des badges et des entités. Le backend peut fonctionner soit avec des données simulées, soit avec une base MySQL `iecbman2020`.

## Demarrage

1. Installer les dependances :

```bash
npm install
```

2. Lancer le frontend et le backend en meme temps :

```bash
npm run dev
```

3. Ouvrir l'application :

- frontend : `http://localhost:5173`
- backend : `http://localhost:3001`

Compte local par defaut :

- utilisateur : `sysadm`
- mot de passe : `Tp0sana`

## Structure

```text
rh-direction-app/
├─ public/
│  ├─ images/
│  └─ ...
├─ server/
│  ├─ config.js
│  ├─ index.js
│  └─ data/
│     ├─ index.js
│     ├─ rhData.js
│     └─ users.js
├─ src/
│  ├─ components/
│  ├─ pages/
│  ├─ services/
│  └─ styles/
├─ .env.example
├─ package.json
└─ README.md
```

## Branchement MySQL

Le projet est pret pour se connecter a MySQL avec un mode de donnees configurable.

1. Copier `.env.example` vers `.env`
2. Passer `RH_DATA_SOURCE=mysql`
3. Renseigner les acces MySQL
4. Verifier les noms des vues SQL
5. Redemarrer le serveur Node

Exemple :

```env
RH_DATA_SOURCE=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=mon_mot_de_passe
MYSQL_DATABASE=iecbman2020
MYSQL_VIEW_EFFECTIF=vw_rh_effectif
MYSQL_VIEW_DEPARTS=vw_rh_departs
MYSQL_VIEW_BADGES=vw_rh_badges
MYSQL_VIEW_ENTITES=vw_rh_entites
```

## Vues SQL attendues

Le backend interroge par defaut les vues suivantes :

- `vw_rh_effectif`
- `vw_rh_departs`
- `vw_rh_badges`
- `vw_rh_entites`

Colonnes attendues :

- `vw_rh_effectif` : `nom`, `prenom`, `categorie`, `fonction`, `entite`, `badge`, `statut_badge`, `civilite`
- `vw_rh_departs` : `nom`, `prenom`, `date_depart`, `entite`, `action_recommandee`, `badge`
- `vw_rh_badges` : `nom`, `prenom`, `badge`, `interne`, `type_carte`, `statut`
- `vw_rh_entites` : `entite`, `responsable`, `effectif`

Si tes vues portent d'autres noms, change simplement les variables `MYSQL_VIEW_*` dans `.env`.

## Mode mock et mode mysql

- `RH_DATA_SOURCE=mock` : le backend sert les donnees locales de `server/data/rhData.js`
- `RH_DATA_SOURCE=mysql` : le backend interroge MySQL via `mysql2`

Le mode `mock` est utile pour continuer a travailler sur l'interface meme si la base n'est pas encore disponible.

## Fichiers importants

- `server/config.js` : charge `.env` et centralise la configuration
- `server/data/index.js` : selectionne la source de donnees et execute les requetes MySQL
- `server/index.js` : expose les routes API protegees
- `src/services/api.js` : client frontend pour appeler l'API

## Verification

Tu peux verifier l'etat du backend ici :

```bash
http://localhost:3001/api/health
```

La reponse indique si l'application tourne en mode `mock` ou `mysql`, et si la connexion MySQL est etablie.
