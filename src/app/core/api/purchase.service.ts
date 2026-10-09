import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LicenseKind } from './catalog.service';

/** Devis calculé par le serveur : le prix affiché est toujours celui qui sera facturé. */
export interface Quote {
  slug: string;
  versionLabel: string;
  license: LicenseKind;
  hours: number | null;
  pricePerHourFcfa: number | null;
  totalFcfa: number;
  free: boolean;
}

export interface Purchase {
  id: number;
  datasetSlug: string;
  datasetTitle: string;
  versionLabel: string;
  license: LicenseKind;
  priceFcfa: number;
  licenseVersion: string;
  licenseAcceptedAt: string;
  createdAt: string;
  /** Renseigné quand une version plus récente est publiée. */
  newerVersionLabel: string | null;
}

export interface DownloadLink {
  url: string;
  expiresAt: string;
  maxDownloads: number;
}

/** Achat de datasets : devis public, achat avec licence acceptée, « Mes achats » et liens régénérables. */
@Injectable({ providedIn: 'root' })
export class PurchaseService {
  private readonly http = inject(HttpClient);

  quote(slug: string, versionLabel: string, license: LicenseKind): Observable<Quote> {
    return this.http.get<Quote>(
      `/api/public/datasets/${encodeURIComponent(slug)}/versions/${encodeURIComponent(versionLabel)}/quote`,
      { params: new HttpParams().set('license', license) },
    );
  }

  purchase(
    slug: string,
    versionLabel: string,
    license: LicenseKind,
    accepted: boolean,
  ): Observable<Purchase> {
    return this.http.post<Purchase>('/api/me/purchases', { slug, versionLabel, license, accepted });
  }

  mine(): Observable<Purchase[]> {
    return this.http.get<Purchase[]>('/api/me/purchases');
  }

  /** Nouveau lien signé pour un achat déjà payé (aucun nouveau paiement). */
  downloadLink(purchaseId: number): Observable<DownloadLink> {
    return this.http.post<DownloadLink>(`/api/purchases/${purchaseId}/download-link`, {});
  }
}
