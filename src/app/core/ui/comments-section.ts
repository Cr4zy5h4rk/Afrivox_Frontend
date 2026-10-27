import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiError, toApiError } from '../api-error';
import { CatalogService, ModelCommentPage, ModelCommentView } from '../api/catalog.service';
import { CommunityService, ReportReason } from '../api/community.service';
import { HubService } from '../api/hub.service';
import { AuthService } from '../auth/auth.service';
import { I18nService } from '../i18n/i18n.service';
import { TranslationKey } from '../i18n/translations';

/**
 * Discussion publique d'un modèle ou d'un projet : commentaires lisibles sans compte, écrits par tout compte connecté,
 * un seul niveau de réponses, signalement et suppression. Le texte est affiché comme du texte (jamais comme du HTML).
 */
@Component({
  selector: 'app-comments-section',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './comments-section.html',
  styleUrl: './comments-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentsSection implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly hub = inject(HubService);
  private readonly community = inject(CommunityService);

  readonly kind = input.required<'model' | 'project'>();
  readonly targetId = input.required<number>();
  /** Adresse où revenir après connexion. */
  readonly returnUrl = input.required<string>();

  protected readonly introKey = computed<TranslationKey>(() =>
    this.kind() === 'model' ? 'community.intro' : 'community.introProject',
  );

  protected readonly comments = signal<ModelCommentView[]>([]);
  protected readonly commentTotal = signal(0);
  protected readonly commentPages = signal(0);
  private commentPage = 0;
  protected readonly commentText = signal('');
  protected readonly posting = signal(false);
  protected readonly commentError = signal<ApiError | null>(null);

  protected readonly hasMoreComments = computed(() => this.commentPage + 1 < this.commentPages());

  ngOnInit(): void {
    this.loadComments(true);
  }

  private fetchPage(page: number): Observable<ModelCommentPage> {
    return this.kind() === 'model'
      ? this.catalog.comments(this.targetId(), page)
      : this.hub.projectComments(this.targetId(), page);
  }

  private send(body: string, parentId: number | null): Observable<ModelCommentView> {
    return this.kind() === 'model'
      ? this.catalog.addComment(this.targetId(), body, parentId)
      : this.hub.addProjectComment(this.targetId(), body, parentId);
  }

  private loadComments(reset: boolean): void {
    const page = reset ? 0 : this.commentPage + 1;
    this.fetchPage(page).subscribe({
      next: (p) => {
        this.comments.update((list) => (reset ? p.items : [...list, ...p.items]));
        this.commentPage = p.page;
        this.commentPages.set(p.pages);
        this.commentTotal.set(p.totalWithReplies);
      },
      error: () => undefined, // la section reste vide : le reste de la page fonctionne sans elle
    });
  }

  protected moreComments(): void {
    this.loadComments(false);
  }

  protected postComment(): void {
    const body = this.commentText().trim();
    if (body === '' || this.posting()) return;
    this.posting.set(true);
    this.commentError.set(null);
    this.send(body, null).subscribe({
      next: () => {
        this.commentText.set('');
        this.posting.set(false);
        this.loadComments(true);
      },
      error: (err: unknown) => {
        this.commentError.set(toApiError(err));
        this.posting.set(false);
      },
    });
  }

  // ---- Réponses ----
  /** Commentaire de premier niveau auquel on est en train de répondre (un seul formulaire ouvert à la fois). */
  protected readonly replyingTo = signal<number | null>(null);
  protected readonly replyText = signal('');
  protected readonly replyError = signal<ApiError | null>(null);

  protected startReply(comment: ModelCommentView): void {
    this.reportingId.set(null);
    this.replyingTo.set(comment.id);
    this.replyText.set('');
    this.replyError.set(null);
  }

  protected cancelReply(): void {
    this.replyingTo.set(null);
  }

  protected sendReply(): void {
    const parentId = this.replyingTo();
    const body = this.replyText().trim();
    if (parentId === null || body === '' || this.posting()) return;
    this.posting.set(true);
    this.replyError.set(null);
    this.send(body, parentId).subscribe({
      next: () => {
        this.posting.set(false);
        this.replyingTo.set(null);
        this.loadComments(true); // les réponses sont jointes à la première page
      },
      error: (err: unknown) => {
        this.replyError.set(toApiError(err));
        this.posting.set(false);
      },
    });
  }

  // ---- Signalement ----
  protected readonly reasons: ReportReason[] = ['SPAM', 'ABUSE', 'OFF_TOPIC', 'OTHER'];
  protected readonly reportingId = signal<number | null>(null);
  protected readonly reportReason = signal<ReportReason>('SPAM');
  protected readonly reportDetails = signal('');
  protected readonly reportError = signal<ApiError | null>(null);
  /** Commentaires déjà signalés pendant cette visite (le serveur refuse un second signalement de toute façon). */
  protected readonly reported = signal<ReadonlySet<number>>(new Set());

  protected reasonKey(reason: ReportReason): TranslationKey {
    return `report.${reason}` as TranslationKey;
  }

  protected startReport(comment: ModelCommentView): void {
    this.replyingTo.set(null);
    this.reportingId.set(comment.id);
    this.reportReason.set('SPAM');
    this.reportDetails.set('');
    this.reportError.set(null);
  }

  protected cancelReport(): void {
    this.reportingId.set(null);
  }

  protected sendReport(): void {
    const id = this.reportingId();
    if (id === null) return;
    this.community.report(id, this.reportReason(), this.reportDetails().trim()).subscribe({
      next: () => {
        this.reported.update((set) => new Set(set).add(id));
        this.reportingId.set(null);
      },
      error: (err: unknown) => {
        const apiError = toApiError(err);
        this.reportError.set(apiError);
        // Déjà signalé : on le marque comme tel plutôt que de laisser le formulaire ouvert.
        if (apiError.key === 'error.alreadyreported') {
          this.reported.update((set) => new Set(set).add(id));
          this.reportingId.set(null);
        }
      },
    });
  }

  protected removeComment(comment: ModelCommentView): void {
    if (!window.confirm(this.i18n.t('community.deleteConfirm'))) return;
    this.catalog.deleteComment(comment.id).subscribe({
      next: () => this.loadComments(true),
      error: () => undefined,
    });
  }
}
