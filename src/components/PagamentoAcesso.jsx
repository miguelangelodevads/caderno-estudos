import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import PagamentoManual from "./PagamentoManual.jsx";
import { BILLING_ENABLED, billingRequest } from "../utils/billingClient.js";

export function PagamentoAutomatico({ user, onLogout, accessError, onRetryAccess, request = billingRequest, navigate = (url) => window.location.assign(url) }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request(null, "/plan", { signal: controller.signal }).then((value) => {
      if (value.amountCents !== 299 || value.currency !== "BRL" || value.type !== "one_time") throw new Error("O plano de pagamento precisa ser conferido. Tente novamente mais tarde.");
      setPlan(value);
    }).catch((failure) => { if (failure.name !== "AbortError") setError(failure.message); });
    return () => controller.abort();
  }, [request]);
  const verify = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request(user, "/reconcile", { method: "POST" });
      onRetryAccess?.();
      setMessage(result.active ? "Pagamento confirmado. Abrindo seu caderno…" : result.testApproved ? "Pagamento de teste confirmado. O acesso de produção permanece protegido." : "Seu pagamento ainda não foi aprovado. A liberação acontece automaticamente quando o Mercado Pago confirmar.");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("billing") !== "return") return;
    const controller = new AbortController();
    request(user, "/reconcile", { method: "POST", signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setMessage(result.active ? "Pagamento confirmado. Abrindo seu caderno…" : "Aguardando a confirmação do Mercado Pago. Você pode manter esta tela aberta.");
      onRetryAccess?.();
    }).catch((failure) => { if (failure.name !== "AbortError") setError(failure.message); });
    return () => controller.abort();
  // A volta do checkout é consultada uma vez por conta; o listener acompanha a aprovação.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, request]);
  const checkout = async () => {
    setBusy(true); setError(""); setMessage("");
    try { const result = await request(user, "/checkout", { method: "POST" }); navigate(result.checkoutUrl); }
    catch (failure) { setError(failure.message); setBusy(false); }
  };
  return <div className="payment-screen min-h-screen bg-[#efebe1] flex items-center justify-center p-4 text-stone-800">
    <section aria-labelledby="payment-heading" className="bg-[#f8f5ee] w-full max-w-lg rounded-2xl shadow-xl p-6 sm:p-8 border border-stone-200 text-center">
      <BookOpen className="w-10 h-10 mx-auto text-stone-700 mb-5" />
      <h1 id="payment-heading" className="text-2xl font-serif font-bold">Seu caderno começa aqui</h1>
      <p className="text-stone-600 mt-3">Sua conta foi criada. Libere o acesso vitalício com um pagamento único de <strong>R$ 2,99</strong>.</p>
      <p className="text-sm text-stone-500 mt-2">Sem mensalidade. Seus cadernos ficam salvos na sua conta.</p>
      <button type="button" disabled={busy || !plan?.enabled || !!accessError} onClick={checkout}
        className="mt-7 w-full flex items-center justify-center gap-2 bg-stone-800 text-white font-medium py-3 rounded-lg disabled:opacity-50">
        <ExternalLink className="w-4 h-4" /> {busy ? "Aguarde…" : "Pagar R$ 2,99 no Mercado Pago"}
      </button>
      <p className="text-sm text-stone-500 mt-3 flex gap-2 justify-center items-center"><ShieldCheck className="w-4 h-4 shrink-0" /> Liberação automática após a aprovação.</p>
      <button type="button" disabled={busy} onClick={accessError ? onRetryAccess : verify}
        className="mt-4 py-3 px-4 text-sm text-stone-700 underline inline-flex gap-2 items-center disabled:opacity-50"><RefreshCw className="w-4 h-4" /> {accessError ? "Verificar meu acesso novamente" : "Já paguei · Verificar pagamento"}</button>
      {(error || accessError) && <p role="alert" className="mt-4 text-sm text-red-700">{accessError || error}</p>}
      {plan && !plan.enabled && <p className="mt-4 text-sm text-stone-600">O pagamento está sendo preparado. Tente novamente mais tarde.</p>}
      <p role="status" aria-live="polite" className="mt-4 text-sm text-stone-600">{message}</p>
      <p className="mt-6 text-xs text-stone-500 break-all">Conta: {user.email}</p>
      <button type="button" onClick={onLogout} className="mt-2 py-3 px-4 text-sm text-stone-500 underline">Sair / Trocar de conta</button>
    </section>
  </div>;
}
export default function PagamentoAcesso(props) {
  return BILLING_ENABLED ? <PagamentoAutomatico {...props} /> : <PagamentoManual {...props} />;
}
