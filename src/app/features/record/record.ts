import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { CatalogService, LanguageView } from '../../core/api/catalog.service';
import {
  AgeRange,
  CampaignView,
  ContributionService,
  ContributorProfile,
  Gender,
  PromptView,
  TrialView,
} from '../../core/api/contribution.service';
import { toApiError } from '../../core/api-error';
import { AudioRecorder, RecordedClip, RecorderError } from '../../core/audio/audio-recorder';
import { OutboxService } from '../../core/audio/outbox.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

type Phase =
  | 'loading'
  | 'failed'
  | 'consent'
  | 'profile'
  | 'blocked'
  | 'empty'
  | 'pick'
  | 'ready'
  | 'recording'
  | 'review'
  | 'sending'
  | 'done';

interface Notice {
  kind: 'info' | 'error' | 'success';
  key: TranslationKey;
  params?: Record<string, string | number>;
}

/** Limites alignées sur le serveur (application.audio.*) : 0,5 à 30 s. On exige 1 s côté interface. */
const MIN_MS = 1000;
const MAX_MS = 30_000;
/** Nombre de phrases demandées à la fois au serveur. */
const BATCH = 10;

const MIC_ERRORS: Record<string, TranslationKey> = {
  denied: 'record.mic.denied',
  unavailable: 'record.mic.unavailable',
  insecure: 'record.mic.insecure',
  unsupported: 'record.unsupported',
};

/**
 * Écran d'enregistrement : consentement, choix de la campagne, puis boucle « lire la phrase, enregistrer, réécouter,
 * envoyer ». Sans réseau, l'audio est gardé dans la file hors ligne (voir OutboxService).
 */
