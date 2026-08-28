# CLAUDE.md

Ce fichier fournit des indications à Claude Code (claude.ai/code) pour travailler avec le code de ce dépôt.

## Projet

RH Direction App — tableau de bord RH interne destiné à la direction, actuellement en version 1.3 Beta (voir [package.json](package.json) et [`APP_VERSION`](src/App.jsx)). Frontend React + Vite, backend Node/Express. Le backend peut fonctionner soit avec des données simulées ("mock"), soit avec une vraie base MySQL (`iecbman2020`).

Répondre en français pour tout texte destiné à l'utilisateur ou toute documentation dans ce dépôt (le code, les messages de commit, les textes de l'interface et les commentaires sont en français).

## Commandes

```bash
npm install                # installe les dépendances
npm run dev                # frontend (Vite, :5173) + backend (Node --watch, :3001) en parallèle
npm run dev:client         # frontend seul
npm run dev:server         # backend seul
npm run build               # vite build -> dist/
npm run preview             # prévisualise le build de production
npm run lint                 # eslint .
npm run start:server        # lance le backend sans --watch (proche de la prod)
```

Il n'y a actuellement aucune suite de tests dans ce dépôt.

Démarrage en bac à sable local (sans dépendance à `.env`/MySQL, données mock) :
- Linux/WSL : `bash ./start-sandbox-local.sh`
- Windows : `start-sandbox-local.bat`

Session beta en réseau local (frontend exposé sur `0.0.0.0:5173` pour un accès depuis un autre poste) : `start-beta-local.bat`.

Vérification de santé pendant que le backend tourne : `GET http://localhost:3001/api/health` — indique si l'application est en mode `mock` ou `mysql` et si la connexion à la base est établie.

## Architecture

### Deux processus d'exécution, un seul contrat d'API

- `server/index.js` — une app Express en un seul fichier : authentification par session, toutes les routes `/api/*`, et les routes des campagnes de sensibilisation (awareness). Pas de découpage en routers ; les nouveaux endpoints s'ajoutent directement ici en suivant le pattern existant (`requireAuth`, puis `requireRole([...])`, puis `requireCsrf` pour les écritures).
- `src/services/api.js` — le seul endroit où le frontend dialogue avec le backend. Chaque appel backend est une fonction exportée nommée ici (`login`, `getDashboardData`, `createAwarenessCampaign`, …) ; les pages/composants appellent ces fonctions plutôt que d'utiliser `fetch` directement. Ce module gère le token d'auth et le token CSRF dans `localStorage`, et déclenche un événement `rh-auth-expired` sur `window` en cas de 401, écouté par `App.jsx` pour forcer la déconnexion.
- Le serveur de dev Vite fait un proxy de `/api` vers `http://localhost:3001` ([vite.config.js](vite.config.js)) ; en production, Nginx fait le même proxy devant le `dist/` compilé et le service Node (voir Déploiement plus bas).

### Modèle d'authentification

