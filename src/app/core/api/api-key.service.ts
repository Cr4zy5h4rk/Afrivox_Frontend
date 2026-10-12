import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Ce qu'une clé a le droit de faire (les mêmes noms que le serveur). */
export type ApiKeyScope = 'DOWNLOAD' | 'EVALUATE' | 'PUBLISH';

export const API_KEY_SCOPES: readonly ApiKeyScope[] = ['DOWNLOAD', 'EVALUATE', 'PUBLISH'];

/** Une de mes clés. Le secret n'est jamais renvoyé ici : il n'apparaît qu'à la création. */
export interface ApiKeyInfo {
  id: number;
  name: string;
  /** 12 premiers caractères : permet de reconnaître la clé sans la révéler. */
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  active: boolean;
}

export interface CreatedApiKey {
  key: ApiKeyInfo;
  /** Clé complète, à copier tout de suite : elle ne sera plus affichée. */
  secret: string;
}

/** Mes clés d'API (session de navigateur uniquement : une clé ne gère pas les clés). */
@Injectable({ providedIn: 'root' })
export class ApiKeyService {
  private readonly http = inject(HttpClient);

  mine(): Observable<ApiKeyInfo[]> {
    return this.http.get<ApiKeyInfo[]>('/api/me/api-keys');
  }

  create(name: string, scopes: ApiKeyScope[], expiresInDays: number | null): Observable<CreatedApiKey> {
    return this.http.post<CreatedApiKey>('/api/me/api-keys', { name, scopes, expiresInDays });
  }

  revoke(id: number): Observable<void> {
    return this.http.delete<void>(`/api/me/api-keys/${id}`);
  }
}
