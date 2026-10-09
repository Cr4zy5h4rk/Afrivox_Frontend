import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { DownloadLink, Purchase, PurchaseService } from '../../core/api/purchase.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** « Mes achats » : licences acceptées et liens de téléchargement, régénérables sans repayer. */
@Component({
  selector: 'app-purchases',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './purchases.html',
  styleUrl: './purchases.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly service = inject(PurchaseService);

  protected readonly purchases = signal<Purchase[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** Achat dont un lien est en cours de préparation. */
  protected readonly working = signal<number | null>(null);
  /** Dernier lien obtenu, par achat. */
  protected readonly links = signal<Record<number, DownloadLink>>({});
  /** Message d'erreur du dernier lien demandé, par achat. */
  protected readonly linkErrors = signal<Record<number, TranslationKey>>({});

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.service.mine().subscribe({
      next: (list) => {
        this.purchases.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Demande un nouveau lien. Le téléchargement lui-même est lancé par l'utilisateur (le lien compte ses usages). */
  protected getLink(purchase: Purchase): void {
    if (this.working() !== null) return;
    this.working.set(purchase.id);
    this.linkErrors.update(({ [purchase.id]: _ignored, ...others }) => others);
    this.service.downloadLink(purchase.id).subscribe({
      next: (link) => {
        this.links.update((l) => ({ ...l, [purchase.id]: link }));
        this.working.set(null);
      },
      error: (err: unknown) => {
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        const key: TranslationKey =
          status === 429 ? 'purchases.linkLimit' : status === 410 ? 'purchases.linkGone' : 'dataset.download.failed';
        this.linkErrors.update((e) => ({ ...e, [purchase.id]: key }));
        this.working.set(null);
      },
    });
  }

  protected licenseKey(license: string): TranslationKey {
    return `license.${license}` as TranslationKey;
  }
}
