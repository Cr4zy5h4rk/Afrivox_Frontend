import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ModelSummary } from '../api/catalog.service';
import { I18nService } from '../i18n/i18n.service';
import { TranslationKey } from '../i18n/translations';

/** Carte de modèle du Model Hub. */
@Component({
  selector: 'app-model-card',
  imports: [RouterLink],
  template: `
    @let m = model();
    <a class="card card-link" [routerLink]="['/models', m.id]">
      <div class="row">
        <span class="badge accent">{{ i18n.t(taskKey()) }}</span>
        @if (m.languageName) {
          <span class="badge">{{ m.languageName }}</span>
        }
      </div>
      <h3>{{ m.name }}</h3>
      @if (m.description) {
        <p class="desc">{{ m.description }}</p>
      }
      <ul class="meta">
        @if (m.bestWer !== null) {
          <li>
            <strong>{{ i18n.t('model.bestWer') }}</strong> {{ i18n.n(m.bestWer, 1) }} %
          </li>
        }
        @if (m.license) {
          <li>{{ m.license }}</li>
        }
        @if (m.ownerName) {
          <li>{{ i18n.t('model.by', { name: m.ownerName }) }}</li>
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

    h3 {
      margin: 0.25rem 0 0;
      overflow-wrap: anywhere;
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
export class ModelCard {
  protected readonly i18n = inject(I18nService);
  readonly model = input.required<ModelSummary>();

  protected taskKey(): TranslationKey {
    return `task.${this.model().task}`;
  }
}
