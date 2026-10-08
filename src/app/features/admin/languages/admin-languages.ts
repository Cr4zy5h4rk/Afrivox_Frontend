import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  AdminLanguageOverview,
  AdminService,
  LanguageStatus,
  ScriptKind,
  TextDirection,
} from '../../../core/api/admin.service';
import { PendingQualification, ValidationService } from '../../../core/api/validation.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations';

interface Notice {
  text: TranslationKey;
  ok: boolean;
}

/**
 * Langues : progression de chacune vers son seuil d'activation (validateurs qualifiés), activation
 * ou retour en liste d'attente, seuil modifiable, ajout d'une langue. Les chiffres viennent du serveur.
 */
@Component({
  selector: 'app-admin-languages',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './admin-languages.html',
  styleUrl: './admin-languages.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLanguagesSection implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly admin = inject(AdminService);
  private readonly validation = inject(ValidationService);

  protected readonly languages = signal<AdminLanguageOverview[]>([]);
  /** Demandes de qualification de validateurs à examiner. */
  protected readonly pending = signal<PendingQualification[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly showForm = signal(false);
  protected readonly notice = signal<Notice | null>(null);
  /** Seuils en cours de saisie, par identifiant de langue. */
  protected readonly thresholds = signal<Record<number, string>>({});

  protected readonly scripts: ScriptKind[] = ['LATIN', 'ARABIC', 'NKO', 'OTHER'];
  protected readonly directions: TextDirection[] = ['LTR', 'RTL'];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    dialect: ['', Validators.maxLength(80)],
    script: ['LATIN' as ScriptKind, Validators.required],
    direction: ['LTR' as TextDirection, Validators.required],
    minValidators: [5, [Validators.required, Validators.min(1), Validators.max(1000)]],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.validation.pending().subscribe({ next: (list) => this.pending.set(list), error: () => undefined });
    this.admin.languageOverview().subscribe({
      next: (list) => {
        this.languages.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected scriptKey(script: ScriptKind): TranslationKey {
    return `script.${script}`;
  }

  protected toggleForm(): void {
    this.showForm.update((open) => !open);
    this.notice.set(null);
  }

  /** Les écritures de droite à gauche (arabe, N'ko) sont proposées en RTL ; modifiable ensuite. */
  protected scriptChanged(): void {
    const script = this.form.controls.script.value;
    this.form.controls.direction.setValue(script === 'ARABIC' || script === 'NKO' ? 'RTL' : 'LTR');
  }

  /** Part du seuil atteinte, plafonnée à 100 % (pour la barre de progression). */
  protected progress(language: AdminLanguageOverview): number {
    return language.minValidators <= 0
      ? 100
      : Math.min(100, Math.round((language.qualifiedValidators / language.minValidators) * 100));
  }

  protected thresholdReached(language: AdminLanguageOverview): boolean {
    return language.qualifiedValidators >= language.minValidators;
  }

  protected thresholdValue(language: AdminLanguageOverview): string {
    return this.thresholds()[language.id] ?? String(language.minValidators);
  }

  protected setThreshold(id: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.thresholds.update((t) => ({ ...t, [id]: value }));
  }

  protected thresholdChanged(language: AdminLanguageOverview): boolean {
    const typed = Number(this.thresholdValue(language));
    return Number.isInteger(typed) && typed >= 1 && typed !== language.minValidators;
  }

  protected saveThreshold(language: AdminLanguageOverview): void {
    const typed = Number(this.thresholdValue(language));
    if (!Number.isInteger(typed) || typed < 1 || typed > 1000) return;
    this.run(this.admin.updateLanguage(language.id, { minValidators: typed }));
  }

  /** Activer sous le seuil reste possible (démarrage, démo) mais demande une confirmation explicite. */
  protected setStatus(language: AdminLanguageOverview, status: LanguageStatus): void {
    if (status === 'ACTIVE' && !this.thresholdReached(language)) {
      const message = this.i18n.t('adminlang.confirmBelow', {
        qualified: language.qualifiedValidators,
        min: language.minValidators,
      });
      if (!window.confirm(message)) return;
    }
    this.run(this.admin.updateLanguage(language.id, { status }));
  }

  /** Accepte ou refuse une demande de qualification ; accepter peut faire atteindre le seuil et activer la langue. */
  protected decide(item: PendingQualification, approve: boolean): void {
    this.run(this.validation.decide(item.id, approve));
  }

  protected create(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.run(this.admin.createLanguage({ ...value, code: value.code.trim().toLowerCase() }), () => {
      this.form.reset({ script: 'LATIN', direction: 'LTR', minValidators: 5 });
      this.showForm.set(false);
    });
  }

  /** Exécute une écriture puis recharge le tableau (les compteurs viennent du serveur). */
  private run(call: Observable<unknown>, onSuccess?: () => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set(null);
    call.subscribe({
      next: () => {
        onSuccess?.();
        this.thresholds.set({});
        this.notice.set({ text: 'admin.saved', ok: true });
        this.busy.set(false);
        this.load();
      },
      error: (err: { status?: number }) => {
        // 400 sur la création : le plus souvent un code de langue déjà pris
        this.notice.set({
          text: err.status === 400 ? 'adminlang.codeTaken' : 'admin.failed',
          ok: false,
        });
        this.busy.set(false);
      },
    });
  }
}
