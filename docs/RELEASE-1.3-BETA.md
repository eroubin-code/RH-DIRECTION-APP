# Release 1.3 Beta

## Resume

La version 1.3 Beta consolide l'interface de navigation, ajoute une zone d'administration des utilisateurs et documente le deploiement serveur Nginx utilise pour `rh-app.local.iecb.u-bordeaux.fr`.

## Perimetre fonctionnel

- Les onglets de navigation sont horizontaux, inclines, avec contour blanc et sans barre de defilement horizontale.
- Le contenu principal est separe des onglets par un espace global.
- L'administration n'est plus affichee dans la navigation ; elle est disponible par acces direct a `/admin` pour les roles habilites.
- Sur `/admin`, les onglets metier sont remplaces par les modules `Utilisateurs`, `Personnel`, `Batiments` et `Plans`.
- La page Administration permet de creer des utilisateurs applicatifs et prepare les futurs modules personnel et plans batiment.
- Les utilisateurs crees sont conserves dans `server/data/users.store.json`.

## Roles

- `admin` : acces complet aux routes metier et a l'administration.
- `operateur` : acces metier et administration utilisateurs.
- `beta` : acces metier sans administration.

## Fichiers principaux

- `src/App.jsx` : version affichee, routage et protection de `/admin`.
- `src/components/Header.jsx` : actions globales sans bouton Administration.
- `src/components/Sidebar.jsx` : onglets metier uniquement.
- `src/pages/AdministrationPage.jsx` : formulaire et liste utilisateurs.
- `src/styles/rh.css` : layout, onglets, panneaux et KPI.
- `server/index.js` : routes API administration et controles de role.
- `server/data/users.js` : seeds, roles et persistance utilisateurs.

## Verification avant publication

```bash
npm install
npm run build
```

En local :

```bash
npm run dev
curl -s http://127.0.0.1:5173/api/health
```

Sur le serveur :

```bash
curl -s http://127.0.0.1:3001/api/health
curl -I http://127.0.0.1/
```

## Notes connues

- Le fichier `.env` ne doit pas etre commite.
- Le fichier `server/data/users.store.json` est ignore par Git pour conserver les utilisateurs propres a chaque environnement.
- Le message Vite sur `NODE_ENV=production` dans `.env` est informatif ; il faut privilegier une configuration Vite si `NODE_ENV` doit etre force.
