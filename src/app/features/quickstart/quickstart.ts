import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';

/** Commandes d'une étape, dans les deux manières de faire : ligne de commande Python et appel HTTP direct. */
interface Snippet {
  readonly titleKey: 'quickstart.cli' | 'quickstart.http';
  readonly code: string;
}

/**
 * Démarrage rapide pour les développeurs : du compte à la publication d'un modèle, avec des commandes à copier.
 * Page publique et statique : les exemples utilisent l'adresse du site et des emplacements (`<…>`) à remplacer,
 * jamais de vraie clé.
 */
@Component({
  selector: 'app-quickstart',
  imports: [RouterLink, MatButtonModule],
  templateUrl: './quickstart.html',
  styleUrl: './quickstart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickstartPage {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);

  /** Dernier bloc copié (pour confirmer le geste), remis à zéro après quelques secondes. */
  protected readonly copied = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly host = typeof location === 'undefined' ? 'https://exemple.org' : location.origin;

  protected readonly install = 'pip install ./clients/python';

  protected readonly setup = computed(() =>
    [
      `export AFRIVOX_URL=${this.host}`,
      'export AFRIVOX_API_KEY=afv_XXXXXXXX_…   # ' + this.i18n.t('quickstart.setup.keyNote'),
    ].join('\n'),
  );

  protected readonly download = computed<Snippet[]>(() => [
    {
      titleKey: 'quickstart.cli',
      code: ['afrivox purchases', 'afrivox download <dataset>@1.0 --extract -o data'].join('\n'),
    },
    {
      titleKey: 'quickstart.http',
      code: [
        `curl -H "X-API-Key: $AFRIVOX_API_KEY" ${this.host}/api/me/purchases`,
        `curl -X POST -H "X-API-Key: $AFRIVOX_API_KEY" ${this.host}/api/purchases/<ID_ACHAT>/download-link`,
      ].join('\n'),
    },
  ]);

  protected readonly evaluate = computed<Snippet[]>(() => [
    {
      titleKey: 'quickstart.cli',
      code: [
        'afrivox testsets --language wo',
        'afrivox template <ID_JEU_DE_TEST> -o predictions.csv',
        '# … remplir la colonne text avec les prédictions du modèle …',
        'afrivox submit <ID_MODELE> <ID_JEU_DE_TEST> predictions.csv',
      ].join('\n'),
    },
    {
      titleKey: 'quickstart.http',
      code: [
        `curl -H "X-API-Key: $AFRIVOX_API_KEY" -F testSetId=<ID_JEU_DE_TEST> -F file=@predictions.csv \\`,
        `  ${this.host}/api/me/models/<ID_MODELE>/evaluations`,
      ].join('\n'),
    },
  ]);

  protected readonly publish = computed<Snippet[]>(() => [
    {
      titleKey: 'quickstart.cli',
      code: [
        'afrivox publish --name mon-asr --task ASR \\',
        '  --url https://huggingface.co/moi/mon-asr \\',
        '  --license CC-BY-NC-4.0 --language wo \\',
        '  --trained-on <ID_VERSION> --usage RESEARCH',
      ].join('\n'),
    },
    {
      titleKey: 'quickstart.http',
      code: [
        `curl -X POST -H "X-API-Key: $AFRIVOX_API_KEY" -H "Content-Type: application/json" \\`,
        `  ${this.host}/api/me/models -d '{"name":"mon-asr","task":"ASR","license":"CC-BY-NC-4.0",`,
        `  "trainedOnVersionId":<ID_VERSION>,"usage":"RESEARCH"}'`,
      ].join('\n'),
    },
  ]);

  protected readonly python = [
    'from afrivox import Client',
    '',
    `c = Client("${this.host}", api_key="afv_…")`,
    'purchase = c.find_purchase("<dataset>@1.0")',
    'link = c.download_link(purchase["id"])',
    'c.download(link["url"], "data/")',
  ].join('\n');

  protected async copy(id: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(id);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.copied.set(null), 2500);
    } catch {
      this.copied.set(null);
    }
  }
}
