import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Logo d'AfriVox : cinq barres, comme une onde sonore (la voix) dont les couleurs reprennent la palette
 * (terracotta, ocre, indigo). Purement décoratif : le nom de la marque est écrit à côté.
 */
@Component({
  selector: 'app-brand-mark',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="14" width="5" height="12" rx="2.5" fill="var(--afv-gold)" />
      <rect x="11" y="7" width="5" height="26" rx="2.5" fill="var(--mat-sys-primary)" />
      <rect x="19" y="2" width="5" height="36" rx="2.5" fill="var(--afv-indigo)" />
      <rect x="27" y="9" width="5" height="22" rx="2.5" fill="var(--mat-sys-primary)" />
      <rect x="35" y="15" width="5" height="10" rx="2.5" fill="var(--afv-gold)" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMark {
  readonly size = input(28);
}
