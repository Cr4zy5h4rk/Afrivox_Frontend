import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { CatalogService, LanguageView, MlTask } from '../../core/api/catalog.service';
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
    MatButtonModule,
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

  protected readonly tasks: MlTask[] = ['ASR', 'TTS', 'INTENT', 'OTHER'];
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    task: ['ASR' as MlTask, Validators.required],
    languageCode: [''],
    description: ['', Validators.maxLength(1000)],
    license: ['', Validators.maxLength(60)],
    url: ['', [Validators.maxLength(300), httpsUrl]],
  });

  ngOnInit(): void {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
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
    this.catalog.publishModel(this.form.getRawValue()).subscribe({
      next: (model) => void this.router.navigate(['/models', model.id]),
      error: (err: unknown) => {
        this.error.set(toApiError(err));
        this.loading.set(false);
      },
    });
  }
}