@Component({
  selector: 'app-record',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './record.html',
  styleUrl: './record.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordPage implements OnInit, OnDestroy {
  protected readonly i18n = inject(I18nService);
  protected readonly outbox = inject(OutboxService);
  private readonly api = inject(ContributionService);
  private readonly catalog = inject(CatalogService);

  /** Questionnaire facultatif de la première visite : tout est optionnel, « Passer » compte comme une réponse. */
  protected readonly profileForm = inject(FormBuilder).nonNullable.group({
    ageRange: ['' as AgeRange | ''],
    gender: ['' as Gender | ''],
    country: [''],
    region: [''],
    otherLanguages: [[] as string[]],
  });
  protected readonly ageRanges: readonly AgeRange[] = ['R18_25', 'R26_35', 'R36_45', 'R46_60', 'R61_PLUS'];
  protected readonly genders: readonly Gender[] = ['FEMALE', 'MALE', 'OTHER'];
  protected readonly languages = signal<LanguageView[]>([]);
  /** Réponses déjà données (null si le serveur ne les a pas renvoyées : on ne bloque alors rien). */
  private readonly profile = signal<ContributorProfile | null>(null);

  protected readonly recorder = new AudioRecorder();
  protected readonly maxMs = MAX_MS;

  protected readonly phase = signal<Phase>('loading');
  protected readonly campaigns = signal<CampaignView[]>([]);
  protected readonly campaign = signal<CampaignView | null>(null);
  protected readonly queue = signal<PromptView[]>([]);
  protected readonly clip = signal<RecordedClip | null>(null);
  protected readonly clipUrl = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal(false);
  /** Période d'essai (null si le serveur ne l'a pas renvoyée : on laisse alors le serveur trancher à l'envoi). */
  protected readonly trial = signal<TrialView | null>(null);
  protected readonly suspended = computed(() => this.trial()?.status === 'SUSPENDED');
  private readonly sentThisSession = signal(0);

  /** Phrases déjà traitées (envoyées ou gardées hors ligne) : à ne pas reproposer si le serveur ne les connaît pas encore. */
  private readonly handled = new Set<number>();

  protected readonly prompt = computed(() => this.queue()[0] ?? null);
  protected readonly done = computed(
    () => (this.campaign()?.recordedByMe ?? 0) + this.sentThisSession(),
  );
  protected readonly total = computed(() => this.campaign()?.totalPrompts ?? 0);
  protected readonly progress = computed(() =>
    this.total() > 0 ? Math.min(100, (this.done() / this.total()) * 100) : 0,
  );
  protected readonly promptDir = computed(() =>
    this.campaign()?.direction === 'RTL' ? 'rtl' : 'ltr',
  );
  protected readonly elapsed = computed(() => formatTime(this.recorder.elapsedMs()));
  protected readonly limit = computed(() => formatTime(MAX_MS));
  protected readonly elapsedRatio = computed(() => (this.recorder.elapsedMs() / MAX_MS) * 100);

  ngOnInit(): void {
    void this.outbox.flush(); // envoie d'abord ce qui attendait depuis une session précédente
    this.load();
  }

  ngOnDestroy(): void {
    this.recorder.dispose();
    this.revokeUrl();
  }

  protected load(): void {
    this.phase.set('loading');
    forkJoin({
      consents: this.api.consents(),
      campaigns: this.api.openCampaigns(),
      trial: this.api.trial().pipe(catchError(() => of(null))),
      profile: this.api.contributorProfile().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ consents, campaigns, trial, profile }) => {
        this.campaigns.set(campaigns);
        this.trial.set(trial);
        this.profile.set(profile);
        const consented = consents.some((c) => c.kind === 'COLLECTION' && c.revokedAt === null);
        if (!consented) {
          this.phase.set('consent');
        } else {
          this.proceed();
        }
      },
      error: () => this.phase.set('failed'),
    });
  }

  protected acceptConsent(): void {
    this.busy.set(true);
    this.api.grantConsent('COLLECTION').subscribe({
      next: () => {
        this.busy.set(false);
        this.proceed();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notice.set({ kind: 'error', ...toApiError(error) });
      },
    });
  }

  protected ageKey(range: AgeRange): TranslationKey {
    return `age.${range}` as TranslationKey;
  }

  protected genderKey(gender: Gender): TranslationKey {
    return `gender.${gender}` as TranslationKey;
  }

  private openProfile(): void {
    this.phase.set('profile');
    if (this.languages().length === 0) {
      this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
    }
  }

  /** Envoie les réponses ; sans aucune réponse, c'est « passer » et le questionnaire ne revient plus. */
  protected saveProfile(skip: boolean): void {
    if (this.busy()) return;
    const value = this.profileForm.getRawValue();
    this.busy.set(true);
    this.api
      .saveContributorProfile({
        ageRange: skip || !value.ageRange ? null : value.ageRange,
        gender: skip || !value.gender ? null : value.gender,
        country: skip ? null : value.country.trim() || null,
        region: skip ? null : value.region.trim() || null,
        otherLanguages: skip ? [] : value.otherLanguages,
      })
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.profile.set(saved);
          this.proceed();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notice.set({ kind: 'error', ...toApiError(error) });
        },
      });
  }

  protected selectCampaign(campaign: CampaignView): void {
    this.campaign.set(campaign);
    this.sentThisSession.set(0);
    this.handled.clear();
    this.loadTodo();
  }

  /** Démarre ou arrête l'enregistrement selon l'état. */
  protected async toggleRecording(): Promise<void> {
    if (this.phase() === 'recording') {
      try {
        this.onClip(await this.recorder.stop(), false);
      } catch {
        this.phase.set('ready');
      }
      return;
    }
    this.notice.set(null);
    try {
      await this.recorder.start(MAX_MS, (clip) => this.onClip(clip, true));
      this.phase.set('recording');
    } catch (error) {
      const code = error instanceof RecorderError ? error.code : 'unavailable';
      this.notice.set({ kind: 'error', key: MIC_ERRORS[code] });
    }
  }

  protected retry(): void {
    this.discardClip();
    this.notice.set(null);
    this.phase.set('ready');
  }

  protected send(): void {
    const clip = this.clip();
    const prompt = this.prompt();
    if (!clip || !prompt) return;
    this.phase.set('sending');
    this.notice.set(null);
    this.api.upload(prompt.id, clip.durationMs, clip.blob, clip.mimeType).subscribe({
      next: () => this.afterSend(prompt.id, 'record.sent', 'success', true),
      error: (error: unknown) => void this.onSendError(error, prompt.id, clip),
    });
  }

  private proceed(): void {
    const campaigns = this.campaigns();
    const profile = this.profile();
    if (this.isBlocked(this.trial())) {
      this.phase.set('blocked');
    } else if (profile && !profile.answered) {
      this.openProfile();
    } else if (campaigns.length === 0) {
      this.phase.set('empty');
    } else if (campaigns.length === 1) {
      this.selectCampaign(campaigns[0]);
    } else {
      this.phase.set('pick');
    }
  }

  private loadTodo(): void {
    const campaign = this.campaign();
    if (!campaign) return;
    this.phase.set('loading');
    this.api.todo(campaign.id, BATCH).subscribe({
      next: (prompts) => {
        const fresh = prompts.filter((p) => !this.handled.has(p.id));
        this.queue.set(fresh);
        this.phase.set(fresh.length > 0 ? 'ready' : 'done');
      },
      error: () => this.phase.set('failed'),
    });
  }

  private onClip(clip: RecordedClip, autoStopped: boolean): void {
    if (clip.durationMs < MIN_MS) {
      this.notice.set({ kind: 'error', key: 'record.tooShort' });
      this.phase.set('ready');
      return;
    }
    this.discardClip();
    this.clip.set(clip);
    this.clipUrl.set(URL.createObjectURL(clip.blob));
    this.notice.set(
      autoStopped
        ? { kind: 'info', key: 'record.maxReached', params: { seconds: MAX_MS / 1000 } }
        : null,
    );
    this.phase.set('review');
  }

  private async onSendError(error: unknown, promptId: number, clip: RecordedClip): Promise<void> {
    const status = error instanceof HttpErrorResponse ? error.status : -1;
    if (status === 0) {
      // Pas de réseau : l'audio est gardé sur l'appareil et partira plus tard
      try {
        await this.outbox.add({
          promptId,
          durationMs: clip.durationMs,
          mimeType: clip.mimeType,
          blob: clip.blob,
        });
        this.afterSend(promptId, 'record.savedOffline', 'info', false);
        return;
      } catch {
        // stockage local indisponible : on laisse l'utilisateur réessayer
      }
    }
    if (status === 409) {
      this.afterSend(promptId, 'record.duplicate', 'info', false);
      return;
    }
    if (status === 403) {
      this.phase.set('consent'); // consentement retiré entre-temps
      return;
    }
    const code = error instanceof HttpErrorResponse ? error.error?.message : null;
    if (code === 'error.triallimit' || code === 'error.contributorsuspended') {
      // Plafond de l'essai atteint ou compte suspendu : on relit l'état pour l'afficher fidèlement
      this.api.trial().subscribe({
        next: (trial) => this.trial.set(trial),
        error: () => undefined,
        complete: () => this.phase.set('blocked'),
      });
      return;
    }
    this.notice.set({ kind: 'error', ...toApiError(error) });
    this.phase.set('review');
  }

  private afterSend(
    promptId: number,
    key: TranslationKey,
    kind: Notice['kind'],
    countAsSent: boolean,
  ): void {
    this.handled.add(promptId);
    if (countAsSent) {
      this.sentThisSession.update((n) => n + 1);
      // Garde le compteur de l'essai à jour sans rappeler le serveur
      this.trial.update((t) => (t ? { ...t, used: t.used + 1, pending: t.pending + 1 } : t));
    }
    this.discardClip();
    this.queue.update((q) => q.filter((p) => p.id !== promptId));
    this.notice.set({ kind, key });
    if (this.isBlocked(this.trial())) {
      this.phase.set('blocked');
    } else if (this.queue().length > 0) {
      this.phase.set('ready');
    } else {
      this.loadTodo();
    }
  }

  /** Suspendu, ou en essai avec tout le quota déjà envoyé : le serveur refuserait le prochain envoi. */
  private isBlocked(trial: TrialView | null): boolean {
    if (!trial) return false;
    return trial.status === 'SUSPENDED' || (trial.status === 'TRIAL' && trial.used >= trial.limit);
  }

  private discardClip(): void {
    this.revokeUrl();
    this.clip.set(null);
  }

  private revokeUrl(): void {
    const url = this.clipUrl();
    if (url) URL.revokeObjectURL(url);
    this.clipUrl.set(null);
  }
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
