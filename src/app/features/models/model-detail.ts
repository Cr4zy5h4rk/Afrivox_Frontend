import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api-error';
import {
  CatalogService,
  EvaluationResult,
  MlTask,
  ModelCommentView,
  ModelDetail,
  TestSetView,
} from '../../core/api/catalog.service';
import { CommunityService, ReportReason } from '../../core/api/community.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Fiche d'un modèle : description, lien, dataset d'entraînement et évaluations. */
@Component({
  selector: 'app-model-detail',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './model-detail.html',
  styleUrl: './model-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetailPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly catalog = inject(CatalogService);
  protected readonly auth = inject(AuthService);
  private readonly community = inject(CommunityService);

  /** Paramètre de route `:id` (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly detail = signal<ModelDetail | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'notfound' | 'failed'>('loading');

  // ---- Envoi de prédictions pour le classement ----
  protected readonly testSets = signal<TestSetView[]>([]);
  protected readonly testSetId = signal<number | null>(null);
  protected readonly file = signal<File | null>(null);
  protected readonly sending = signal(false);
  protected readonly submitError = signal<ApiError | null>(null);
  protected readonly result = signal<EvaluationResult | null>(null);

  /** Le bloc d'envoi n'est proposé qu'aux développeurs et à l'admin ; le serveur vérifie que le modèle est le leur. */
  protected canEvaluate(): boolean {
    return this.auth.hasRole('ROLE_DEVELOPER') || this.auth.hasRole('ROLE_ADMIN');
  }

  protected pickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.item(0) ?? null);
  }

  protected submit(): void {
    const testSetId = this.testSetId();
    const file = this.file();
    const model = this.detail()?.model;
    if (testSetId === null || file === null || !model || this.sending()) return;
    this.sending.set(true);
    this.submitError.set(null);
    this.result.set(null);
    this.catalog.submitPredictions(model.id, testSetId, file).subscribe({
      next: (r) => {
        this.result.set(r);
        this.sending.set(false);
        this.load(); // l'historique et le meilleur score de la fiche se mettent à jour
      },
      error: (err: unknown) => {
        this.submitError.set(toApiError(err));
        this.sending.set(false);
      },
    });
  }

  // ---- Communauté (commentaires) ----
  protected readonly comments = signal<ModelCommentView[]>([]);
  protected readonly commentTotal = signal(0);
  protected readonly commentPages = signal(0);
  private commentPage = 0;
  protected readonly commentText = signal('');
  protected readonly posting = signal(false);
  protected readonly commentError = signal<ApiError | null>(null);

  protected readonly hasMoreComments = computed(() => this.commentPage + 1 < this.commentPages());

  private loadComments(reset: boolean): void {
    const id = Number(this.id());
    if (!Number.isInteger(id)) return;
    const page = reset ? 0 : this.commentPage + 1;
    this.catalog.comments(id, page).subscribe({
      next: (p) => {
        this.comments.update((list) => (reset ? p.items : [...list, ...p.items]));
        this.commentPage = p.page;
        this.commentPages.set(p.pages);
        this.commentTotal.set(p.totalWithReplies);
      },
      error: () => undefined, // la section reste vide : le reste de la fiche fonctionne sans elle
    });
  }

  protected moreComments(): void {
    this.loadComments(false);
  }

  protected postComment(): void {
    const model = this.detail()?.model;
    const body = this.commentText().trim();
    if (!model || body === '' || this.posting()) return;
    this.posting.set(true);
    this.commentError.set(null);
    this.catalog.addComment(model.id, body).subscribe({
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
    const model = this.detail()?.model;
    const parentId = this.replyingTo();
    const body = this.replyText().trim();
    if (!model || parentId === null || body === '' || this.posting()) return;
    this.posting.set(true);
    this.replyError.set(null);
    this.catalog.addComment(model.id, body, parentId).subscribe({
      next: () => {
        this.posting.set(false);
        this.replyingTo.set(null);
        this.loadCommentsKeepingPages();
      },
      error: (err: unknown) => {
        this.replyError.set(toApiError(err));
        this.posting.set(false);
      },
    });
  }

  /** Recharge la première page (les réponses y sont jointes) après une écriture ou une suppression. */
  private loadCommentsKeepingPages(): void {
    this.loadComments(true);
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

  ngOnInit(): void {
    this.load();
    this.loadComments(true);
  }

  private load(): void {
    const id = Number(this.id());
    if (!Number.isInteger(id)) {
      this.state.set('notfound');
      return;
    }
    this.catalog.model(id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.state.set('ready');
        if (this.canEvaluate() && detail.model.task === 'ASR' && this.testSets().length === 0) {
          // Jeux de test de la langue du modèle (tous si le modèle est multilingue)
          this.catalog.testSets(detail.model.languageCode ?? undefined).subscribe({
            next: (sets) => {
              this.testSets.set(sets);
              if (this.testSetId() === null && sets.length > 0) this.testSetId.set(sets[0].versionId);
            },
            error: () => undefined,
          });
        }
      },
      error: (error: unknown) =>
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'failed'),
    });
  }

  protected taskKey(task: MlTask): TranslationKey {
    return `task.${task}`;
  }

  /** Libellé d'un usage (prototype, recherche, commercial). */
  protected usageKey(usage: 'PROTOTYPE' | 'RESEARCH' | 'COMMERCIAL'): TranslationKey {
    return `license.${usage}`;
  }
}
