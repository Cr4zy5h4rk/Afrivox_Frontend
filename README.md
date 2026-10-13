# AfriVox : frontend

Application web de la plateforme AfriVox : enregistrement et validation de phrases dans des langues africaines, catalogue de datasets, Model Hub et classement public.

Angular 22, composants autonomes, signaux, Angular Material, application web progressive (PWA). L'API est dans le dépôt `AfriVox` (backend).

## Sommaire

1. [Démarrage](#démarrage)
2. [Pages](#pages)
3. [Architecture](#architecture)
4. [Authentification](#authentification)
5. [Langues et sens de lecture](#langues-et-sens-de-lecture)
6. [Enregistrement audio](#enregistrement-audio)
7. [Identité visuelle](#identité-visuelle)
8. [PWA](#pwa)
9. [Déploiement](#déploiement)
10. [Licences](#licences)

## Démarrage

Prérequis : Node.js et npm. Le backend doit tourner sur `http://localhost:8080` (profil `dev`).

```bash
npm install
npm start          # http://localhost:4200, les appels /api sont relayés vers le backend (proxy.conf.json)
npm run build      # build de production dans dist/afrivox-web, service worker actif
```

Le micro n'est utilisable qu'en HTTPS ou sur `localhost`.

## Pages

Toutes les pages sont chargées à la demande. Les routes protégées sont vérifiées par des gardes ; le serveur revérifie les droits de chaque appel.

| Route | Accès | Contenu |
| --- | --- | --- |
| `/` | public | Accueil : chiffres en direct, usages, fonctionnement, langues, datasets. |
| `/datasets`, `/datasets/:slug` | public | Catalogue et fiche d'un dataset : fiche, statistiques, aperçu, fichiers, modèles, achat. |
| `/models`, `/models/:id` | public | Model Hub et fiche d'un modèle : évaluations, licence, commentaires. |
| `/leaderboard` | public | Classement par WER, par catégorie de tâche et par langue. |
| `/quickstart` | public | Démarrage rapide : compte, clé d'API, téléchargement, classement. |
| `/login`, `/register` | visiteurs | Connexion et inscription (rôle, consentement). |
| `/dashboard` | connecté | Espace personnel selon le rôle. |
| `/record` | contributeur, admin | Enregistrement des phrases d'une campagne. |
| `/validate` | contributeur, admin | Relecture des enregistrements des autres. |
| `/profile` | connecté | Compte, informations déclarées, consentement, crédits. |
| `/notifications` | connecté | Réponses et commentaires sur mes modèles. |
| `/models/new` | développeur, admin | Publication d'un modèle. |
| `/purchases` | développeur, organisation, admin | Mes achats et téléchargements. |
| `/api-keys` | développeur, organisation | Création et révocation de clés d'API. |
| `/requests` | organisation, admin | Demandes de datasets sur mesure. |
| `/admin` | admin | Utilisateurs, campagnes, datasets, demandes, contributeurs, crédits, modération, qualité, traçabilité. |

Aucun chiffre n'est écrit en dur : les statistiques viennent de `/api/public/**` et s'affichent « — » ou 0 sans données.

## Architecture

```
src/app/
├── core/
│   ├── auth/       session (jeton en mémoire), intercepteur HTTP, gardes de routes
│   ├── api/        services d'accès à l'API (catalogue, contribution, validation, achats…)
│   ├── audio/      enregistreur du micro, encodeur WAV, file d'envoi hors ligne
│   ├── i18n/       traduction à l'exécution (fr, en) et sens de lecture
│   └── ui/         composants communs (logo, bandeau)
├── features/       une page ou un ensemble de pages par dossier
│   ├── landing, datasets, models, leaderboard, quickstart
│   ├── auth, home, profile, notifications
│   ├── record, validate
│   ├── purchases, api-keys, requests
│   └── admin
└── app.routes.ts   routes et gardes
```

Les textes sont dans `core/i18n/translations*.ts`. Le style global et les jetons de couleur sont dans `src/styles.scss`.

## Authentification

- Le **jeton d'accès** (15 minutes) reste en mémoire, jamais dans `localStorage`.
- Le **jeton de rafraîchissement** est un cookie `HttpOnly` posé par le serveur, invisible du JavaScript.
- Au démarrage, `POST /api/authenticate/refresh` retrouve la session.
- Sur une réponse 401, l'intercepteur tente **un seul** rafraîchissement partagé entre les requêtes simultanées, rejoue la requête, sinon renvoie vers `/login`.
- `returnUrl` n'est accepté que s'il commence par `/` (pas de redirection ouverte).

## Langues et sens de lecture

`I18nService` traduit à l'exécution (français, anglais) sans recharger la page et met à jour `<html lang>` et `<html dir>`.

Pour ajouter une langue : ajouter un dictionnaire dans `translations.ts` (le compilateur exige les mêmes clés que le français) puis une entrée dans `LANGUAGES`, avec `dir: 'rtl'` si elle s'écrit de droite à gauche. Les styles utilisent des propriétés logiques (`margin-inline`, `padding-inline`) pour suivre le sens de lecture.

## Enregistrement audio

- Enregistrement au micro avec onde en direct, durée de 1 à 30 s, réécoute avant envoi.
- Chaque enregistrement est converti en **WAV 16 kHz mono** dans le navigateur avant l'envoi (repli sur le fichier d'origine si la conversion échoue).
- **Hors ligne** : sans réseau, l'audio est gardé dans IndexedDB et envoyé au retour de la connexion.
- La suppression de bruit du navigateur est désactivée : le signal brut est conservé pour l'entraînement ; le contrôle qualité mesure le bruit côté serveur.

## Identité visuelle

Thème clair, défini en jetons CSS `--afv-*` dans `src/styles.scss` et reporté sur les jetons Angular Material.

| Rôle | Couleur |
| --- | --- |
| Structure (bandeaux, titres) | indigo `#1e2a6b` |
| Actions | terracotta `#c4411a` |
| Réussite | vert `#1f7a55` |
| Accent | ocre `#d9a12a` |

Police du système, icônes SVG intégrées, aucune ressource externe chargée. `prefers-reduced-motion` est respecté.

## PWA

`@angular/pwa` : manifeste, icônes et service worker (actif seulement en build de production). Les appels `/api` ne sont jamais mis en cache.

## Déploiement

En production, nginx sert le contenu de `dist/afrivox-web` et redirige `/api` vers le backend, sur un seul domaine en HTTPS. La pile complète (images Docker, nginx, certificats) est décrite dans `AfriVox/deploy/README.md`.

## Licences

Toutes les dépendances livrées sont sous licence permissive (Angular, Angular Material, CDK : MIT ; RxJS : Apache 2.0). L'inventaire du projet est dans `AfriVox/LICENSES-THIRD-PARTY.md`.
