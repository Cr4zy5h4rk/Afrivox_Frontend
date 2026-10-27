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
import { RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api-error';
import { DeveloperSettings, HubService } from '../../core/api/hub.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';

/** Le lien est affiché publiquement : https seulement (le serveur revérifie). Vide = autorisé. */
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

/**
 * Réglages du profil public d'un développeur : rien n'est public par défaut. « Ouvert aux opportunités » ne se règle
 * que si le profil est public (le serveur applique la même règle).
 */
@Component({
  selector: 'app-developer-profile-form',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './developer-profile-form.html',
  styleUrl: './developer-profile-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeveloperProfileForm implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly hub = inject(HubService);
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  /** Identifiant du profil, pour le lien « voir mon profil public ». */
  protected readonly profileId = signal<number | null>(null);

  protected readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    bio: ['', Validators.maxLength(300)],
    profileUrl: ['', [Validators.maxLength(300), httpsUrl]],
    publicProfile: [false],
    openToWork: [false],
  });

  ngOnInit(): void {
    this.hub.settings().subscribe({
      next: (s) => {
        this.apply(s);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.hub
      .saveSettings({
        displayName: v.displayName.trim(),
        bio: v.bio.trim() === '' ? null : v.bio.trim(),
        profileUrl: v.profileUrl.trim() === '' ? null : v.profileUrl.trim(),
        publicProfile: v.publicProfile,
        openToWork: v.publicProfile && v.openToWork,
      })
      .subscribe({
        next: (s) => {
          this.apply(s);
          this.saving.set(false);
          this.saved.set(true);
        },
        error: (err: unknown) => {
          this.error.set(toApiError(err));
          this.saving.set(false);
        },
      });
  }

  /** Tient « ouvert aux opportunités » cohérent avec « profil public » dès que l'on décoche ce dernier. */
  protected onPublicChange(): void {
    this.syncOpenToWork();
  }

  private syncOpenToWork(): void {
    const open = this.form.controls.openToWork;
    if (this.form.controls.publicProfile.value) {
      open.enable();
    } else {
      open.setValue(false);
      open.disable();
    }
  }

  private apply(s: DeveloperSettings): void {
    this.profileId.set(s.id ?? null);
    this.form.reset({
      displayName: s.displayName,
      bio: s.bio ?? '',
      profileUrl: s.profileUrl ?? '',
      publicProfile: s.publicProfile,
      openToWork: s.openToWork,
    });
    this.syncOpenToWork();
  }
}
