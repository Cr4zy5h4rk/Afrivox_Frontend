import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api-error';
import { CatalogService, EvaluationResult, MlTask, ModelDetail, TestSetView } from '../../core/api/catalog.service';
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

  ngOnInit(): void {
    this.load();
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
}
