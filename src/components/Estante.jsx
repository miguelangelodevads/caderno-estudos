import { useState } from "react";
import { Plus, Trash2, BookOpen, Library, Cloud } from "lucide-react";

const COLORS = [
  "bg-blue-600",
  "bg-red-600",
  "bg-green-600",
  "bg-yellow-500",
  "bg-purple-600",
  "bg-pink-600",
  "bg-teal-600",
  "bg-orange-600",
  "bg-slate-700",
];

export default function Estante({
  notebooks,
  onOpenNotebook,
  onAddNotebook,
  onDeleteNotebook,
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const handleCreate = () => {
    if (!title.trim()) return;
    onAddNotebook(title, color);
    setIsAdding(false);
    setTitle("");
  };

  return (
    <div className='min-h-screen bg-stone-100 p-8 font-sans'>
      <div className='max-w-6xl mx-auto'>
        <header className='mb-12 flex flex-col md:flex-row md:items-center justify-between border-b-2 border-stone-300 pb-4 gap-4'>
          <div className='flex items-center gap-3 text-stone-800'>
            <Library className='w-8 h-8' />
            <h1 className='text-3xl font-serif font-bold'>Meus Cadernos</h1>
          </div>
          <div className='flex items-center gap-4'>
            <div className='flex items-center gap-2 text-sm text-green-600 bg-green-100 px-3 py-1.5 rounded-full font-medium'>
              <Cloud className='w-4 h-4' /> Sincronizado
            </div>
            <button
              onClick={() => setIsAdding(true)}
              className='bg-stone-800 hover:bg-stone-700 text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 font-medium transition-all'
            >
              <Plus className='w-5 h-5' /> Novo Caderno
            </button>
          </div>
        </header>

        {isAdding && (
          <div className='bg-white p-6 rounded-xl shadow-md mb-8 max-w-md ring-1 ring-black/5 animate-in fade-in'>
            <h3 className='text-lg font-bold text-stone-800 mb-4'>
              Criar Novo Caderno
            </h3>
            <input
              type='text'
              placeholder='Nome da Matéria'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className='w-full border-2 border-stone-200 rounded-lg p-3 mb-4 outline-none focus:border-stone-500 font-medium'
              autoFocus
            />
            <div className='mb-6'>
              <p className='text-sm text-stone-500 mb-2 font-medium'>
                Cor da Capa:
              </p>
              <div className='flex gap-2 flex-wrap'>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full shadow-sm ${c} ${color === c ? "ring-4 ring-offset-2 ring-stone-300 scale-110" : "hover:scale-110"}`}
                  />
                ))}
              </div>
            </div>
            <div className='flex justify-end gap-3'>
              <button
                onClick={() => setIsAdding(false)}
                className='px-4 py-2 text-stone-500 hover:bg-stone-100 rounded-lg font-medium'
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                className='px-4 py-2 bg-stone-800 text-white rounded-lg font-medium shadow-sm hover:bg-stone-700'
              >
                Criar Caderno
              </button>
            </div>
          </div>
        )}

        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8'>
          {notebooks.map((notebook) => (
            <div key={notebook.id} className='relative group perspective-1000'>
              <div
                onClick={() => onOpenNotebook(notebook.id)}
                className={`w-full aspect-3/4 ${notebook.coverColor} rounded-r-2xl rounded-l-sm shadow-xl cursor-pointer transform transition-all duration-300 group-hover:-translate-y-2 group-hover:rotate-1 flex flex-col`}
                style={{
                  boxShadow:
                    "inset 12px 0 20px -10px rgba(0,0,0,0.5), 5px 15px 25px -10px rgba(0,0,0,0.3)",
                }}
              >
                <div className='mt-12 mx-6 bg-[#f8f5ee] p-4 rounded-sm shadow-sm border border-stone-200 flex-1 max-h-32 flex flex-col justify-center items-center text-center'>
                  <p className='text-xs text-stone-500 font-mono uppercase tracking-widest mb-1 border-b border-stone-300 w-full pb-1'>
                    Matéria
                  </p>
                  <h2 className='text-lg font-bold text-stone-800 font-serif leading-tight'>
                    {notebook.title}
                  </h2>
                </div>
                <div className='absolute bottom-6 right-6 text-white/70 text-sm font-mono flex items-center gap-2'>
                  <BookOpen className='w-4 h-4' /> {notebook.topics.length}{" "}
                  assuntos
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNotebook(notebook.id);
                }}
                className='absolute -top-3 -right-3 bg-red-100 text-red-600 p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200'
                title='Excluir'
              >
                <Trash2 className='w-4 h-4' />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
