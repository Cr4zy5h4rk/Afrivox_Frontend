import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';

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

  /** Ajoute des phrases à une campagne (une requête par phrase, en parallèle). Renvoie le nombre ajouté. */
  addPrompts(campaignId: number, sentences: string[]): Observable<number> {
    return forkJoin(
      sentences.map((content) =>
        this.http.post('/api/prompts', { content, campaign: { id: campaignId } }),
      ),
    ).pipe(map((created) => created.length));
  }
}
