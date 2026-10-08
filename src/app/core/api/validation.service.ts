import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export type QualificationStatus = 'PENDING' | 'QUALIFIED' | 'REVOKED';
export type Verdict = 'ACCEPT' | 'REJECT';

export interface MyQualification {
  id: number;
  languageCode: string;
  languageName: string;
  status: QualificationStatus;
  /** Part de bonnes réponses aux tâches pièges (sur 100), absente tant qu'aucune n'a été rencontrée. */
  score: number | null;
}

/** Une tâche de relecture. Rien n'indique s'il s'agit d'un piège : le validateur ne doit pas le savoir. */
export interface ReviewTask {
  recordingId: number;
  sentence: string;
  durationMs: number | null;
}

export interface NewReview {
  recordingId: number;
  verdict: Verdict;
  audioOk: boolean;
  pronunciationOk: boolean;
  transcriptOk: boolean;
  note: string | null;
}

export interface PendingQualification {
  id: number;
  displayName: string | null;
  languageCode: string;
  languageName: string;
}

/** Espace du validateur (côté contributeur) et décisions de qualification (côté admin). */
@Injectable({ providedIn: 'root' })
export class ValidationService {
  private readonly http = inject(HttpClient);

  qualifications(): Observable<MyQualification[]> {
    return this.http.get<MyQualification[]>('/api/me/validation/qualifications');
  }

  requestQualification(languageCode: string): Observable<MyQualification> {
    return this.http.post<MyQualification>('/api/me/validation/qualifications', { languageCode });
  }

  /** Prochaine tâche, ou `null` quand il n'y a plus rien à relire dans cette langue (204). */
  next(languageCode: string): Observable<ReviewTask | null> {
    return this.http
      .get<ReviewTask>('/api/me/validation/next', { params: { language: languageCode }, observe: 'response' })
      .pipe(map((response) => response.body));
  }

  /** L'audio passe par l'API (jeton d'accès requis) : on le récupère en blob pour le lire dans la page. */
  audio(recordingId: number): Observable<Blob> {
    return this.http.get(`/api/me/validation/audio/${recordingId}`, { responseType: 'blob' });
  }

  submit(review: NewReview): Observable<void> {
    return this.http.post<void>('/api/me/validation/reviews', review);
  }

  pending(): Observable<PendingQualification[]> {
    return this.http.get<PendingQualification[]>('/api/admin/validation/qualifications');
  }

  decide(id: number, approve: boolean): Observable<void> {
    return this.http.post<void>(`/api/admin/validation/qualifications/${id}/decision`, { approve });
  }
}
