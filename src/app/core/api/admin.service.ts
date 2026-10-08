import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, forkJoin, from, map, of, reduce } from 'rxjs';

/** Requêtes envoyées en même temps lors de l'ajout de phrases. */
const PARALLEL_REQUESTS = 10;

export type RequestStatus =
  | 'RECEIVED'
  | 'IN_REVIEW'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'COLLECTING'
  | 'DELIVERED'
  | 'REJECTED';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type CampaignKind = 'OPEN' | 'SPONSORED' | 'PRIVATE';

/** Ordre du parcours d'une demande ; REJECTED est possible à tout moment. */
export const REQUEST_FLOW: readonly RequestStatus[] = [
  'RECEIVED',
  'IN_REVIEW',
  'QUOTED',
  'ACCEPTED',
  'COLLECTING',
  'DELIVERED',
];

export interface AdminLanguage {
  id: number;
  code: string;
  name: string;
}

export interface AdminRequest {
  id: number;
  orgName: string;
  sector: string;
  hours: number;
  speakersTarget: number | null;
  conversationType: string | null;
  usageKind: string;
  deadline: string | null;
  description: string | null;
  status: RequestStatus;
  quoteAmountFcfa: number | null;
  createdAt: string;
  language: AdminLanguage | null;
}

export interface AdminCampaign {
  id: number;
  title: string;
  description: string | null;
  domain: string | null;
  kind: CampaignKind;
  status: CampaignStatus;
  targetSentences: number | null;
  createdAt: string;
  language: AdminLanguage | null;
}

export interface NewCampaign {
  title: string;
  description: string;
  domain: string;
  kind: CampaignKind;
  targetSentences: number | null;
  languageId: number;
}

/**
 * Appels de l'espace d'administration. Ils s'appuient sur le CRUD généré côté serveur,
 * réservé à ROLE_ADMIN (SecurityConfiguration) : un non-admin recevrait 403.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  requests(): Observable<AdminRequest[]> {
    return this.http
      .get<AdminRequest[]>('/api/dataset-requests')
      .pipe(map((list) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  }

  /** Mise à jour partielle (PATCH) : seuls le statut et le montant du devis changent. */
  updateRequest(
    id: number,
    change: { status: RequestStatus; quoteAmountFcfa?: number | null },
  ): Observable<AdminRequest> {
    return this.http.patch<AdminRequest>(`/api/dataset-requests/${id}`, { id, ...change });
  }

  languages(): Observable<AdminLanguage[]> {
    return this.http.get<AdminLanguage[]>('/api/languages');
  }

  campaigns(): Observable<AdminCampaign[]> {
    return this.http
      .get<AdminCampaign[]>('/api/campaigns')
      .pipe(map((list) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  }

  /** Une nouvelle campagne naît en brouillon : elle n'est visible des contributeurs qu'une fois activée. */
  createCampaign(input: NewCampaign): Observable<AdminCampaign> {
    return this.http.post<AdminCampaign>('/api/campaigns', {
      title: input.title,
      description: input.description || null,
      domain: input.domain || null,
      kind: input.kind,
      status: 'DRAFT' satisfies CampaignStatus,
      targetSentences: input.targetSentences,
      createdAt: new Date().toISOString(),
      language: { id: input.languageId },
    });
  }

  setCampaignStatus(id: number, status: CampaignStatus): Observable<AdminCampaign> {
    return this.http.patch<AdminCampaign>(`/api/campaigns/${id}`, { id, status });
  }

  /**
   * Ajoute des phrases à une campagne, par lots de 10 requêtes en parallèle.
   * Renvoie les phrases **qui ont échoué** (liste vide = tout est passé) : l'appelant peut ainsi
   * les proposer à nouveau sans recréer de doublons parmi celles déjà enregistrées.
   */
  addPrompts(campaignId: number, sentences: string[]): Observable<string[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < sentences.length; i += PARALLEL_REQUESTS) {
      chunks.push(sentences.slice(i, i + PARALLEL_REQUESTS));
    }
    return from(chunks).pipe(
      concatMap((chunk) =>
        forkJoin(
          chunk.map((content) =>
            this.http.post('/api/prompts', { content, campaign: { id: campaignId } }).pipe(
              map(() => null),
              catchError(() => of(content)),
            ),
          ),
        ),
      ),
      reduce(
        (failed: string[], results) => failed.concat(results.filter((r): r is string => r !== null)),
        [],
      ),
    );
  }

  languageOverview(): Observable<AdminLanguageOverview[]> {
    return this.http.get<AdminLanguageOverview[]>('/api/admin/languages');
  }

  /** Une nouvelle langue commence toujours en liste d'attente : elle s'active quand le seuil est atteint. */
  createLanguage(input: NewLanguage): Observable<unknown> {
    return this.http.post('/api/languages', {
      code: input.code,
      name: input.name,
      dialect: input.dialect || null,
      script: input.script,
      direction: input.direction,
      status: 'WAITLIST' satisfies LanguageStatus,
      minValidators: input.minValidators,
    });
  }

  updateLanguage(
    id: number,
    change: { status?: LanguageStatus; minValidators?: number },
  ): Observable<unknown> {
    return this.http.patch(`/api/languages/${id}`, { id, ...change });
  }
}

export type ScriptKind = 'LATIN' | 'ARABIC' | 'NKO' | 'OTHER';
export type TextDirection = 'LTR' | 'RTL';
export type LanguageStatus = 'WAITLIST' | 'ACTIVE';

/** Une langue avec sa progression vers le seuil d'activation (calculée par le serveur). */
export interface AdminLanguageOverview {
  id: number;
  code: string;
  name: string;
  dialect: string | null;
  script: ScriptKind;
  direction: TextDirection;
  status: LanguageStatus;
  minValidators: number;
  qualifiedValidators: number;
  pendingValidators: number;
  recordingsSubmitted: number;
  recordingsValidated: number;
}

export interface NewLanguage {
  code: string;
  name: string;
  dialect: string;
  script: ScriptKind;
  direction: TextDirection;
  minValidators: number;
}
