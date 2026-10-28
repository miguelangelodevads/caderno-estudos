import {ArrowUp, ArrowDown, Edit2, Trash2} from "lucide-react";

export default function NoteActions({index, count, title, onMove, onEdit, onDelete}) {
  return (<div className='note-actions flex self-start opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/80 rounded-md shadow-sm border border-slate-100'>
    {index > 0 && (
      <>
        <button
          onClick={() =>
            onMove(index, "up")
          }
          className='p-1.5 md:p-2 text-slate-400 hover:text-blue-500 transition-colors'
          title='Mover para cima'
        >
          <ArrowUp className='w-3 h-3 md:w-4 md:h-4' />
        </button>
        <div className='w-px bg-slate-200'></div>
      </>
    )}
    {index < count - 1 && (
      <>
        <button
          onClick={() =>
            onMove(index, "down")
          }
          className='p-1.5 md:p-2 text-slate-400 hover:text-blue-500 transition-colors'
          title='Mover para baixo'
        >
          <ArrowDown className='w-3 h-3 md:w-4 md:h-4' />
        </button>
        <div className='w-px bg-slate-200'></div>
      </>
    )}
    <button
      onClick={() => onEdit()}
      aria-label={`Editar título ${title}`} title='Editar título'
      className='p-1.5 md:p-2 text-slate-400 hover:text-blue-500 transition-colors'
    >
      <Edit2 className='w-3 h-3 md:w-4 md:h-4' />
    </button>
    <div className='w-px bg-slate-200'></div>
    <button
      onClick={() => onDelete()}
      aria-label={`Excluir anotação ${title}`} title='Excluir anotação'
      className='p-1.5 md:p-2 text-slate-400 hover:text-red-500 transition-colors'
    >
      <Trash2 className='w-3 h-3 md:w-4 md:h-4' />
    </button>
  </div>);
}
