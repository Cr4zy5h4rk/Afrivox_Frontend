import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { I18nService } from '../i18n/i18n.service';

/** Pagination précédent / suivant (pages numérotées à partir de 0 côté serveur). */
@Component({
  selector: 'app-pager',
  imports: [MatButtonModule],
  template: `
    @if (pages() > 1) {
      <nav class="pager" [attr.aria-label]="i18n.t('common.page', { page: page() + 1, pages: pages() })">
        <button mat-stroked-button type="button" [disabled]="page() <= 0" (click)="pageChange.emit(page() - 1)">
          {{ i18n.t('common.prev') }}
        </button>
        <span class="muted">{{ i18n.t('common.page', { page: page() + 1, pages: pages() }) }}</span>
        <button
          mat-stroked-button
          type="button"
          [disabled]="page() + 1 >= pages()"
          (click)="pageChange.emit(page() + 1)"
        >
          {{ i18n.t('common.next') }}
        </button>
      </nav>
    }
  `,
  styles: `
    .pager {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-block: 2rem 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pager {
  protected readonly i18n = inject(I18nService);
  readonly page = input.required<number>();
  readonly pages = input.required<number>();
  readonly pageChange = output<number>();
}
