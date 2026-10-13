import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CatalogService, EvaluationRow, LanguageView, MlTask } from '../../core/api/catalog.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Catégories affichées en onglets (OTHER n'a pas de sens pour un classement). */
const TASKS: readonly MlTask[] = ['ASR', 'TTS', 'INTENT', 'CONVERSATION'];

/** Seules les catégories que le serveur sait évaluer (voir EvaluationSubmissionService) ont un classement. */
const MEASURED: ReadonlySet<MlTask> = new Set<MlTask>(['ASR']);

/** Repères visuels de la barre de WER (pas une norme) : sous 20 % « bon », sous 50 % « moyen ». */
const WER_GOOD = 20;
const WER_MID = 50;

/**
 * Classement public des modèles par taux d'erreur de mots (WER), par catégorie de tâche et filtrable par langue.
 * Le filtrage par tâche se fait côté client : l'API renvoie déjà la tâche de chaque ligne.
 */
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
  protected readonly task = signal<MlTask>('ASR');

  /** Onglets avec le nombre de modèles classés dans chaque catégorie. */
  protected readonly tabs = computed(() => {
    const all = this.rows() ?? [];
    return TASKS.map((task) => ({
      task,
      count: all.filter((r) => r.task === task).length,
      measured: MEASURED.has(task),
    }));
  });

  protected readonly measured = computed(() => MEASURED.has(this.task()));

  /** Lignes de la catégorie choisie, déjà triées par le serveur (meilleur WER d'abord). */
  protected readonly visible = computed(() => (this.rows() ?? []).filter((r) => r.task === this.task()));

  protected readonly podium = computed(() => this.visible().slice(0, 3));

  ngOnInit(): void {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
    this.load();
  }

  protected setLanguage(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
    this.load();
  }

  protected setTask(task: MlTask): void {
    this.task.set(task);
  }

  protected taskKey(task: MlTask): TranslationKey {
    return `task.${task}`;
  }

  /** Largeur de la barre : le WER lui-même borné à 0–100 %, avec un minimum pour rester visible. */
  protected barWidth(wer: number): number {
    return Math.min(100, Math.max(2, wer));
  }

  protected level(wer: number): 'good' | 'mid' | 'bad' {
    if (wer < WER_GOOD) {
      return 'good';
    }
    return wer < WER_MID ? 'mid' : 'bad';
  }

  protected load(): void {
    this.failed.set(false);
    this.catalog.leaderboard(this.language()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.failed.set(true),
    });
  }
}
