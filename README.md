# AfriVox — frontend

Application Angular 22 (composants autonomes, signaux, PWA) de la plateforme AfriVox. Le backend est dans `../AfriVox` (voir son README pour l'API et l'authentification).

## Démarrage

```bash
npm install
npm start          # http://localhost:4200, les appels /api sont relayés vers http://localhost:8080
npm run build      # build de production dans dist/afrivox-web (service worker actif)
npm test           # tests unitaires (Vitest)
```

Le backend doit tourner en profil `dev` (cookie de rafraîchissement sans attribut `Secure` en HTTP local). Il faut aussi un compte administrateur ou une inscription préalable : `/register` est ouvert.

## Architecture

```
src/app/
  core/
    auth/            session (jeton en mémoire), intercepteur HTTP, gardes de routes
    i18n/            traduction à l'exécution (fr, en) et sens de lecture
    api-error.ts     erreurs HTTP -> clés de traduction
    consent.service.ts
    api/             appels de l'espace contributeur (campagnes, phrases, envoi, consentements)
    audio/           enregistreur du micro, file d'envoi hors ligne (IndexedDB)
    ui/              logo (barres d'onde)
  features/
    auth/login, auth/register
    home/            accueil : accroche, bouton d'enregistrement selon le rôle
    record/          écran d'enregistrement (/record)
```

### Identité visuelle

Définie dans `src/styles.scss` (Material fournit la base, les couleurs de marque la remplacent, en clair et en sombre) :

- **Terracotta** `#a8401c` (action, micro), **indigo** `#2b3a78` (repères), **vert** `#2e6b4e` (réussite), **ocre** `#c98a12` (accent), sur un **fond sable** `#fbf5ea`. Variantes sombres : fond `#17110d`, accents éclaircis.
- Signature : bandeau de triangles (`.afv-band`, inspiré des tissus bogolan), logo en barres d'onde (`app-brand-mark`), titres en police à empattement du système (`--afv-display`).
- Pas de police ni d'icône externe (hors ligne) ; les icônes sont des SVG intégrés. `prefers-reduced-motion` est respecté.

### Écran d'enregistrement (`/record`, rôles contributeur et admin)

1. **Consentement de collecte** (`GET/POST /api/consents`) s'il n'est pas actif : sans lui le serveur refuse l'envoi (403).
2. **Campagne** : une seule ouverte, elle est choisie d'office ; sinon liste. Progression `x / y` calculée par le serveur.
3. **Boucle** : phrase (sens de lecture et langue de la campagne), micro, onde en direct, durée (1 à 30 s, arrêt automatique), réécoute, envoi ou « refaire ».
4. **Hors ligne** : sans réseau, l'audio est gardé dans IndexedDB (`OutboxService`) et envoyé au retour de la connexion ou à la prochaine ouverture. 400/409 suppriment l'élément en attente ; 401/403 le gardent.
5. Erreurs micro traduites : refusé, absent, **HTTPS requis**, navigateur non pris en charge.

Choix : suppression du bruit désactivée (signal brut pour l'entraînement, le contrôle qualité mesure le bruit) ; format choisi selon le navigateur (webm, ogg, mp4), vérifié côté serveur par le contenu.

Limites : le micro n'est pas utilisable en HTTP hors `localhost` ; pas encore de retrait de consentement dans l'interface ; non testé avec un vrai micro ni sur iOS Safari.

### Authentification

- Le **jeton d'accès** (15 min) reste en mémoire uniquement, jamais dans `localStorage`.
- Le **jeton de rafraîchissement** est un cookie `HttpOnly` posé par le serveur : le code JavaScript ne le voit pas.
- Au démarrage, `provideAppInitializer` appelle `POST /api/authenticate/refresh` pour retrouver la session.
- Sur une réponse 401, l'intercepteur tente **un seul** rafraîchissement, rejoue la requête, sinon renvoie vers `/login`.
- Les rafraîchissements simultanés partagent le même appel (« single-flight ») : le serveur révoque la session si un ancien cookie est rejoué.
- `returnUrl` n'est accepté que s'il commence par `/` (pas de redirection ouverte).

### Inscription

Rôle au choix (contributeur, développeur, organisation) et consentement. La version du consentement est lue sur `GET /api/consent/current` et renvoyée telle quelle ; le bouton reste inactif tant qu'elle n'est pas chargée.

**Le texte juridique du consentement n'est pas encore rédigé** : la case ne renvoie pour l'instant vers aucune page.

### Langues et sens de lecture

`I18nService` traduit à l'exécution (fr, en) et met à jour `<html lang>` et `<html dir>`. Pour ajouter une langue : ajouter un dictionnaire dans `translations.ts` (le compilateur exige les mêmes clés que le français) et une entrée dans `LANGUAGES` avec `dir: 'rtl'` si elle s'écrit de droite à gauche. Les styles utilisent des propriétés logiques (`margin-inline`, `padding-inline`) pour que la mise en page suive le sens de lecture.

### PWA

`@angular/pwa` : manifeste, icônes et service worker (actif seulement en build de production). Les appels `/api` sont exclus de la navigation gérée par le service worker (`ngsw-config.json`) et ne sont jamais mis en cache.

## Licences

Angular, Angular Material, CDK, RxJS : MIT / Apache 2.0 (à reporter dans l'inventaire des licences du projet). Aucune police ni ressource externe n'est chargée : police système, pas d'icônes en police.

## État

- Build de production : OK.
- Tests : `auth.service.spec.ts` écrit, **non exécuté**.
- Pas encore testé de bout en bout avec le backend.

## Reste à faire

1. Texte du consentement et conditions d'utilisation (page dédiée).
2. Réinitialisation du mot de passe (le backend l'expose déjà ; nécessite un SMTP).
3. ~~Écran d'enregistrement~~ fait (voir ci-dessus). Reste : validation par les pairs, retrait de consentement, historique « mes enregistrements ».
4. Catalogue de datasets, demandes des organisations.
5. Déploiement : nginx sert ce build et redirige `/api` vers Spring.
