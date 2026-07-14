import { useState } from "react";
import { Mail, Lock, BookOpen } from "lucide-react";

export default function AreaLogin({ aoFazerLogin, aoFazerCadastro }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const lidarComEnvio = (e) => {
    e.preventDefault();
    if (isRegistering) {
      aoFazerCadastro(email, senha);
    } else {
      aoFazerLogin(email, senha);
    }
  };

  return (
    <div className='min-h-screen bg-[#efebe1] flex flex-col justify-center items-center p-4'>
      <div className='bg-[#f8f5ee] w-full max-w-md rounded-2xl shadow-xl p-8 border border-stone-200'>
        <div className='flex flex-col items-center justify-center mb-8'>
          <div className='bg-stone-800 p-3 rounded-full mb-4'>
            <BookOpen className='w-8 h-8 text-[#efebe1]' />
          </div>
          <h1 className='text-3xl font-serif font-bold text-stone-800 text-center'>
            {isRegistering ? "Criar Nova Conta" : "Caderno de Estudos"}
          </h1>
          <p className='text-stone-500 mt-2 text-center'>
            {isRegistering
              ? "Crie uma conta para salvar suas anotações na nuvem."
              : "Acesse suas anotações de qualquer lugar."}
          </p>
        </div>

        <form onSubmit={lidarComEnvio} className='space-y-5'>
          <div>
            <label className='block text-sm font-medium text-stone-600 mb-1'>
              E-mail
            </label>
            <div className='relative'>
              <Mail className='absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400' />
              <input
                type='email'
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='w-full pl-10 pr-4 py-3 border-2 border-stone-200 rounded-lg outline-none focus:border-stone-500 bg-white transition-colors'
                placeholder='seu@email.com'
              />
            </div>
          </div>

          <div>
            <label className='block text-sm font-medium text-stone-600 mb-1'>
              Senha
            </label>
            <div className='relative'>
              <Lock className='absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400' />
              <input
                type='password'
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className='w-full pl-10 pr-4 py-3 border-2 border-stone-200 rounded-lg outline-none focus:border-stone-500 bg-white transition-colors'
                placeholder='••••••••'
              />
            </div>
          </div>

          <div className='pt-2'>
            <button
              type='submit'
              className='w-full bg-stone-800 hover:bg-stone-700 text-white font-medium py-3 rounded-lg shadow-sm transition-all'
            >
              {isRegistering ? "Criar minha conta" : "Entrar na minha conta"}
            </button>
          </div>
        </form>

        <div className='text-center mt-6'>
          <button
            type='button'
            onClick={() => setIsRegistering(!isRegistering)}
            className='text-sm text-stone-500 hover:text-stone-800 hover:underline'
          >
            {isRegistering
              ? "Já tem uma conta? Entre aqui."
              : "Não tem uma conta? Cadastre-se."}
          </button>
        </div>
      </div>
    </div>
  );
}
