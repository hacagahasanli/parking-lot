/** Types for the plain-JS <nalbaki-support> module (src/nalbaki-support.js). */
export type SupportVariant = 'home' | 'page' | 'menu' | 'pause' | 'results';

/** The supporter data file, updated by hand from real supporters. Only a positive whole count is ever shown (page variant). */
export interface SupportWorld {
  supporters: number | null;
  stage: number;
  updatedAt: string | null;
}

/** The payment boundary. `urlFor` returns where the Support button goes for an amount (null = none picked). */
export interface SupportProvider {
  name: string;
  prefillsAmount: boolean;
  urlFor(amount: number | null): string;
}

export interface MountOptions {
  variant?: SupportVariant;
  /** The real payment link. Leave out for a neutral thank-you with no links (portal builds). */
  href?: string;
  /** The studio's /support page (pause line, and the home section's "How support works" link). */
  pageHref?: string;
  /** URL of the supporter JSON (SupportWorld). */
  dataSrc?: string;
  /** Thank-you pack previews (home shows the desktop one, page shows both). */
  packDesktop?: string;
  packPhone?: string;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Pre-pick a tier by amount (3, 5 or 10). */
  amount?: number;
  world?: Partial<SupportWorld>;
  provider?: SupportProvider;
}

/** Fired on the Support button click (bubbles, composed, cancelable: preventDefault() to handle checkout yourself). */
export interface SupportIntentDetail {
  amount: number | null;
  tier: string | null;
  variant: SupportVariant;
  url: string;
}

export declare class NalbakiSupport extends HTMLElement {
  provider: SupportProvider;
  world: SupportWorld;
  readonly variant: SupportVariant;
}

export declare const TAG: 'nalbaki-support';
export declare function define(): void;
export declare function mountSupport(host: Element, opts?: MountOptions): () => void;
export declare function loadWorld(url: string): Promise<SupportWorld>;
export declare function normalizeWorld(raw: unknown): SupportWorld;
export declare function parseAmount(raw: unknown): number | null;
export declare function linkProvider(href: string): SupportProvider;
export declare const MAX_STAGE: number;
export declare const TIERS: ReadonlyArray<{ id: string; amount: number | null; name: string; suggested?: boolean }>;
