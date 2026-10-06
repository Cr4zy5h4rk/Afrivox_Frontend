import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/** Version du consentement en vigueur côté serveur (à renvoyer telle quelle à l'inscription). */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly http = inject(HttpClient);

  currentVersion(): Observable<string> {
    return this.http
      .get<{ version: string }>('/api/consent/current')
      .pipe(map((response) => response.version));
  }
}
