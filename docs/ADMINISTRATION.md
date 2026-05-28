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
Seul un utilisateur `admin` peut creer un autre utilisateur `admin`.

## Personnel et plans

L'onglet `Personnel` permet de preparer la creation d'une personne dans la base RH.

Lors de la creation :

- `userid` est genere avec les premieres lettres du prenom, ou de chaque prenom compose, suivies d'un point et du nom complet normalise.
- `mdp` est genere automatiquement sur 8 caracteres avec au moins une majuscule, un chiffre et un caractere special.
- le mot de passe genere n'est pas renvoye par l'API afin d'eviter son exposition dans l'interface.
- la personne est inseree dans `personnes`, puis rattachee a l'entite choisie via `personnes_entites`.
- `typesPersonne_id` est renseigne avec le type selectionne dans le formulaire.
- une adresse est creee dans `messagerie` au format `userid@iecb.u-bordeaux.fr`, sauf si la fonction est `Stagiaire`.

Les onglets `Batiments` et `Plans` preparent les prochains modules d'administration. Les ecritures en base seront ajoutees apres validation du modele de donnees.

## Stockage

Un administrateur initial peut etre fourni par les variables `RH_INITIAL_ADMIN_USERNAME` et `RH_INITIAL_ADMIN_PASSWORD` lorsque `server/data/users.store.json` n'existe pas encore.

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
  "password": "<mot-de-passe-a-definir>",
  "role": "beta"
}
```

## Messages d'erreur

- `Authentification requise.` : token absent ou invalide.
- `Acces reserve.` : role non autorise.
- `Le nom utilisateur doit contenir au moins 3 caracteres.`
- `Le mot de passe doit contenir au moins 6 caracteres.`
- `Role utilisateur invalide.`
- `Seul un administrateur peut creer un administrateur.`
- `Cet utilisateur existe deja.`
