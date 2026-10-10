import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  WritableSignal,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Observable, catchError, debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { CatalogService, LanguageView, MlTask, VersionOption } from '../../core/api/catalog.service';
import { ApiError, toApiError } from '../../core/api-error';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Le lien est affiché publiquement : on n'accepte que https (le serveur revérifie). Vide = autorisé. */
function httpsUrl(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname ? null : { https: true };
  } catch {
    return { https: true };
  }
}

/** Formulaire de publication d'un modèle (développeurs et admin). */
@Component({
  selector: 'app-model-new',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './model-new.html',
  styleUrl: './model-new.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelNewPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Slug d'un dataset à présélectionner (`/models/new?dataset=...`, depuis la fiche du dataset). */
  readonly dataset = input<string>();

  /** Nombre maximal d'« autres datasets » (le serveur revérifie). */
  protected readonly maxOthers = 10;

  protected readonly tasks: MlTask[] = ['ASR', 'TTS', 'INTENT', 'CONVERSATION', 'OTHER'];
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  /** Dataset principal choisi (null = non précisé) et datasets supplémentaires (facultatifs). */
  protected readonly primary = signal<VersionOption | null>(null);
  protected readonly others = signal<VersionOption[]>([]);

  /** Champs de recherche : le catalogue peut compter des centaines de datasets, on interroge le serveur à la frappe. */
  protected readonly primarySearch = new FormControl<string | VersionOption>('', { nonNullable: true });
  protected readonly otherSearch = new FormControl<string | VersionOption>('', { nonNullable: true });
  protected readonly primaryResults = signal<VersionOption[]>([]);
  protected readonly otherResults = signal<VersionOption[]>([]);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    task: ['ASR' as MlTask, Validators.required],
    languageCode: [''],
    description: ['', Validators.maxLength(1000)],
    license: ['', Validators.maxLength(60)],
    url: ['', [Validators.maxLength(300), httpsUrl]],
    sha256: ['', Validators.pattern(/^\s*([0-9a-fA-F]{64})?\s*$/)],
  });

  /** Identifiants SPDX des licences les plus courantes ; la saisie libre reste possible pour les autres. */
  protected readonly commonLicenses = [
    'MIT',
    'Apache-2.0',
    'BSD-3-Clause',
    'BSD-2-Clause',
    'CC0-1.0',
    'CC-BY-4.0',
    'CC-BY-SA-4.0',
    'CC-BY-NC-4.0',
    'CC-BY-NC-SA-4.0',
    'OpenRAIL-M',
    'GPL-3.0',
    'LGPL-3.0',
    'AGPL-3.0',
  ];

  /** Suggestions filtrées par ce qui est tapé ; le champ reste libre (toute autre licence est acceptée). */
  private readonly licenseValue = toSignal(this.form.controls.license.valueChanges, { initialValue: '' });
  protected readonly licenseChoices = computed(() => {
    const text = this.licenseValue().trim().toLowerCase();
    return this.commonLicenses.filter((l) => l.toLowerCase().includes(text));
  });

  ngOnInit(): void {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
    this.bindSearch(this.primarySearch, this.primaryResults);
    this.bindSearch(this.otherSearch, this.otherResults);

    // Présélection depuis la fiche d'un dataset : les versions arrivent de la plus récente à la plus ancienne,
    // la première du slug est donc la dernière publiée.
    const slug = this.dataset();
    if (slug) {
      this.search(slug).subscribe((found) => this.primary.set(found.find((v) => v.slug === slug) ?? null));
    }
  }

  /** Relie un champ de saisie à sa liste de résultats (attente de 300 ms, requête précédente annulée). */
  private bindSearch(control: FormControl<string | VersionOption>, results: WritableSignal<VersionOption[]>): void {
    control.valueChanges
      .pipe(
        startWith(''),
        // Après un choix la valeur est un objet (la version) : il n'y a plus rien à chercher.
        switchMap((value) => (typeof value === 'string' ? of(value.trim()) : of(null))),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((text) => (text === null ? of(null) : this.search(text))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((found) => {
        if (found !== null) results.set(found);
      });
  }

  private search(text: string): Observable<VersionOption[]> {
    return this.catalog.datasetVersions(text).pipe(catchError(() => of([])));
  }

  /** Résultats du champ « autres » sans les versions déjà choisies ni le dataset principal. */
  protected otherChoices(): VersionOption[] {
    const taken = new Set([this.primary()?.id, ...this.others().map((v) => v.id)]);
    return this.otherResults().filter((v) => !taken.has(v.id));
  }

  protected displayVersion(value: string | VersionOption | null): string {
    return value && typeof value !== 'string' ? `${value.title} · ${value.version}` : '';
  }

  protected pickPrimary(version: VersionOption): void {
    this.primary.set(version);
    // Le principal ne doit pas figurer deux fois.
    this.others.update((list) => list.filter((v) => v.id !== version.id));
    this.primarySearch.setValue('');
  }

  protected clearPrimary(): void {
    this.primary.set(null);
    // Sans dataset principal, les autres n'ont pas de sens (le serveur les refuse).
    this.others.set([]);
  }

  protected addOther(version: VersionOption): void {
    if (this.others().length < this.maxOthers) {
      this.others.update((list) => [...list, version]);
    }
    this.otherSearch.setValue('');
  }

  protected removeOther(version: VersionOption): void {
    this.others.update((list) => list.filter((v) => v.id !== version.id));
  }

  protected taskKey(task: MlTask): TranslationKey {
    return `task.${task}`;
  }

  protected submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.catalog
      .publishModel({
        ...this.form.getRawValue(),
        trainedOnVersionId: this.primary()?.id ?? null,
        otherVersionIds: this.others().map((v) => v.id),
      })
      .subscribe({
        next: (model) => void this.router.navigate(['/models', model.id]),
        error: (err: unknown) => {
          this.error.set(toApiError(err));
          this.loading.set(false);
        },
      });
  }
}
