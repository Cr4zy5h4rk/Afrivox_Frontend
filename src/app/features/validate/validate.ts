import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CatalogService, LanguageView } from '../../core/api/catalog.service';
import { MyQualification, ReviewTask, ValidationService, Verdict } from '../../core/api/validation.service';
import { toApiError } from '../../core/api-error';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

type TaskState = 'idle' | 'loading' | 'ready' | 'empty' | 'failed';

/**
 * Validation par les pairs : on écoute un enregistrement, on juge l'audio, la prononciation et la transcription,
 * puis on l'accepte ou le rejette. Il faut être qualifié dans la langue (demande, puis accord de l'admin).
 */
@Component({
  selector: 'app-validate',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './validate.html',
  styleUrl: './validate.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValidatePage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly validation = inject(ValidationService);
  private readonly catalog = inject(CatalogService);

  protected readonly qualifications = signal<MyQualification[]>([]);
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  protected readonly selected = signal<string>('');
  protected readonly state = signal<TaskState>('idle');
  protected readonly task = signal<ReviewTask | null>(null);
  protected readonly audioUrl = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly reviewed = signal(0);
  protected readonly notice = signal<{ text: TranslationKey; ok: boolean } | null>(null);

  protected readonly audioOk = signal(true);
  protected readonly pronunciationOk = signal(true);
  protected readonly transcriptOk = signal(true);
  protected readonly note = signal('');
  protected readonly requestCode = signal('');

  /** Langues où je suis qualifié : les seules qu'on peut relire. */
  protected readonly qualified = computed(() => this.qualifications().filter((q) => q.status === 'QUALIFIED'));
  /** Demandes en cours ou refusées, affichées à part. */
  protected readonly others = computed(() => this.qualifications().filter((q) => q.status !== 'QUALIFIED'));
  /** Langues que je peux encore demander (aucune qualification, même refusée, n'existe pour elles). */
  protected readonly requestable = computed(() => {
    const known = new Set(this.qualifications().map((q) => q.languageCode));
    return this.languages().filter((l) => !known.has(l.code));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearAudio());
  }

  ngOnInit(): void {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.validation.qualifications().subscribe({
      next: (list) => {
        this.qualifications.set(list);
        this.loading.set(false);
        const first = list.find((q) => q.status === 'QUALIFIED');
        if (first && !this.selected()) {
          this.selected.set(first.languageCode);
          this.nextTask();
        }
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected statusKey(status: MyQualification['status']): TranslationKey {
    return `validate.status.${status}`;
  }

  protected chooseLanguage(code: string): void {
    this.selected.set(code);
    this.reviewed.set(0);
    this.nextTask();
  }

  protected requestQualification(): void {
    const code = this.requestCode();
    if (!code) return;
    this.validation.requestQualification(code).subscribe({
      next: () => {
        this.requestCode.set('');
        this.notice.set({ text: 'validate.requested', ok: true });
        this.load();
      },
      error: (err: unknown) => this.notice.set({ text: toApiError(err).key, ok: false }),
    });
  }

  /** Charge la tâche suivante et son audio. */
  protected nextTask(): void {
    const code = this.selected();
    if (!code) return;
    this.state.set('loading');
    this.task.set(null);
    this.clearAudio();
    this.audioOk.set(true);
    this.pronunciationOk.set(true);
    this.transcriptOk.set(true);
    this.note.set('');
    this.validation.next(code).subscribe({
      next: (task) => {
        if (!task) {
          this.state.set('empty');
          return;
        }
        this.task.set(task);
        this.validation.audio(task.recordingId).subscribe({
          next: (blob) => {
            this.audioUrl.set(URL.createObjectURL(blob));
            this.state.set('ready');
          },
          error: () => this.state.set('failed'),
        });
      },
      error: (err: unknown) => {
        // 403 : qualification retirée (fiabilité insuffisante) ; on recharge pour l'afficher.
        if (err instanceof HttpErrorResponse && err.status === 403) {
          this.selected.set('');
          this.state.set('idle');
          this.load();
        } else {
          this.state.set('failed');
        }
      },
    });
  }

  protected submit(verdict: Verdict): void {
    const task = this.task();
    if (!task || this.sending()) return;
    this.sending.set(true);
    this.notice.set(null);
    this.validation
      .submit({
        recordingId: task.recordingId,
        verdict,
        audioOk: this.audioOk(),
        pronunciationOk: this.pronunciationOk(),
        transcriptOk: this.transcriptOk(),
        note: this.note().trim() || null,
      })
      .subscribe({
        next: () => this.afterSubmit(true),
        // 409 : déjà tranché ou déjà relu entre-temps — rien à signaler, on passe à la suite.
        error: (err: unknown) => this.afterSubmit(err instanceof HttpErrorResponse && err.status === 409),
      });
  }

  private afterSubmit(ok: boolean): void {
    this.sending.set(false);
    if (ok) {
      this.reviewed.update((n) => n + 1);
      this.nextTask();
    } else {
      this.notice.set({ text: 'validate.sendFailed', ok: false });
    }
  }

  private clearAudio(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.audioUrl.set(null);
  }
}
