import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { toApiError } from '../../core/api-error';
import { API_KEY_SCOPES, ApiKeyInfo, ApiKeyScope, ApiKeyService, CreatedApiKey } from '../../core/api/api-key.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Durées d'expiration proposées (en jours) ; `null` = la clé n'expire pas. */
const EXPIRY_CHOICES: readonly (number | null)[] = [30, 90, 365, null];

/**
 * Clés d'API : automatiser le téléchargement d'un dataset acheté, l'envoi de prédictions pour le classement ou la
 * publication d'un modèle. Le secret n'est montré qu'une fois, à la création ; ensuite seul le préfixe reste visible.
 */
@Component({
  selector: 'app-api-keys',
  imports: [ReactiveFormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './api-keys.html',
  styleUrl: './api-keys.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeysPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly service = inject(ApiKeyService);
  private readonly fb = inject(FormBuilder);

  protected readonly scopes = API_KEY_SCOPES;
  protected readonly expiryChoices = EXPIRY_CHOICES;

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly keys = signal<ApiKeyInfo[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<{ key: TranslationKey; params?: Record<string, string | number> } | null>(null);
  /** Clé qui vient d'être créée : seul endroit où le secret existe côté interface. */
  protected readonly created = signal<CreatedApiKey | null>(null);
  protected readonly copied = signal(false);
  /** Clé dont la révocation attend une confirmation. */
  protected readonly confirming = signal<number | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    download: [true],
    evaluate: [false],
    publish: [false],
    expiresInDays: [90 as number | null],
  });

  protected readonly activeCount = computed(() => this.keys().filter((k) => k.active).length);

  /** Exemples prêts à copier : avec la clé qui vient d'être créée, sinon un emplacement à remplacer. */
  protected readonly examples = computed(() => {
    const key = this.created()?.secret ?? 'afv_XXXXXXXX_…';
    const host = typeof location === 'undefined' ? 'https://exemple.org' : location.origin;
    return [
      `# ${this.i18n.t('apikeys.ex.list')}`,
      `curl -H "X-API-Key: ${key}" ${host}/api/me/purchases`,
      '',
      `# ${this.i18n.t('apikeys.ex.link')}`,
      `curl -X POST -H "X-API-Key: ${key}" ${host}/api/purchases/<ID_ACHAT>/download-link`,
      '',
      `# ${this.i18n.t('apikeys.ex.evaluate')}`,
      `curl -X POST -H "X-API-Key: ${key}" -F testSetId=<ID_JEU_DE_TEST> -F file=@predictions.csv \\`,
      `  ${host}/api/me/models/<ID_MODELE>/evaluations`,
    ].join('\n');
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.service.mine().subscribe({
      next: (list) => {
        this.keys.set(list);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  protected scopeLabel(scope: ApiKeyScope): TranslationKey {
    return `apikeys.scope.${scope}` as TranslationKey;
  }

  protected scopeHint(scope: ApiKeyScope): TranslationKey {
    return `apikeys.scope.${scope}.hint` as TranslationKey;
  }

  protected expiryLabel(days: number | null): string {
    return days === null ? this.i18n.t('apikeys.expiry.never') : this.i18n.t('apikeys.expiry.days', { n: days });
  }

  protected create(): void {
    this.error.set(null);
    const v = this.form.getRawValue();
    const chosen: ApiKeyScope[] = [];
    if (v.download) chosen.push('DOWNLOAD');
    if (v.evaluate) chosen.push('EVALUATE');
    if (v.publish) chosen.push('PUBLISH');
    if (this.form.invalid || chosen.length === 0) {
      this.form.markAllAsTouched();
      if (chosen.length === 0) {
        this.error.set({ key: 'error.invalidscopes' });
      }
      return;
    }
    this.busy.set(true);
    this.service.create(v.name.trim(), chosen, v.expiresInDays).subscribe({
      next: (created) => {
        this.created.set(created);
        this.copied.set(false);
        this.busy.set(false);
        this.form.patchValue({ name: '' });
        this.form.controls.name.markAsUntouched();
        this.load();
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err));
        this.busy.set(false);
      },
    });
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  /** Oublie le secret affiché : après cela il n'existe plus nulle part côté interface. */
  protected dismissCreated(): void {
    this.created.set(null);
    this.copied.set(false);
  }

  protected askRevoke(id: number): void {
    this.confirming.set(id);
  }

  protected revoke(id: number): void {
    this.busy.set(true);
    this.service.revoke(id).subscribe({
      next: () => {
        this.confirming.set(null);
        this.busy.set(false);
        this.load();
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err));
        this.busy.set(false);
      },
    });
  }
}
