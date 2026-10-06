import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Appels qui ne portent pas de jeton d'accès : authentification elle-même, inscription, consentement. */
const PUBLIC_PREFIXES = ['/api/authenticate', '/api/register', '/api/consent'];

/**
 * Ajoute le jeton d'accès aux appels /api. Sur un 401 (jeton expiré), tente un seul rafraîchissement puis rejoue
 * l'appel ; si le rafraîchissement échoue, renvoie vers la page de connexion.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (
    !request.url.startsWith('/api/') ||
    PUBLIC_PREFIXES.some((prefix) => request.url.startsWith(prefix))
  ) {
    return next(request);
  }

  const withToken = (token: string | null): HttpRequest<unknown> =>
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(withToken(auth.token())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        catchError((refreshError: unknown) => {
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          return throwError(() => refreshError);
        }),
        switchMap((token) => next(withToken(token))),
      );
    }),
  );
};