Sessions en mémoire (`Map` dans `server/index.js`, pas de store Redis/BDD — redémarrer le backend déconnecte tout le monde). Token Bearer émis sur `/api/auth/login`, couplé à un token CSRF distinct requis (via l'en-tête `x-csrf-token`) sur chaque requête de mutation. Trois rôles : `admin`, `operateur`, `beta` — `admin`/`operateur` conditionnent l'accès à `/admin`, `/awareness`, et à la plupart des endpoints d'écriture ; certaines actions awareness (validate/activate/cancel/dispatch) sont réservées à `admin`. Le rate limiting et le throttling des tentatives de connexion sont eux aussi en mémoire, par IP, dans `server/index.js`.

La racine `/` et `/dashboard` servent un tableau de bord **public, non authentifié** (`GET /api/public/dashboard`) quand le visiteur n'est pas connecté — restreint côté serveur aux plages IP privées/locales via `isPrivateDashboardRequest`, contrôlé par `RH_PUBLIC_DASHBOARD_ENABLED`. C'est intentionnel (accès interne temporaire), pas un bug — voir [App.jsx](src/App.jsx) et [server/index.js](server/index.js).

### Couche de données — double mode (mock vs MySQL)

`server/data/index.js` est le point d'entrée unique (`getRhDataset`, `getAnnualSnapshotReport`, `getPersonnelTypes`, `createPersonnel`, `getDataStatus`, `getPhishingCandidates`) et bascule selon `appConfig.dataSource.mode` :
- **mock** : renvoie les données statiques de `server/data/rhData.js`.
- **mysql** : exécute du SQL écrit à la main sur les tables `entites`/`personnes`/`personnes_entites`/`typesPersonnes`/`tutellesPersonnes`/`typesEntites`/`messagerie` (le schéma est externe — ce dépôt ne gère pas de migrations), ainsi que sur des vues configurables (`vw_rh_effectif`, `vw_rh_departs`, `vw_rh_badges`, `vw_rh_entites`, noms modifiables via les variables d'env `MYSQL_VIEW_*`). Les KPI/regroupements du dashboard sont calculés en JS à partir des résultats de requêtes (`computeDashboard`), pas en SQL.

Lors de l'ajout d'une fonctionnalité liée aux données, dupliquer les deux branches (tableau mock + requête MySQL) plutôt que de ne traiter qu'un seul mode — les pages supposent la même forme de données quelle que soit la source.

`createPersonnel` applique des règles métier non évidentes à la lecture du code : `userid` est dérivé automatiquement du prénom/nom (initiale(s) du ou des prénoms + nom normalisé), le mot de passe est généré côté serveur (8 caractères, jamais renvoyé par l'API), et une adresse `messagerie` au format `userid@iecb.u-bordeaux.fr` est créée sauf pour la fonction `Stagiaire`. Détails et endpoints admin associés : [docs/ADMINISTRATION.md](docs/ADMINISTRATION.md).

Chargement de la config : `server/config.js` parse `.env` à la main (pas de dépendance `dotenv`) vers `process.env`, puis expose un objet unique `appConfig` à la forme figée, consommé partout — ne pas lire `process.env` directement ailleurs. Voir `.env.example` et [docs/CONFIGURATION.md](docs/CONFIGURATION.md) pour la liste complète des variables.

### Sous-système Awareness (campagnes de sensibilisation phishing)

Un module autonome pour gérer des campagnes internes de simulation de phishing / sensibilisation à la sécurité :
- `server/awarenessCampaigns.js` (~1450 lignes) — campagnes, destinataires, groupes, modèles, journal d'audit, export CSV/PDF des rapports ; stockage fichier JSON (`server/data/awareness-campaigns.store.json`, `awareness-outbox.store.json`).
- `server/campaignProvider.js` — le seul point d'intégration pour l'envoi effectif ; aujourd'hui seul un `PreviewCampaignProvider` existe (prépare les messages localement, n'envoie jamais de vrai email). Toute future intégration réelle ESP/SMTP devrait s'ajouter comme un nouveau provider derrière cette interface, plutôt que de faire grossir la logique d'envoi dans `awarenessCampaigns.js`.
- Cycle de vie d'une campagne : `brouillon → validee → active → terminee/annulee`, piloté par `/api/awareness/campaigns/:id/{validate,activate,cancel}` (réservé admin) et un timer de dispatch/nettoyage en tâche de fond dans `server/index.js` (actif uniquement si `RH_AWARENESS_ENABLED=true`).
- Documentation complète : [docs/AWARENESS-ARCHITECTURE.md](docs/AWARENESS-ARCHITECTURE.md) ; référence API : [docs/AWARENESS-API.md](docs/AWARENESS-API.md).

### Persistance des utilisateurs/admin

`server/data/users.js` — les utilisateurs vivent dans `server/data/users.store.json` (ignoré par Git, réécrit à chaque création/changement de mot de passe), initialisé depuis `RH_INITIAL_ADMIN_USERNAME`/`RH_INITIAL_ADMIN_PASSWORD` sur un environnement vierge. Les mots de passe sont hashés en `scrypt` avec un sel configurable (`RH_PASSWORD_SALT`) — pas de dépendance bcrypt.

### Structure du frontend

- `src/App.jsx` — porte l'état d'authentification, le formulaire de login, et tout le routage de haut niveau (`react-router-dom`) ; les pages sous `src/pages/` sont les cibles de routes, les composants génériques sous `src/components/` (`Sidebar`, `Header`, `DataTable`, `KpiCard`, `PieChart`, `BrandLogo`) sont l'UI partagée.
- Le style est réparti entre `src/styles/` (propre à l'app : `global.css`, `rh.css`) et `src/styles-institutionnel/` (une feuille de style institutionnelle/de charte importée + les assets `magnific-popup`) — vérifier les deux en cherchant une classe.
- Pas de librairie de gestion d'état ni de tests de composants ; l'état est local (`useState`/`useEffect`) par page, chaque page va chercher ses propres données via `src/services/api.js` au montage.

### Scripts ponctuels (`scripts/`)

Des scripts Node autonomes, hors runtime de l'app : `export-equipes-unites-tutelles.mjs` (écrit des fichiers `.xlsx` à la main — construit le zip OOXML manuellement, sans dépendance à une librairie `xlsx`) et `extract-sesame-accesses.mjs` (scraper Playwright d'un portail institutionnel externe). À lancer directement avec `node scripts/<file>.mjs` ; non intégrés aux scripts `npm run`.

## Déploiement

La cible de production est Nginx + systemd sur un hôte dédié (`rh-app.local.iecb.u-bordeaux.fr`) : `dist/` compilé servi statiquement, `/api/` proxifié vers le service Node sur `:3001` (`rh-direction-app.service`). Déploiement = `npm install && npm run build && systemctl restart rh-direction-app.service` depuis `/opt/rh-direction-app`. Détails complets dans [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) et [docs/OPERATIONS.md](docs/OPERATIONS.md).
