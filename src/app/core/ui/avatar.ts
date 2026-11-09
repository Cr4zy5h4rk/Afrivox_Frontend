import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Teintes de l'identité visuelle (fond clair + texte foncé), choisies d'après le nom pour rester stables. */
const TONES: readonly { bg: string; fg: string }[] = [
  { bg: 'var(--afv-brand-50)', fg: 'var(--afv-brand)' },
  { bg: 'var(--afv-accent-50)', fg: 'var(--afv-accent-dark)' },
  { bg: 'var(--afv-green-50)', fg: 'var(--afv-green)' },
  { bg: 'var(--afv-gold-50)', fg: '#7a5600' },
];

/**
 * Pastille d'identité : initiales du nom affiché sur une teinte stable. Aucune image (donc rien à charger ni à
 * héberger) ; décorative, le nom est toujours écrit à côté, d'où `aria-hidden`.
 */
@Component({
  selector: 'app-avatar',
  template: `{{ initials() }}`,
  host: {
    'aria-hidden': 'true',
    '[style.inline-size.px]': 'size()',
    '[style.block-size.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.38',
    '[style.background]': 'tone().bg',
    '[style.color]': 'tone().fg',
  },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-weight: 750;
      letter-spacing: 0.02em;
      line-height: 1;
      user-select: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input(40);

  protected readonly initials = computed(() => {
    const parts = this.name()
      .split(/[\s_.-]+/)
      .filter((p) => p !== '');
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : (parts[0].charAt(1) ?? '');
    return (first + last).toUpperCase();
  });

  protected readonly tone = computed(() => {
    let hash = 0;
    for (const char of this.name()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return TONES[hash % TONES.length];
  });
}
