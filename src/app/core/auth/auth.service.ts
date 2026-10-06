import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

export type RoleName =
  'ROLE_ADMIN' | 'ROLE_USER' | 'ROLE_CONTRIBUTOR' | 'ROLE_DEVELOPER' | 'ROLE_ORGANIZATION';

/** Rôles que l'on peut choisir à l'inscription (jamais l'administrateur). */
export type RegistrableRole = 'CONTRIBUTOR' | 'DEVELOPER' | 'ORGANIZATION';

export interface Account {
  login: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  langKey?: string | null;
  authorities: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe: boolean;
}

export interface RegisterRequest {
  login: string;
  email: string;
  password: string;
  langKey: string;
  role: RegistrableRole;
  consentVersion: string;
}

interface TokenResponse {
  id_token: string;
}

/**
 * Session de l'utilisateur.
 * <ul>
 *   <li>Le jeton d'accès (15 min) reste en mémoire : jamais dans localStorage, donc inaccessible à un script injecté
 *       après un rechargement de page.</li>
 *   <li>Le jeton de rafraîchissement est un cookie HttpOnly géré par le navigateur : ce code ne le voit jamais.</li>
 * </ul>
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(null);
  private readonly _account = signal<Account | null>(null);
  private readonly _ready = signal(false);

  /** Rafraîchissement en cours, partagé par tous les appelants (voir refresh()). */
  private refreshInFlight$: Observable<string> | null = null;

  readonly token = this._token.asReadonly();
  readonly account = this._account.asReadonly();
  /** Vrai une fois la tentative de restauration de session terminée (réussie ou non). */
  readonly ready = this._ready.asReadonly();
  readonly isAuthenticated = computed(() => this._account() !== null);
  readonly roles = computed(() => this._account()?.authorities ?? []);

  login(request: LoginRequest): Observable<Account> {
    return this.http.post<TokenResponse>('/api/authenticate', request).pipe(
      tap((response) => this._token.set(response.id_token)),
      switchMap(() => this.loadAccount()),
    );
  }

  register(request: RegisterRequest): Observable<void> {
    return this.http.post<void>('/api/register', request);
  }

  /**
   * Obtient un nouveau jeton d'accès grâce au cookie de rafraîchissement.
   * Le serveur fait tourner ce cookie à chaque appel et révoque la session si un ancien cookie est rejoué :
   * deux appels simultanés avec le même cookie couperaient donc la session. Tous les appelants partagent
   * par conséquent le même appel en cours (« single-flight »).
   */
  refresh(): Observable<string> {
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.http.post<TokenResponse>('/api/authenticate/refresh', {}).pipe(
        map((response) => response.id_token),
        tap((token) => this._token.set(token)),
        catchError((error: unknown) => {
          this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => (this.refreshInFlight$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshInFlight$;
  }

  /** Au démarrage : retrouve la session grâce au cookie, sans erreur si l'utilisateur n'est pas connecté. */
  restoreSession(): Promise<void> {
    return firstValueFrom(
      this.refresh().pipe(
        switchMap(() => this.loadAccount()),
        map(() => undefined),
        catchError(() => of(undefined)),
        finalize(() => this._ready.set(true)),
      ),
    );
  }

  logout(): void {
    this.http
      .post<void>('/api/authenticate/logout', {})
      .pipe(
        catchError(() => of(undefined)),
        finalize(() => {
          this.clearSession();
          void this.router.navigate(['/login']);
        }),
      )
      .subscribe();
  }

  hasRole(role: RoleName): boolean {
    return this.roles().includes(role);
  }

  private loadAccount(): Observable<Account> {
    return this.http
      .get<Account>('/api/account')
      .pipe(tap((account) => this._account.set(account)));
  }

  private clearSession(): void {
    this._token.set(null);
    this._account.set(null);
  }
}
