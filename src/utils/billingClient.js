export const BILLING_ENABLED = import.meta.env?.VITE_BILLING_ENABLED === "true";
export const BILLING_API_URL = import.meta.env?.VITE_BILLING_API_URL || "";

export function billingEndpoint(base, path) {
  if (!["/plan", "/access", "/checkout", "/reconcile"].includes(path)) throw new Error("Operação de pagamento inválida.");
  let url;
  try { url = new URL(base); } catch { throw new Error("O pagamento ainda está sendo configurado."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Endereço de pagamento inválido.");
  }
  return new URL(path, url).href;
}

export function checkoutDestination(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("O Mercado Pago não retornou um endereço válido."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !["www.mercadopago.com.br", "sandbox.mercadopago.com.br"].includes(url.hostname) || !url.pathname.startsWith("/checkout/")) {
    throw new Error("O Mercado Pago não retornou um endereço válido.");
  }
  return url.href;
}

export async function billingRequest(user, path, { method = "GET", base = BILLING_API_URL, fetcher = fetch, signal } = {}) {
  const url = billingEndpoint(base, path);
  const headers = { Accept: "application/json" };
  if (path !== "/plan") {
    if (!user || user.isAnonymous) throw new Error("Entre novamente na sua conta.");
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  let response, data;
  try { response = await fetcher(url, { method, headers, cache: "no-store", signal }); }
  catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Não foi possível conectar ao pagamento. Confira sua conexão e tente novamente.", { cause: error });
  }
  try { data = await response.json(); }
  catch { throw new Error("Não foi possível consultar o pagamento. Tente novamente em instantes."); }
  if (!response.ok) throw new Error(data.error || "Não foi possível verificar o pagamento. Tente novamente.");
  if (["/access", "/reconcile"].includes(path) && typeof data.active !== "boolean") throw new Error("Resposta de acesso inválida.");
  if (path === "/checkout") data.checkoutUrl = checkoutDestination(data.checkoutUrl);
  return data;
}
