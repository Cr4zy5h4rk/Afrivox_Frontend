import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../../core/api-error';
import { CatalogService, LanguageView } from '../../../core/api/catalog.service';
import { AuthService, RegistrableRole } from '../../../core/auth/auth.service';
import { ConsentService } from '../../../core/consent.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { BrandMark } from '../../../core/ui/brand-mark';
import { TranslationKey } from '../../../core/i18n/translations';

/** Les mots de passe saisis doivent être identiques. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('passwordConfirm')?.value
    ? null
    : { mismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BrandMark,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatRadioModule,
    MatSelectModule,
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  protected readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly consents = inject(ConsentService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Choix proposés à l'inscription, avec les clés de traduction de leur titre et de leur aide. */
  protected readonly roles: readonly {
    value: RegistrableRole;
    name: TranslationKey;
    help: TranslationKey;
  }[] = [
    {
      value: 'CONTRIBUTOR',
      name: 'register.role.CONTRIBUTOR',
      help: 'register.role.CONTRIBUTOR.help',
    },
    { value: 'DEVELOPER', name: 'register.role.DEVELOPER', help: 'register.role.DEVELOPER.help' },
    {
      value: 'ORGANIZATION',
      name: 'register.role.ORGANIZATION',
      help: 'register.role.ORGANIZATION.help',
    },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      login: [
        '',
        [Validators.required, Validators.maxLength(50), Validators.pattern(/^[A-Za-z0-9_.@-]+$/)],
      ],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(100)]],
      passwordConfirm: ['', Validators.required],
      role: [null as RegistrableRole | null, Validators.required],
      // Réservés au rôle contributeur : leurs validateurs ne s'appliquent que si ce rôle est choisi
      adult: [false],
      nativeLanguage: [''],
      consent: [false, Validators.requiredTrue],
    },
    { validators: passwordsMatch },
  );

  /** Langues du catalogue proposées comme langue maternelle (la valeur `other` est ajoutée dans le gabarit). */
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly isContributor = signal(false);

  /** Version du consentement lue sur le serveur ; l'inscription est impossible tant qu'elle n'est pas chargée. */
  protected readonly consentVersion = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    this.catalog
      .languages()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (list) => this.languages.set(list), error: () => undefined });

    // Majorité et langue maternelle ne sont exigées que d'un contributeur
    this.form.controls.role.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((role) => {
      const contributor = role === 'CONTRIBUTOR';
      this.isContributor.set(contributor);
      const { adult, nativeLanguage } = this.form.controls;
      adult.setValidators(contributor ? Validators.requiredTrue : null);
      nativeLanguage.setValidators(contributor ? Validators.required : null);
      adult.updateValueAndValidity();
      nativeLanguage.updateValueAndValidity();
    });

    this.consents
      .currentVersion()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (version) => this.consentVersion.set(version),
        error: (err: unknown) => this.error.set(toApiError(err)),
      });
  }

  protected submit(): void {
    const version = this.consentVersion();
    const { login, email, password, role, adult, nativeLanguage } = this.form.getRawValue();
    if (this.form.invalid || !version || !role || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth
      .register({
        login,
        email,
        password,
        role,
        langKey: this.i18n.lang(),
        consentVersion: version,
        ...(role === 'CONTRIBUTOR' ? { adult, nativeLanguage } : {}),
      })
      .subscribe({
        next: () => void this.router.navigate(['/login'], { queryParams: { registered: 1 } }),
        error: (err: unknown) => {
          this.error.set(toApiError(err));
          this.loading.set(false);
        },
      });
  }
}
