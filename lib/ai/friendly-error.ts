// Turns provider errors from the server (English, with HTTP codes) into short Spanish messages
// that tell the user what to do next.
export function friendlyProviderError(message: string): string {
  if (/^Connect OpenRouter first/i.test(message)) return "Conectá tu cuenta de OpenRouter en Modelos IA y probá de nuevo."
  if (/^Cross-site requests/i.test(message)) return "Abrí Agentic City directamente para usar tus conexiones."
  // The API rate limiter answers {"error":"rate_limit_exceeded"}; the wallet routes say "Too many ...".
  if (/^rate_limit_exceeded$|^Too many .*requests/i.test(message)) return "Demasiados pedidos seguidos. Esperá un minuto y probá de nuevo."
  const empty = /^(.+?) returned an empty response/.exec(message)
  if (empty) return `${empty[1]} respondió vacío. Probá de nuevo o elegí otro modelo.`
  const rejected = /^(.+?) rejected the (?:key or request|request|token) \(HTTP (\d+)\)/.exec(message)
  if (!rejected) return message
  const [, provider, code] = rejected
  if (code === "401" || code === "403") {
    return provider === "OpenRouter"
      ? "OpenRouter rechazó tu conexión. Desconectala y volvé a conectar tu cuenta."
      : `${provider} rechazó la key. Revisala o volvé a cargarla.`
  }
  if (code === "402") return `Tu cuenta de ${provider} no tiene crédito suficiente. Cargá crédito y probá de nuevo.`
  if (code === "404") return `${provider} no encontró ese modelo. Elegí otro de la lista.`
  if (code === "429") return `${provider} está limitando los pedidos. Esperá un momento y probá de nuevo.`
  return `${provider} devolvió un error (HTTP ${code}). Probá de nuevo en un rato.`
}
