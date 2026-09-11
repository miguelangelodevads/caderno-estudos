import { ExternalLink, Mail, MessageCircle, QrCode } from "lucide-react";

const PAYMENT_LINK = import.meta.env.VITE_MERCADO_PAGO_PAYMENT_URL;
const SUPPORT_EMAIL = import.meta.env.VITE_PAYMENT_SUPPORT_EMAIL;
const SUPPORT_WHATSAPP =
  import.meta.env.VITE_PAYMENT_SUPPORT_WHATSAPP || "5585987110571";

export default function PagamentoAcesso({ user, onLogout }) {
  return (
    <div className='min-h-screen bg-[#efebe1] flex items-center justify-center p-4 text-stone-800'>
      <div className='bg-[#f8f5ee] w-full max-w-lg rounded-2xl shadow-xl p-6 sm:p-8 border border-stone-200 text-center'>
        <div className='bg-stone-800 p-3 rounded-full w-fit mx-auto mb-4'>
          <QrCode className='w-8 h-8 text-[#efebe1]' />
        </div>
        <h1 className='text-2xl font-serif font-bold'>
          Continue usando seu caderno
        </h1>
        <p className='text-stone-500 mt-3'>
          Seu primeiro acesso foi gratuito. Faça um pagamento único de{" "}
          <strong>R$ 2,99</strong> para liberar o acesso vitalício.
        </p>

        {PAYMENT_LINK ? (
          <a
            href={PAYMENT_LINK}
            target='_blank'
            rel='noreferrer'
            className='mt-8 w-full flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-700 text-white font-medium py-3 rounded-lg transition-colors'
          >
            <ExternalLink className='w-5 h-5' /> Abrir pagamento Mercado Pago
          </a>
        ) : (
          <p className='mt-8 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800'>
            O link de pagamento ainda não foi configurado. Defina{" "}
            <strong>VITE_MERCADO_PAGO_PAYMENT_URL</strong> no arquivo de
            ambiente.
          </p>
        )}

        <div className='mt-6 text-sm text-stone-500 space-y-2'>
          <p>
            Depois do pagamento, envie o comprovante por uma das opções abaixo:
          </p>
          <div className='flex flex-col sm:flex-row gap-2 pt-2'>
            {SUPPORT_EMAIL && (
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className='flex-1 flex items-center justify-center gap-2 border border-stone-300 hover:bg-stone-100 text-stone-700 font-medium py-2.5 rounded-lg transition-colors'
              >
                <Mail className='w-4 h-4' /> E-mail
              </a>
            )}
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Olá! Fiz o pagamento do Caderno de Estudos. Minha conta é ${user.email}. Segue o comprovante.`)}`}
              target='_blank'
              rel='noreferrer'
              className='flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors'
            >
              <MessageCircle className='w-4 h-4' /> WhatsApp
            </a>
          </div>
          <p>A confirmação e a liberação do acesso serão feitas manualmente.</p>
        </div>

        <div className='mt-6 flex items-center justify-center gap-2 text-xs text-stone-500'>
          <Mail className='w-4 h-4' /> Conta: {user.email}
        </div>

        <button
          type='button'
          onClick={onLogout}
          className='mt-4 text-sm text-stone-500 hover:text-stone-800 hover:underline transition-colors'
        >
          Sair / Trocar de conta
        </button>
      </div>
    </div>
  );
}
