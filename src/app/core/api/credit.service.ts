import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/** Ce que rapporte un tarif : un enregistrement validé, un avis concordant, une tâche piège réussie. */
export type CreditRateKind = 'VALIDATED_RECORDING' | 'REVIEW_AGREED' | 'TRAP_CORRECT';

export const CREDIT_RATE_KINDS: readonly CreditRateKind[] = ['VALIDATED_RECORDING', 'REVIEW_AGREED', 'TRAP_CORRECT'];

export type CreditReason =
  | 'RECORDING_VALIDATED'
  | 'REVIEW_DONE'
  | 'TRAP_CORRECT'
  | 'ROYALTY'
  | 'PURCHASE'
  | 'ADJUSTMENT';

/** Plafond d'un tarif (identique au serveur, qui reste l'autorité). */
export const MAX_CREDIT_RATE = 1000;

/** Solde et gains par source, calculés par le serveur à partir du registre. */
export interface CreditSummary {
  balance: number;
  earnedFromRecordings: number;
  earnedFromReviews: number;
  rates: Record<CreditRateKind, number>;
}

export interface CreditTransaction {
  id: number;
  amount: number;
  reason: CreditReason;
  createdAt: string;
  recordingId: number | null;
  note: string | null;
}

export interface CreditRate {
  kind: CreditRateKind;
  amount: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CreditRateChange {
  id: number;
  /** `GLOBAL` ou `CAMPAIGN:<id>`. */
  scope: string;
  kind: CreditRateKind;
  oldAmount: number | null;
  newAmount: number | null;
  changedBy: string | null;
  changedAt: string;
}

/** Tarifs propres à une campagne (`null` = tarif global). */
export interface CampaignCreditRates {
  validatedRecording: number | null;
  reviewAgreed: number | null;
  trapCorrect: number | null;
}

export interface CreditPage<T> {
  items: T[];
  total: number;
}

/** Crédits : solde et historique du contributeur (`/api/me/credits`), tarifs et ajustements de l'admin. */
@Injectable({ providedIn: 'root' })
export class CreditService {
  private readonly http = inject(HttpClient);

  summary(): Observable<CreditSummary> {
    return this.http.get<CreditSummary>('/api/me/credits');
  }

  history(page: number, size: number): Observable<CreditPage<CreditTransaction>> {
    return this.paged<CreditTransaction>('/api/me/credits/history', page, size);
  }

  // ---- Administration (réservé à ROLE_ADMIN côté serveur) ----

  rates(): Observable<CreditRate[]> {
    return this.http.get<CreditRate[]>('/api/admin/credits/rates');
  }

  updateRates(amounts: Record<CreditRateKind, number>): Observable<CreditRate[]> {
    return this.http.put<CreditRate[]>('/api/admin/credits/rates', amounts);
  }

  rateHistory(page: number, size: number): Observable<CreditPage<CreditRateChange>> {
    return this.paged<CreditRateChange>('/api/admin/credits/rates/history', page, size);
  }

  /** Remplace les trois tarifs d'une campagne ; une valeur `null` ramène au tarif global. */
  setCampaignRates(campaignId: number, rates: CampaignCreditRates): Observable<unknown> {
    return this.http.put(`/api/admin/credits/campaigns/${campaignId}`, rates);
  }

  /** Correction manuelle du solde d'un compte (motif obligatoire, solde jamais négatif). */
  adjust(login: string, amount: number, note: string): Observable<CreditTransaction> {
    return this.http.post<CreditTransaction>('/api/admin/credits/adjust', { login, amount, note });
  }

  private paged<T>(url: string, page: number, size: number): Observable<CreditPage<T>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<T[]>(url, { params, observe: 'response' }).pipe(
      map((response) => ({
        items: response.body ?? [],
        total: Number(response.headers.get('X-Total-Count') ?? response.body?.length ?? 0),
      })),
    );
  }
}
