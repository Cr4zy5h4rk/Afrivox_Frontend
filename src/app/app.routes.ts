import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guard';

// Pages chargées à la demande : le premier chargement ne contient que la coquille.
// Publiques : accueil, catalogue, Model Hub, classement (on parcourt avant de s'inscrire).
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'AfriVox',
    loadComponent: () => import('./features/landing/landing').then((m) => m.LandingPage),
  },
  {
    path: 'datasets',
    title: 'Datasets · AfriVox',
    loadComponent: () => import('./features/datasets/datasets').then((m) => m.DatasetsPage),
  },
  {
    path: 'datasets/:slug',
    title: 'Dataset · AfriVox',
    loadComponent: () =>
      import('./features/datasets/dataset-detail').then((m) => m.DatasetDetailPage),
  },
  {
    path: 'models',
    title: 'Model Hub · AfriVox',
    loadComponent: () => import('./features/models/models').then((m) => m.ModelsPage),
  },
  {
    // Avant `models/:id` pour que « new » ne soit pas pris pour un identifiant
    path: 'models/new',
    title: 'Publier un modèle · AfriVox',
    canActivate: [authGuard, roleGuard('ROLE_DEVELOPER', 'ROLE_ADMIN')],
    loadComponent: () => import('./features/models/model-new').then((m) => m.ModelNewPage),
  },
  {
    path: 'models/:id',
    title: 'Modèle · AfriVox',
    loadComponent: () => import('./features/models/model-detail').then((m) => m.ModelDetailPage),
  },
  {
    path: 'leaderboard',
    title: 'Classement · AfriVox',
    loadComponent: () =>
      import('./features/leaderboard/leaderboard').then((m) => m.LeaderboardPage),
  },
  {
    path: 'quickstart',
    title: 'Démarrage rapide · AfriVox',
    loadComponent: () => import('./features/quickstart/quickstart').then((m) => m.QuickstartPage),
  },
  {
    path: 'login',
    title: 'Connexion · AfriVox',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Créer un compte · AfriVox',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.RegisterPage),
  },
  {
    path: 'dashboard',
    title: 'Mon espace · AfriVox',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.HomePage),
  },
  {
    path: 'record',
    title: 'Enregistrer · AfriVox',
    canActivate: [authGuard, roleGuard('ROLE_CONTRIBUTOR', 'ROLE_ADMIN')],
    loadComponent: () => import('./features/record/record').then((m) => m.RecordPage),
  },
  {
    path: 'validate',
    title: 'Validation · AfriVox',
    canActivate: [authGuard, roleGuard('ROLE_CONTRIBUTOR', 'ROLE_ADMIN')],
    loadComponent: () => import('./features/validate/validate').then((m) => m.ValidatePage),
  },
  {
    path: 'requests',
    title: 'Mes demandes · AfriVox',
    canActivate: [authGuard, roleGuard('ROLE_ORGANIZATION', 'ROLE_ADMIN')],
    loadComponent: () => import('./features/requests/requests').then((m) => m.RequestsPage),
  },
  {
    path: 'purchases',
    title: 'Mes achats · AfriVox',
    canActivate: [authGuard, roleGuard('ROLE_DEVELOPER', 'ROLE_ORGANIZATION', 'ROLE_ADMIN')],
    loadComponent: () => import('./features/purchases/purchases').then((m) => m.PurchasesPage),
  },
  {
    path: 'api-keys',
    title: "Clés d'API · AfriVox",
    canActivate: [authGuard, roleGuard('ROLE_DEVELOPER', 'ROLE_ORGANIZATION')],
    loadComponent: () => import('./features/api-keys/api-keys').then((m) => m.ApiKeysPage),
  },
  {
    path: 'profile',
    title: 'Mon profil · AfriVox',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage),
  },
  {
    path: 'notifications',
    title: 'Notifications · AfriVox',
    canActivate: [authGuard],
    loadComponent: () => import('./features/notifications/notifications').then((m) => m.NotificationsPage),
  },
  {
    path: 'admin',
    title: 'Administration · AfriVox',
    canActivate: [authGuard, roleGuard('ROLE_ADMIN')],
    loadComponent: () => import('./features/admin/admin').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: '' },
];
