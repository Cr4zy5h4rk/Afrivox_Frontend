import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
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
import { ApiError, toApiError } from '../../core/api-error';
import { CatalogService, LanguageView, ModelSummary } from '../../core/api/catalog.service';
import { HubService, ProjectInput } from '../../core/api/hub.service';
import { I18nService } from '../../core/i18n/i18n.service';

/** Les liens sont affichés publiquement : https seulement (le serveur revérifie). Vide = autorisé. */
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

/** Publication et modification d'un projet (développeurs et admin). `/projects/new` et `/projects/:id/edit`. */
@Component({
  selector: 'app-project-form',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './project-form.html',
  styleUrl: './project-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectFormPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly hub = inject(HubService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Paramètre de route `:id` : présent en modification, absent à la création. */
  readonly id = input<string>();

  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly models = signal<ModelSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly notFound = signal(false);

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    summary: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
    repoUrl: ['', [Validators.maxLength(300), httpsUrl]],
    demoUrl: ['', [Validators.maxLength(300), httpsUrl]],
    languageCode: [''],
    tags: [''],
    modelId: [null as number | null],
  });

  protected editing(): boolean {
    return this.id() !== undefined;
  }

  ngOnInit(): void {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
    this.hub.myModels().subscribe({ next: (m) => this.models.set(m), error: () => undefined });

    const raw = this.id();
    if (raw === undefined) return;
    const id = Number(raw);
    if (!Number.isInteger(id)) {
      this.notFound.set(true);
      return;
    }
    this.hub.project(id).subscribe({
      next: (p) => {
        if (!p.mine) {
          this.notFound.set(true);
          return;
        }
        this.form.patchValue({
          title: p.title,
          summary: p.summary,
          repoUrl: p.repoUrl ?? '',
          demoUrl: p.demoUrl ?? '',
          languageCode: p.languageCode ?? '',
          tags: p.tags.join(', '),
          modelId: p.modelId,
        });
      },
      error: () => this.notFound.set(true),
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const input: ProjectInput = {
      title: v.title.trim(),
      summary: v.summary.trim(),
      repoUrl: v.repoUrl.trim(),
      demoUrl: v.demoUrl.trim(),
      languageCode: v.languageCode,
      tags: v.tags.split(/[,\s]+/).filter((t) => t !== ''),
      modelId: v.modelId,
    };
    this.loading.set(true);
    this.error.set(null);
    const raw = this.id();
    const request = raw === undefined ? this.hub.createProject(input) : this.hub.updateProject(Number(raw), input);
    request.subscribe({
      next: (project) => void this.router.navigate(['/projects', project.id]),
      error: (err: unknown) => {
        this.error.set(toApiError(err));
        this.loading.set(false);
      },
    });
  }
}
