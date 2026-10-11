import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { catchError, forkJoin, of } from 'rxjs';
import { toApiError } from '../../core/api-error';
import { CatalogService, LanguageView } from '../../core/api/catalog.service';
import {
  ConsentRecord,
  ContributionService,
  ContributorProfile,
  ContributorStatus,
  TrialView,
} from '../../core/api/contribution.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';
import { ContributorProfileForm } from './contributor-profile-form';

/** Rôles affichés en pastilles (ROLE_USER est implicite et n'apporte rien). */
const ROLE_LABELS: Record<string, TranslationKey> = {
  ROLE_CONTRIBUTOR: 'register.role.CONTRIBUTOR',
  ROLE_DEVELOPER: 'register.role.DEVELOPER',
  ROLE_ORGANIZATION: 'register.role.ORGANIZATION',
  ROLE_ADMIN: 'profile.role.ADMIN',
};

/**
 * Mon profil : bandeau d'identité, informations déclarées (contributeur), état de la période d'essai et consentement
 * à la collecte de la voix, que l'on peut retirer ou accorder à nouveau. Seul le consentement de collecte a un effet
 * aujourd'hui (il bloque l'enregistrement et exclut les audios des versions de datasets suivantes) : les autres types
 * ne sont donc pas proposés.
 */
@Component({
  selector: 'app-profile',
  imports: [ContributorProfileForm, MatButtonModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ContributionService);
  private readonly catalog = inject(CatalogService);

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly profile = signal<ContributorProfile | null>(null);
  protected readonly trial = signal<TrialView | null>(null);
  protected readonly consents = signal<ConsentRecord[]>([]);
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly busy = signal(false);
  protected readonly notice = signal<{ ok: boolean; key: TranslationKey } | null>(null);

  /** Seuls les contributeurs (et l'admin, qui peut enregistrer) ont des informations déclarées et un consentement. */
  protected readonly isContributor = computed(
    () => this.auth.hasRole('ROLE_CONTRIBUTOR') || this.auth.hasRole('ROLE_ADMIN'),
  );
  protected readonly activeConsent = computed(
    () => this.consents().find((c) => c.kind === 'COLLECTION' && c.revokedAt === null) ?? null,
  );
  protected readonly nativeLanguageName = computed(() => {
    const code = this.profile()?.nativeLanguage;
    if (!code) return null;
    return this.languages().find((l) => l.code === code)?.name ?? code;
  });
  protected readonly initials = computed(() =>
    (this.auth.account()?.login ?? '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase(),
  );
  protected readonly roleLabels = computed(() =>
    this.auth
      .roles()
      .map((role) => ROLE_LABELS[role])
      .filter((key): key is TranslationKey => key !== undefined),
  );
  /** Part du quota d'essai déjà envoyée, en pourcentage (pour la barre de progression). */
  protected readonly trialPercent = computed(() => {
    const t = this.trial();
    return t && t.limit > 0 ? Math.min(100, Math.round((t.used / t.limit) * 100)) : 0;
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    if (!this.isContributor()) {
      this.state.set('ready');
      return;
    }
    forkJoin({
      profile: this.api.contributorProfile(),
      consents: this.api.consents(),
      trial: this.api.trial().pipe(catchError(() => of(null))),
      languages: this.catalog.languages().pipe(catchError(() => of([] as LanguageView[]))),
    }).subscribe({
      next: ({ profile, consents, trial, languages }) => {
        this.profile.set(profile);
        this.consents.set(consents);
        this.trial.set(trial);
        this.languages.set(languages);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  protected statusKey(status: ContributorStatus): TranslationKey {
    return `contribstatus.${status}` as TranslationKey;
  }

  protected statusTone(status: ContributorStatus): string {
    return status === 'ACTIVE' ? 'green' : status === 'TRIAL' ? 'gold' : 'gray';
  }

  protected onSaved(profile: ContributorProfile): void {
    this.profile.set(profile);
    this.notice.set({ ok: true, key: 'profile.saved' });
  }

  protected revoke(): void {
    const consent = this.activeConsent();
    if (!consent || this.busy()) return;
    if (!window.confirm(this.i18n.t('profile.consent.revokeConfirm'))) return;
    this.change(this.api.revokeConsent(consent.id));
  }

  protected grant(): void {
    if (this.busy()) return;
    this.change(this.api.grantConsent('COLLECTION'));
  }

  /** Applique un changement de consentement puis relit la liste, qui reste la référence du serveur. */
  private change(call: ReturnType<ContributionService['grantConsent']>): void {
    this.busy.set(true);
    this.notice.set(null);
    call.subscribe({
      next: () => {
        this.api.consents().subscribe({
          next: (consents) => {
            this.consents.set(consents);
            this.busy.set(false);
          },
          error: () => this.busy.set(false),
        });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notice.set({ ok: false, key: toApiError(err).key });
      },
    });
  }
}
