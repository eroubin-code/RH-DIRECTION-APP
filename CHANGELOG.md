# Changelog

Toutes les evolutions notables de RH Direction App sont documentees ici.

## 1.3.0-beta.0 - 2026-05-07

### Ajoute

- Page `Administration` pour consulter et creer des utilisateurs applicatifs.
- Roles applicatifs `admin`, `operateur` et `beta`.
- Routes API protegees `GET /api/admin/users` et `POST /api/admin/users`.
- Persistance locale des utilisateurs crees dans `server/data/users.store.json`.
- Documentation de release, deploiement, exploitation, administration et configuration.

### Modifie

- Version applicative affichee : `Version 1.3 Beta`.
- Navigation principale remplacee par des onglets horizontaux en parallelogramme.
- Bouton `Administration` deplace dans la barre d'actions du haut.
- Grille KPI descendue et onglets espaces du contenu.
- Styles globaux ajustes avec une pile typographique Aptos / Inter / Segoe UI.
- Panneaux RH ajustes pour mieux correspondre au rendu de production.

### Deploiement

- Deploiement valide sur Nginx avec frontend dans `/opt/rh-direction-app/dist`.
- Backend Node pilote par `rh-direction-app.service`.
- Proxy Nginx `/api/` vers `http://127.0.0.1:3001`.

### Validation

- `npm run build`
- Test backend local : `GET /api/health`
- Test serveur Nginx : `curl -I http://127.0.0.1/`

## 1.2 Beta

### Ajoute

- Comptes beta locaux pour les tests reseau.
- Scripts de lancement local et bac a sable.
- Ajustements des KPI du tableau de bord.
