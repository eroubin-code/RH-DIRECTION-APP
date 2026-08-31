# server/assets

Fichiers statiques utilises par le backend.

## fiche-arrivee-modele.pdf

Modele PDF de la "Fiche d'arrivee" IECB, utilise par `server/ficheArrivee.js` a la
validation d'une saisie arrivant (les valeurs de la personne sont superposees sur
les pages 1-2 ; les pages annexes sont conservees telles quelles).

Ce fichier n'est pas versionne ici par defaut (document interne). Deposer le PDF a
cet emplacement, ou pointer `RH_FICHE_ARRIVEE_TEMPLATE` vers son chemin.

Les positions des champs sont dans `server/ficheArrivee.js` (objet `LAYOUT`,
coordonnees en pixels sur un rendu large de 950 px, origine haut-gauche) — a
ajuster apres un premier rendu reel.
