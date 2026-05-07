# Administration utilisateurs

## Acces

La page Administration est disponible a l'URL applicative :

```text
/administration
```

Elle est affichee dans la barre d'actions du haut uniquement pour les roles :

- `admin`
- `operateur`

Les utilisateurs `beta` n'ont pas acces a cette page.

## Creation d'un utilisateur

Champs requis :

- utilisateur : au moins 3 caracteres
- mot de passe : au moins 6 caracteres
- role : `beta`, `operateur` ou `admin`

Le backend verifie que le nom utilisateur n'existe pas deja, sans tenir compte de la casse.

## Stockage

Les utilisateurs initiaux sont definis dans :

```text
server/data/users.js
```

Les utilisateurs crees depuis l'interface sont stockes localement dans :

```text
server/data/users.store.json
```

Ce fichier est ignore par Git afin d'eviter de publier des comptes propres a un environnement.

## API

Lister les utilisateurs :

```http
GET /api/admin/users
Authorization: Bearer <token>
```

Creer un utilisateur :

```http
POST /api/admin/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "nouvel.utilisateur",
  "password": "secret123",
  "role": "beta"
}
```

## Messages d'erreur

- `Authentification requise.` : token absent ou invalide.
- `Acces reserve.` : role non autorise.
- `Le nom utilisateur doit contenir au moins 3 caracteres.`
- `Le mot de passe doit contenir au moins 6 caracteres.`
- `Role utilisateur invalide.`
- `Cet utilisateur existe deja.`
