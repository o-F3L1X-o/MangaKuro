export const APP_VERSION = 'v1.0.1';
export const APP_NAME = 'MangaKuro';
export const APP_FULL_NAME = 'MangaKuro • ULTIMATE COMIC & MANGA SUITE';
export const APP_DESCRIPTION = 'MangaKuro • ULTIMATE COMIC & MANGA SUITE - Gestor y editor profesional de cómics y mangas CBZ/CBR/PDF/EPUB para Komga';
export const LICENSE_NAME = 'GNU GPLv3';
export const LICENSE_TYPE = 'GPL-3.0';
export const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.en.html';

// Enlace oficial directo de donaciones de PayPal
export const PAYPAL_HOSTED_BUTTON_ID = 'K2L2FEZ2NS6TY';
export const PAYPAL_BASE_URL = `https://www.paypal.com/donate/?hosted_button_id=${PAYPAL_HOSTED_BUTTON_ID}`;
export const DEFAULT_DONATION_URL = PAYPAL_BASE_URL;

export const formatDonationUrl = (baseUrl?: string): string => {
  return (baseUrl && baseUrl.trim().length > 0) ? baseUrl.trim() : PAYPAL_BASE_URL;
};

export const getPayPalDonationUrl = (): string => {
  return PAYPAL_BASE_URL;
};
