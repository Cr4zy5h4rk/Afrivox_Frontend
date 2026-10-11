import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { toApiError } from '../../core/api-error';
import { CatalogService, LanguageView } from '../../core/api/catalog.service';
import {
  AgeRange,
  ContributionService,
  ContributorProfile,
  Gender,
} from '../../core/api/contribution.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/**
 * Informations déclarées par un contributeur : tranche d'âge, genre, pays et région sont obligatoires pour
 * enregistrer, les autres langues sont facultatives. Utilisé par l'écran d'enregistrement (première visite) et par la
 * page « Mon profil » (modification).
 */
@Component({
  selector: 'app-contributor-profile-form',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './contributor-profile-form.html',
  styleUrl: './contributor-profile-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorProfileForm implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(ContributionService);
  private readonly catalog = inject(CatalogService);

  /** Réponses déjà données, pour préremplir le formulaire. */
  readonly initial = input<ContributorProfile | null>(null);
  readonly submitLabel = input<TranslationKey>('record.profile.save');
  readonly saved = output<ContributorProfile>();

  protected readonly ageRanges: readonly AgeRange[] = ['R18_25', 'R26_35', 'R36_45', 'R46_60', 'R61_PLUS'];
  protected readonly genders: readonly Gender[] = ['FEMALE', 'MALE', 'OTHER'];
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<TranslationKey | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    ageRange: ['' as AgeRange | '', Validators.required],
    gender: ['' as Gender | '', Validators.required],
    country: ['', [Validators.required, Validators.maxLength(60)]],
    region: ['', [Validators.required, Validators.maxLength(60)]],
    otherLanguages: [[] as string[]],
  });

  ngOnInit(): void {
    const initial = this.initial();
    if (initial) {
      this.form.patchValue({
        ageRange: initial.ageRange ?? '',
        gender: initial.gender ?? '',
        country: initial.country ?? '',
        region: initial.region ?? '',
        otherLanguages: initial.otherLanguages,
      });
    }
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
  }

  protected ageKey(range: AgeRange): TranslationKey {
    return `age.${range}` as TranslationKey;
  }

  protected genderKey(gender: Gender): TranslationKey {
    return `gender.${gender}` as TranslationKey;
  }

  protected submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.api
      .saveContributorProfile({
        ageRange: value.ageRange || null,
        gender: value.gender || null,
        country: value.country.trim(),
        region: value.region.trim(),
        otherLanguages: value.otherLanguages,
      })
      .subscribe({
        next: (profile) => {
          this.busy.set(false);
          this.saved.emit(profile);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(toApiError(err).key);
        },
      });
  }
}
