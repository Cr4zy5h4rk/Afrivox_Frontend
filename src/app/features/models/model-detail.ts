import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CatalogService, MlTask, ModelDetail } from '../../core/api/catalog.service';
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

  /** Paramètre de route `:id` (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly detail = signal<ModelDetail | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'notfound' | 'failed'>('loading');

  ngOnInit(): void {
    const id = Number(this.id());
    if (!Number.isInteger(id)) {
      this.state.set('notfound');
      return;
    }
    this.catalog.model(id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.state.set('ready');
      },
      error: (error: unknown) =>
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'failed'),
    });
  }

  protected taskKey(task: MlTask): TranslationKey {
    return `task.${task}`;
  }
}
