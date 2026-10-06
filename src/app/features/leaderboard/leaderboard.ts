import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CatalogService, EvaluationRow, LanguageView, MlTask } from '../../core/api/catalog.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Classement public des modèles par taux d'erreur de mots (WER), filtrable par langue. */
@Component({
  selector: 'app-leaderboard',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly catalog = inject(CatalogService);

  protected readonly rows = signal<EvaluationRow[] | null>(null);
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly language = signal('');
  protected readonly failed = signal(false);

  ngOnInit(): void {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
    this.load();
  }

  protected setLanguage(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
    this.load();
  }

  protected taskKey(task: MlTask): TranslationKey {
    return `task.${task}`;
  }

  protected load(): void {
    this.failed.set(false);
    this.catalog.leaderboard(this.language()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.failed.set(true),
    });
  }
}
