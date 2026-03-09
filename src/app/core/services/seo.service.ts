import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';

const BASE_URL = 'https://landazury.vercel.app';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const SITE_NAME = 'Landazury Importaciones';

export interface SeoOptions {
  title: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  noIndex?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly platformId = inject(PLATFORM_ID);

  setPage(options: SeoOptions): void {
    const fullTitle = `${options.title} | ${SITE_NAME}`;
    const description =
      options.description ??
      'Plataforma de dropshipping elite para vendedores en Latinoamérica. Productos exclusivos con alto margen y mentoría experta.';
    const canonical = options.canonical ? `${BASE_URL}${options.canonical}` : BASE_URL;
    const image = options.ogImage ?? DEFAULT_IMAGE;

    this.titleService.setTitle(fullTitle);

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({
      name: 'robots',
      content: options.noIndex ? 'noindex, nofollow' : 'index, follow',
    });

    // Open Graph
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:image', content: image });

    // Twitter
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    // Canonical link
    this.updateCanonicalLink(canonical);
  }

  private updateCanonicalLink(url: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const existing = document.querySelector('link[rel="canonical"]');
    if (existing) {
      existing.setAttribute('href', url);
    }
  }
}
