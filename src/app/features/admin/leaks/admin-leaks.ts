import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AdminService, LeakReport } from '../../../core/api/admin.service';
import { I18nService } from '../../../core/i18n/i18n.service';

/** Plus gros fichier accepté (le serveur applique la même limite). */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Traçabilité : retrouve à quel achat correspond une copie diffusée sans autorisation. Le fichier est envoyé au
 * serveur pour analyse et n'est pas conservé.
 */
@Component({
  selector: 'app-admin-leaks',
  imports: [MatButtonModule],
  templateUrl: './admin-leaks.html',
  styleUrl: './admin-leaks.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLeaksSection {
  protected readonly i18n = inject(I18nService);
  private readonly admin = inject(AdminService);

  protected readonly file = signal<File | null>(null);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly report = signal<LeakReport | null>(null);

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
    this.report.set(null);
    this.failed.set(false);
  }

  protected run(): void {
    const file = this.file();
    if (!file || this.busy()) return;
    if (file.size === 0 || file.size > MAX_BYTES) {
      this.failed.set(true);
      return;
    }
    this.busy.set(true);
    this.failed.set(false);
    this.admin.leakCheck(file).subscribe({
      next: (report) => {
        this.report.set(report);
        this.busy.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.busy.set(false);
      },
    });
  }

  protected percent(score: number): string {
    return this.i18n.n(Math.round(score * 1000) / 10, 1);
  }
}
