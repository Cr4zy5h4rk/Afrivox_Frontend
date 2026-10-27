import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type NotificationType =
  | 'MODEL_COMMENT'
  | 'COMMENT_REPLY'
  | 'PROJECT_COMMENT'
  | 'PROJECT_REPLY'
  | 'CONTACT_REQUEST'
  | 'CONTACT_ACCEPTED';
export type ReportReason = 'SPAM' | 'ABUSE' | 'OFF_TOPIC' | 'OTHER';

export interface NotificationView {
  id: number;
  type: NotificationType;
  actorName: string | null;
  modelId: number | null;
  modelName: string | null;
  projectId: number | null;
  projectName: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationList {
  items: NotificationView[];
  unread: number;
}

/** Un commentaire signalé, tel que la file de modération l'affiche. */
export interface ReportedComment {
  commentId: number;
  /** Un commentaire porte sur un modèle ou sur un projet : l'un des deux est renseigné. */
  modelId: number | null;
  modelName: string | null;
  projectId: number | null;
  projectName: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  reports: number;
  reasons: ReportReason[];
  details: string[];
}

/** Notifications de la communauté et signalements (voir ModelCommentResource côté serveur). */
@Injectable({ providedIn: 'root' })
export class CommunityService {
  private readonly http = inject(HttpClient);

  notifications(): Observable<NotificationList> {
    return this.http.get<NotificationList>('/api/community/notifications');
  }

  unreadCount(): Observable<{ unread: number }> {
    return this.http.get<{ unread: number }>('/api/community/notifications/unread-count');
  }

  readAll(): Observable<void> {
    return this.http.post<void>('/api/community/notifications/read-all', {});
  }

  report(commentId: number, reason: ReportReason, details: string): Observable<void> {
    return this.http.post<void>(`/api/community/comments/${commentId}/report`, { reason, details });
  }

  // ---- Modération (admin) ----

  reportedComments(): Observable<ReportedComment[]> {
    return this.http.get<ReportedComment[]>('/api/admin/comment-reports');
  }

  dismissReports(commentId: number): Observable<void> {
    return this.http.post<void>(`/api/admin/comment-reports/${commentId}/dismiss`, {});
  }
}
