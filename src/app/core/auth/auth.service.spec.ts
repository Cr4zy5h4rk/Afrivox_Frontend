import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account, AuthService } from './auth.service';

const ACCOUNT: Account = {
  login: 'alice',
  email: 'alice@example.com',
  authorities: ['ROLE_USER', 'ROLE_CONTRIBUTOR'],
};

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('garde le jeton en mémoire et charge le compte après la connexion', () => {
    auth.login({ username: 'alice', password: 'secret123', rememberMe: false }).subscribe();

    http.expectOne('/api/authenticate').flush({ id_token: 'jeton-1' });
    http.expectOne('/api/account').flush(ACCOUNT);

    expect(auth.token()).toBe('jeton-1');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.hasRole('ROLE_CONTRIBUTOR')).toBe(true);
    expect(auth.hasRole('ROLE_ADMIN')).toBe(false);
  });

  it('partage un seul appel de rafraîchissement entre appelants simultanés', () => {
    const received: string[] = [];
    auth.refresh().subscribe((token) => received.push(token));
    auth.refresh().subscribe((token) => received.push(token));

    // un seul POST malgré deux demandes : sinon le serveur verrait un rejeu et couperait la session
    http.expectOne('/api/authenticate/refresh').flush({ id_token: 'jeton-2' });

    expect(received).toEqual(['jeton-2', 'jeton-2']);
    expect(auth.token()).toBe('jeton-2');
  });

  it('permet un nouveau rafraîchissement une fois le précédent terminé', () => {
    auth.refresh().subscribe();
    http.expectOne('/api/authenticate/refresh').flush({ id_token: 'a' });

    auth.refresh().subscribe();
    http.expectOne('/api/authenticate/refresh').flush({ id_token: 'b' });

    expect(auth.token()).toBe('b');
  });

  it('efface la session quand le rafraîchissement est refusé', () => {
    auth.login({ username: 'alice', password: 'secret123', rememberMe: false }).subscribe();
    http.expectOne('/api/authenticate').flush({ id_token: 'jeton-1' });
    http.expectOne('/api/account').flush(ACCOUNT);

    auth.refresh().subscribe({ error: () => undefined });
    http
      .expectOne('/api/authenticate/refresh')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.token()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('termine la restauration de session sans erreur quand personne n’est connecté', async () => {
    const restored = auth.restoreSession();

    http
      .expectOne('/api/authenticate/refresh')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await restored;

    expect(auth.ready()).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('retrouve la session grâce au cookie de rafraîchissement', async () => {
    const restored = auth.restoreSession();

    http.expectOne('/api/authenticate/refresh').flush({ id_token: 'jeton-3' });
    http.expectOne('/api/account').flush(ACCOUNT);
    await restored;

    expect(auth.ready()).toBe(true);
    expect(auth.account()?.login).toBe('alice');
  });
});
