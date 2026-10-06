import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatasetSummary } from '../api/catalog.service';
import { I18nService } from '../i18n/i18n.service';
import { TranslationKey } from '../i18n/translations';

/** Carte de dataset (catalogue et accueil). Les chiffres affichés viennent du serveur, jamais d'ici. */
@Component({
  selector: 'app-dataset-card',
  imports: [RouterLink],
  template: `
    @let d = dataset();
    <a class="card card-link" [routerLink]="['/datasets', d.slug]">
      <div class="row">
        @if (d.languageName) {
          <span class="badge">{{ d.languageName }}</span>
        }
        <span class="badge" [class.green]="d.published" [class.gold]="!d.published">
          {{ i18n.t(d.published ? 'dataset.status.published' : 'dataset.status.collecting') }}
        </span>
        <span class="badge gray plan">{{ i18n.t(planKey()) }}</span>
      </div>
      <h3>{{ d.title }}</h3>
      @if (d.description) {
        <p class="desc">{{ d.description }}</p>
      }
      <ul class="meta">
        @if (d.latestVersion; as v) {
          @if (v.hours !== null) {
            <li>{{ i18n.t('dataset.hours', { n: i18n.n(v.hours, 1) }) }}</li>
          }
          @if (v.speakers !== null) {
            <li>{{ i18n.t('dataset.speakers', { n: i18n.n(v.speakers) }) }}</li>
          }
          @if (v.qualityScore !== null) {
            <li>{{ i18n.t('dataset.quality', { n: i18n.n(v.qualityScore) }) }}</li>
          }
        } @else {
          <li>{{ i18n.t('dataset.validatedRecordings', { count: i18n.n(d.validatedRecordings) }) }}</li>
          <li>{{ i18n.t('dataset.validatedHours', { hours: i18n.n(d.validatedHours, 1) }) }}</li>
        }
      </ul>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }

    .card-link {
      block-size: 100%;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .plan {
      margin-inline-start: auto;
    }

    h3 {
      margin: 0.25rem 0 0;
    }

    .desc {
      margin: 0;
      color: var(--afv-muted);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 1rem;
      list-style: none;
      margin: auto 0 0;
      padding: 0.75rem 0 0;
      border-block-start: 1px solid var(--afv-line);
      font-size: 0.88rem;
      color: var(--afv-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetCard {
  protected readonly i18n = inject(I18nService);
  readonly dataset = input.required<DatasetSummary>();

  protected planKey(): TranslationKey {
    return `plan.${this.dataset().plan}`;
  }
}
