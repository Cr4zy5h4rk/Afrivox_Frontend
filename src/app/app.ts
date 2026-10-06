import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { I18nService, LANGUAGES, Lang } from './core/i18n/i18n.service';
import { BrandMark } from './core/ui/brand-mark';

/** Coquille de l'application : barre du haut (marque, langue, déconnexion) et zone des pages. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatButtonModule, MatButtonToggleModule, BrandMark],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  protected readonly languages = LANGUAGES;

  protected setLang(lang: Lang): void {
    this.i18n.setLang(lang);
  }
}
