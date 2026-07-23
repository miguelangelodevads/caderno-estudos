import { useState } from "react";
import {
  Plus,
  Trash2,
  BookOpen,
  Edit2,
  Check,
  X,
  Bookmark,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

const TOPIC_COLORS = [
  "bg-blue-400",
  "bg-red-400",
  "bg-green-400",
  "bg-yellow-400",
  "bg-purple-400",
  "bg-pink-400",
  "bg-teal-400",
  "bg-orange-400",
];

export default function Caderno({ notebook, onClose, onUpdateNotebook }) {
  const [activeTopicId, setActiveTopicId] = useState(
    notebook.topics[0]?.id || null,
  );

  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicColor, setTopicColor] = useState(TOPIC_COLORS[0]);

  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteForm, setNoteForm] = useState({ title: "", content: "" });

  const activeTopic = notebook.topics.find((t) => t.id === activeTopicId);

  const handleAddTopic = () => {
    if (!topicTitle.trim()) return;
    const newTopic = {
      id: Date.now().toString(),
      title: topicTitle,
      color: topicColor,
      notes: [],
    };
    onUpdateNotebook({ ...notebook, topics: [...notebook.topics, newTopic] });
    setActiveTopicId(newTopic.id);
    setIsAddingTopic(false);
    setTopicTitle("");
  };

  const handleDeleteTopic = (id) => {
    const newTopics = notebook.topics.filter((t) => t.id !== id);
    onUpdateNotebook({ ...notebook, topics: newTopics });
    if (activeTopicId === id) setActiveTopicId(newTopics[0]?.id || null);
  };

  const handleSaveNote = () => {
    if (!noteForm.title.trim()) return;
    const updatedTopics = notebook.topics.map((topic) => {
      if (topic.id === activeTopicId) {
        const notes = editingNoteId
          ? topic.notes.map((n) =>
              n.id === editingNoteId ? { ...n, ...noteForm } : n,
            )
          : [...topic.notes, { id: Date.now().toString(), ...noteForm }];
        return { ...topic, notes };
      }
      return topic;
    });
    onUpdateNotebook({ ...notebook, topics: updatedTopics });
    setIsAddingNote(false);
    setEditingNoteId(null);
    setNoteForm({ title: "", content: "" });
  };

  const handleDeleteNote = (noteId) => {
    const updatedTopics = notebook.topics.map((topic) => {
      if (topic.id === activeTopicId)
        return { ...topic, notes: topic.notes.filter((n) => n.id !== noteId) };
      return topic;
    });
    onUpdateNotebook({ ...notebook, topics: updatedTopics });
  };

  const handleMoveNote = (noteId, direction) => {
    const updatedTopics = notebook.topics.map((topic) => {
      if (topic.id === activeTopicId) {
        const noteIndex = topic.notes.findIndex((n) => n.id === noteId);
        if (noteIndex === -1) return topic;

        const newNotes = [...topic.notes];
        if (direction === "up" && noteIndex > 0) {
          [newNotes[noteIndex - 1], newNotes[noteIndex]] = [newNotes[noteIndex], newNotes[noteIndex - 1]];
        } else if (direction === "down" && noteIndex < newNotes.length - 1) {
          [newNotes[noteIndex + 1], newNotes[noteIndex]] = [newNotes[noteIndex], newNotes[noteIndex + 1]];
        }
        return { ...topic, notes: newNotes };
      }
      return topic;
    });
    onUpdateNotebook({ ...notebook, topics: updatedTopics });
  };

  return (
    <div className='min-h-screen bg-neutral-200 p-4 md:p-8 font-sans selection:bg-blue-200 text-slate-800 flex justify-center items-center'>
      <div className='w-full max-w-6xl h-[85vh] flex flex-col md:flex-row bg-[#f8f5ee] rounded-r-3xl shadow-2xl overflow-hidden ring-1 ring-black/5'>
        {/* Sidebar */}
        <div className='w-full md:w-64 bg-[#efebe1] md:border-r border-neutral-300 shadow-[inset_-10px_0_20px_-15px_rgba(0,0,0,0.1)] flex flex-col z-10'>
          <div className='p-5 border-b border-neutral-300/50 mb-2 bg-black/5'>
            <button
              onClick={onClose}
              className='flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm font-medium mb-4'
            >
              <ArrowLeft className='w-4 h-4' /> Voltar
            </button>
            <h1 className='text-lg font-bold text-slate-800 flex items-start gap-2 leading-tight font-mono'>
              <BookOpen className='w-5 h-5 text-amber-700 shrink-0 mt-0.5' />{" "}
              {notebook.title}
            </h1>
          </div>

          <div className='flex-1 overflow-y-auto px-4 py-2 space-y-2 no-scrollbar'>
            {notebook.topics.map((topic) => (
              <div
                key={topic.id}
                onClick={() => {
                  setActiveTopicId(topic.id);
                  setIsAddingNote(false);
                }}
                className={`group relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 ${activeTopicId === topic.id ? "bg-white shadow-sm ring-1 ring-black/5 scale-[1.02]" : "hover:bg-white/50 text-slate-600"}`}
              >
                <div className='flex items-center gap-3 overflow-hidden'>
                  <div
                    className={`w-3 h-3 rounded-full ${topic.color} shadow-sm shrink-0`}
                  />
                  <span
                    className={`font-medium truncate ${activeTopicId === topic.id ? "text-slate-800" : ""}`}
                  >
                    {topic.title}
                  </span>
                </div>
                {activeTopicId === topic.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTopic(topic.id);
                    }}
                    className='p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>
                )}
              </div>
            ))}

            {isAddingTopic ? (
              <div className='bg-white p-3 rounded-lg shadow-sm ring-1 ring-blue-400/50 space-y-3 mt-4'>
                <input
                  type='text'
                  placeholder='Nome do assunto...'
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  className='w-full bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none text-sm pb-1'
                  autoFocus
                />
                <div className='flex gap-1 flex-wrap justify-center'>
                  {TOPIC_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setTopicColor(c)}
                      className={`w-5 h-5 rounded-full ${c} ${topicColor === c ? "ring-2" : "opacity-70"}`}
                    />
                  ))}
                </div>
                <div className='flex justify-end gap-2 pt-2'>
                  <button
                    onClick={() => setIsAddingTopic(false)}
                    className='p-1 text-slate-400'
                  >
                    <X className='w-4 h-4' />
                  </button>
                  <button
                    onClick={handleAddTopic}
                    className='p-1 text-blue-500'
                  >
                    <Check className='w-4 h-4' />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingTopic(true)}
                className='w-full mt-2 flex justify-center gap-2 p-3 text-sm font-medium text-slate-500 hover:text-slate-800 border border-dashed rounded-lg'
              >
                <Plus className='w-4 h-4' /> Novo Assunto
              </button>
            )}
          </div>
        </div>

        {/* Main Area */}
        <div className='flex-1 relative overflow-y-auto bg-white p-6 md:pl-24 md:pr-12 md:py-10'>
          <div className='absolute left-8 md:left-16 top-0 bottom-0 w-0.5 bg-red-400/40 hidden md:block'></div>
          {activeTopic ? (
            <div className='max-w-3xl mx-auto relative z-10'>
              <header className='mb-8 border-b-2 border-slate-800 pb-2 flex justify-between items-end'>
                <div className='flex items-center gap-2 mb-2'>
                  <Bookmark
                    className={`w-5 h-5 text-${activeTopic.color.split("-")[1]}-500`}
                  />
                  <h2 className='text-3xl font-serif text-slate-800'>
                    {activeTopic.title}
                  </h2>
                </div>
                {!isAddingNote && (
                  <button
                    onClick={() => setIsAddingNote(true)}
                    className='bg-slate-800 text-white px-4 py-2 rounded-md text-sm flex gap-2'
                  >
                    <Plus className='w-4 h-4' /> Adicionar Aula
                  </button>
                )}
              </header>

              {isAddingNote ? (
                <div className='bg-white/90 p-6 rounded-xl shadow-lg ring-1 ring-black/5 mb-8'>
                  <h3 className='text-lg font-serif mb-4'>
                    {editingNoteId ? "Editar Anotação" : "Nova Anotação"}
                  </h3>
                  <input
                    type='text'
                    placeholder='Título da Aula'
                    value={noteForm.title}
                    onChange={(e) =>
                      setNoteForm({ ...noteForm, title: e.target.value })
                    }
                    className='w-full text-lg border-b-2 border-slate-200 pb-2 outline-none mb-4'
                  />
                  <textarea
                    placeholder='Escreva aqui...'
                    value={noteForm.content}
                    onChange={(e) =>
                      setNoteForm({ ...noteForm, content: e.target.value })
                    }
                    className='w-full h-48 border border-slate-200 rounded-lg p-3 outline-none resize-none'
                  />
                  <div className='flex justify-end gap-3 mt-4'>
                    <button
                      onClick={() => {
                        setIsAddingNote(false);
                        setEditingNoteId(null);
                        setNoteForm({ title: "", content: "" });
                      }}
                      className='px-4 py-2 text-slate-500'
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveNote}
                      className='px-4 py-2 bg-blue-600 text-white rounded-md'
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className='space-y-8'>
                  {activeTopic.notes.map((note, idx) => (
                    <article key={note.id} className='group relative'>
                      <div className='flex justify-between items-start mb-2'>
                        <h3 className='text-xl font-bold font-serif flex items-center gap-2'>
                          <span className='text-sm font-mono text-slate-400 bg-slate-100 px-2 rounded'>
                            #{idx + 1}
                          </span>{" "}
                          {note.title}
                        </h3>
                        <div className='flex opacity-0 group-hover:opacity-100 bg-slate-100 rounded-md'>
                          {idx > 0 && (
                            <button
                              onClick={() => handleMoveNote(note.id, "up")}
                              className='p-2 text-slate-500 hover:text-blue-500'
                              title='Mover para cima'
                            >
                              <ArrowUp className='w-4 h-4' />
                            </button>
                          )}
                          {idx < activeTopic.notes.length - 1 && (
                            <button
                              onClick={() => handleMoveNote(note.id, "down")}
                              className='p-2 text-slate-500 hover:text-blue-500'
                              title='Mover para baixo'
                            >
                              <ArrowDown className='w-4 h-4' />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setNoteForm({
                                title: note.title,
                                content: note.content,
                              });
                              setEditingNoteId(note.id);
                              setIsAddingNote(true);
                            }}
                            className='p-2 text-slate-500 hover:text-blue-500'
                          >
                            <Edit2 className='w-4 h-4' />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className='p-2 text-slate-500 hover:text-red-500'
                          >
                            <Trash2 className='w-4 h-4' />
                          </button>
                        </div>
                      </div>
                      <div className='text-slate-700 whitespace-pre-wrap leading-8 font-medium border-l-2 border-slate-200 pl-4'>
                        {note.content}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className='flex h-full items-center justify-center opacity-40'>
              <div className='text-center'>
                <Bookmark className='w-16 h-16 mx-auto mb-4' />
                <p className='font-serif text-xl'>Selecione um assunto</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
