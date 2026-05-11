# Administration utilisateurs

## Acces

La page Administration est disponible a l'URL applicative :

```text
/admin
```

Un acces direct a `/admin` affiche d'abord la page d'authentification si aucune session n'est active.

Elle est disponible uniquement pour les roles :

- `admin`
- `operateur`

Les utilisateurs `beta` n'ont pas acces a cette page.

Sur cette page, les onglets metier sont remplaces par des onglets dedies a l'administration :

- `Utilisateurs`
- `Personnel`
- `Batiments`
- `Plans`

## Creation d'un utilisateur

Champs requis :

- utilisateur : au moins 3 caracteres
- mot de passe : au moins 6 caracteres
- role : `beta`, `operateur` ou `admin`

Le backend verifie que le nom utilisateur n'existe pas deja, sans tenir compte de la casse.

## Personnel et plans

L'onglet `Personnel` permet de preparer la creation d'une personne dans la base RH.

Lors de la creation :

- `userid` est genere avec les premieres lettres du prenom, ou de chaque prenom compose, suivies du nom complet normalise.
- `mdp` est genere automatiquement sur 8 caracteres avec au moins une majuscule, un chiffre et un caractere special.
- la personne est inseree dans `personnes`, puis rattachee a l'entite choisie via `personnes_entites`.

Les onglets `Batiments` et `Plans` preparent les prochains modules d'administration. Les ecritures en base seront ajoutees apres validation du modele de donnees.

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
