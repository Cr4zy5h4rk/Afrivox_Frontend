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
  features/
    auth/login, auth/register
    home/            accueil selon les rôles
```

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
3. Écran d'enregistrement audio (hors ligne), campagnes, validation.
4. Catalogue de datasets, demandes des organisations.
5. Déploiement : nginx sert ce build et redirige `/api` vers Spring.
