import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CatalogService, DatasetDetail } from '../../core/api/catalog.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Fiche d'un dataset : description, versions publiées, détails et appel à contribuer. */
@Component({
  selector: 'app-dataset-detail',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './dataset-detail.html',
  styleUrl: './dataset-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetDetailPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);

  /** Paramètre de route `:slug` (withComponentInputBinding). */
  readonly slug = input.required<string>();

  protected readonly detail = signal<DatasetDetail | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'notfound' | 'failed'>('loading');

  ngOnInit(): void {
    this.catalog.dataset(this.slug()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.state.set('ready');
      },
      error: (error: unknown) =>
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'failed'),
    });
  }

  protected licenseKey(license: string): TranslationKey {
    return `license.${license}` as TranslationKey;
  }

  protected planKey(plan: string): TranslationKey {
    return `plan.${plan}` as TranslationKey;
  }
}
