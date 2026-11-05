export function whatsappUrl(item) {
  return `https://wa.me/${item.whatsappNumber}?text=${encodeURIComponent(item.whatsappMessage || '')}`;
}

/** Abre o WhatsApp na hora do clique (antes de qualquer espera, para o navegador não bloquear). */
export function openWhatsApp(item) {
  window.open(whatsappUrl(item), '_blank', 'noopener,noreferrer');
}
