import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

// Pages chargées à la demande : le premier chargement ne contient que la coquille.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.HomePage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.RegisterPage),
  },
  { path: '**', redirectTo: '' },
];
