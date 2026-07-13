/* global __firebase_config, __app_id, __initial_auth_token */
import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  BookOpen,
  Edit2,
  Check,
  X,
  Bookmark,
  ArrowLeft,
  Library,
  Cloud,
  Loader2,
  LogOut,
} from "lucide-react";
import { initializeApp } from "firebase/app";

// Importações do Firebase atualizadas (signInAnonymously removido)
import {
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { auth as localAuth, db as localDb } from "./config/firebase.js";
import AreaLogin from "./components/AreaLogin";

const firebaseConfig =
  typeof __firebase_config !== "undefined" && __firebase_config
    ? JSON.parse(__firebase_config)
    : null;
let auth, db;
if (firebaseConfig) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  auth = localAuth;
  db = localDb;
}
const appId = typeof __app_id !== "undefined" ? __app_id : "caderno-estudos";

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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!auth);
  const [notebooks, setNotebooks] = useState([]);

  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [activeTopicId, setActiveTopicId] = useState(null);

  const [isAddingNotebook, setIsAddingNotebook] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const [newNotebookColor, setNewNotebookColor] = useState(COLORS[0]);

  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicColor, setNewTopicColor] = useState(TOPIC_COLORS[0]);

  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteForm, setNoteForm] = useState({ title: "", content: "" });

  const [mostrarLogin, setMostrarLogin] = useState(true);

  const fazerLoginComEmail = async (email, senha) => {
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (error) {
      console.error("Erro no login:", error);
      alert("Credenciais incorretas ou erro ao conectar.");
    }
  };

  const fazerLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao terminar sessão:", error);
    }
  };

  useEffect(() => {
    if (!auth || !db) {
      return;
    }

    let dbUnsubscribe = () => {};

    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (error) {
        console.error("Erro na autenticação:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      dbUnsubscribe();
      setUser(currentUser);

      if (currentUser && !currentUser.isAnonymous) {
        setMostrarLogin(false);
        setLoading(true);
        const notebooksRef = collection(
          db,
          "artifacts",
          appId,
          "users",
          currentUser.uid,
          "notebooks",
        );
        dbUnsubscribe = onSnapshot(
          notebooksRef,
          (snapshot) => {
            const loadedNotebooks = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
            setNotebooks(loadedNotebooks);
            setLoading(false);
          },
          (error) => {
            console.error("Erro ao buscar cadernos:", error);
            setLoading(false);
          },
        );
      } else {
        setNotebooks([]);
        setLoading(false);
        setMostrarLogin(true);
      }
    });
    return () => {
      unsubscribe();
      dbUnsubscribe();
    };
  }, []);

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId);
  const activeTopic = activeNotebook?.topics.find(
    (t) => t.id === activeTopicId,
  );

  const handleAddNotebook = async () => {
    if (!newNotebookTitle.trim() || !user || !db) return;
    const newId = Date.now().toString();
    const newNotebook = {
      id: newId,
      title: newNotebookTitle,
      coverColor: newNotebookColor,
      topics: [],
    };

    try {
      await setDoc(
        doc(db, "artifacts", appId, "users", user.uid, "notebooks", newId),
        newNotebook,
      );
      setIsAddingNotebook(false);
      setNewNotebookTitle("");
    } catch (error) {
      console.error("Erro ao criar caderno:", error);
    }
  };

  const handleDeleteNotebook = async (id) => {
    if (!user || !db) return;
    try {
      await deleteDoc(
        doc(db, "artifacts", appId, "users", user.uid, "notebooks", id),
      );
      if (activeNotebookId === id) closeNotebook();
    } catch (error) {
      console.error("Erro ao deletar caderno:", error);
    }
  };

  const handleAddTopic = async () => {
    if (!newTopicTitle.trim() || !activeNotebookId || !user || !db) return;

    const newTopic = {
      id: Date.now().toString(),
      title: newTopicTitle,
      color: newTopicColor,
      notes: [],
    };

    const updatedNotebook = {
      ...activeNotebook,
      topics: [...activeNotebook.topics, newTopic],
    };

    try {
      await setDoc(
        doc(
          db,
          "artifacts",
          appId,
          "users",
          user.uid,
          "notebooks",
          activeNotebookId,
        ),
        updatedNotebook,
      );
      setActiveTopicId(newTopic.id);
      setIsAddingTopic(false);
      setNewTopicTitle("");
    } catch (error) {
      console.error("Erro ao adicionar assunto:", error);
    }
  };

  const handleDeleteTopic = async (id) => {
    if (!activeNotebook || !user || !db) return;

    const updatedTopics = activeNotebook.topics.filter((t) => t.id !== id);
    const updatedNotebook = { ...activeNotebook, topics: updatedTopics };

    try {
      await setDoc(
        doc(
          db,
          "artifacts",
          appId,
          "users",
          user.uid,
          "notebooks",
          activeNotebookId,
        ),
        updatedNotebook,
      );
      if (activeTopicId === id) {
        setActiveTopicId(updatedTopics.length > 0 ? updatedTopics[0].id : null);
      }
    } catch (error) {
      console.error("Erro ao deletar assunto:", error);
    }
  };

  const handleSaveNote = async () => {
    if (!noteForm.title.trim() || !activeNotebook || !user || !db) return;

    const updatedTopics = activeNotebook.topics.map((topic) => {
      if (topic.id === activeTopicId) {
        if (editingNoteId) {
          return {
            ...topic,
            notes: topic.notes.map((note) =>
              note.id === editingNoteId
                ? { ...note, title: noteForm.title, content: noteForm.content }
                : note,
            ),
          };
        } else {
          return {
            ...topic,
            notes: [
              ...topic.notes,
              {
                id: Date.now().toString(),
                title: noteForm.title,
                content: noteForm.content,
              },
            ],
          };
        }
      }
      return topic;
    });

    const updatedNotebook = { ...activeNotebook, topics: updatedTopics };

    try {
      await setDoc(
        doc(
          db,
          "artifacts",
          appId,
          "users",
          user.uid,
          "notebooks",
          activeNotebookId,
        ),
        updatedNotebook,
      );
      setIsAddingNote(false);
      setEditingNoteId(null);
      setNoteForm({ title: "", content: "" });
    } catch (error) {
      console.error("Erro ao salvar anotação:", error);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!activeNotebook || !user || !db) return;

    const updatedTopics = activeNotebook.topics.map((topic) => {
      if (topic.id === activeTopicId) {
        return {
          ...topic,
          notes: topic.notes.filter((note) => note.id !== noteId),
        };
      }
      return topic;
    });

    const updatedNotebook = { ...activeNotebook, topics: updatedTopics };

    try {
      await setDoc(
        doc(
          db,
          "artifacts",
          appId,
          "users",
          user.uid,
          "notebooks",
          activeNotebookId,
        ),
        updatedNotebook,
      );
    } catch (error) {
      console.error("Erro ao deletar anotação:", error);
    }
  };

  const handleEditNote = (note) => {
    setNoteForm({ title: note.title, content: note.content });
    setEditingNoteId(note.id);
    setIsAddingNote(true);
  };

  const openNotebook = (id) => {
    setActiveNotebookId(id);
    const notebook = notebooks.find((n) => n.id === id);
    if (notebook && notebook.topics.length > 0) {
      setActiveTopicId(notebook.topics[0].id);
    } else {
      setActiveTopicId(null);
    }
  };

  const closeNotebook = () => {
    setActiveNotebookId(null);
    setActiveTopicId(null);
    setIsAddingNote(false);
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-stone-100 flex flex-col items-center justify-center text-stone-500'>
        <Loader2 className='w-10 h-10 animate-spin mb-4' />
        <p className='font-serif text-lg'>A carregar os seus cadernos...</p>
      </div>
    );
  }

  if (mostrarLogin) {
    return <AreaLogin aoFazerLogin={fazerLoginComEmail} />;
  }

  if (activeNotebookId === null) {
    return (
      <div className='min-h-screen bg-stone-100 p-8 font-sans'>
        <div className='max-w-6xl mx-auto'>
          <header className='mb-12 flex flex-col md:flex-row md:items-center justify-between border-b-2 border-stone-300 pb-4 gap-4'>
            <div className='flex items-center gap-3 text-stone-800'>
              <Library className='w-8 h-8' />
              <h1 className='text-3xl font-serif font-bold'>
                Os Meus Cadernos
              </h1>
            </div>
            <div className='flex items-center gap-4'>
              {db ? (
                <div className='flex items-center gap-2 text-sm text-green-600 bg-green-100 px-3 py-1.5 rounded-full font-medium'>
                  <Cloud className='w-4 h-4' /> Nuvem Ativa
                </div>
              ) : (
                <div className='flex items-center gap-2 text-sm text-red-600 bg-red-100 px-3 py-1.5 rounded-full font-medium'>
                  <Cloud className='w-4 h-4' /> Offline
                </div>
              )}

              <button
                onClick={fazerLogout}
                className='text-stone-500 hover:text-stone-800 p-2 rounded-full hover:bg-stone-200 transition-colors'
                title='Terminar Sessão'
              >
                <LogOut className='w-5 h-5' />
              </button>

              <button
                onClick={() => setIsAddingNotebook(true)}
                className='bg-stone-800 hover:bg-stone-700 text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 font-medium transition-all'
              >
                <Plus className='w-5 h-5' /> Novo Caderno
              </button>
            </div>
          </header>

          {isAddingNotebook && (
            <div className='bg-white p-6 rounded-xl shadow-md mb-8 max-w-md ring-1 ring-black/5 animate-in fade-in slide-in-from-top-4'>
              <h3 className='text-lg font-bold text-stone-800 mb-4'>
                Criar Novo Caderno
              </h3>
              <input
                type='text'
                placeholder='Nome da Matéria (ex: Matemática)'
                value={newNotebookTitle}
                onChange={(e) => setNewNotebookTitle(e.target.value)}
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
                      onClick={() => setNewNotebookColor(c)}
                      className={`w-8 h-8 rounded-full shadow-sm ${c} ${newNotebookColor === c ? "ring-4 ring-offset-2 ring-stone-300 scale-110" : "hover:scale-110 transition-transform"}`}
                    />
                  ))}
                </div>
              </div>
              <div className='flex justify-end gap-3'>
                <button
                  onClick={() => setIsAddingNotebook(false)}
                  className='px-4 py-2 text-stone-500 hover:bg-stone-100 rounded-lg font-medium'
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddNotebook}
                  className='px-4 py-2 bg-stone-800 text-white rounded-lg font-medium shadow-sm hover:bg-stone-700'
                >
                  Criar Caderno
                </button>
              </div>
            </div>
          )}

          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8'>
            {notebooks.map((notebook) => (
              <div
                key={notebook.id}
                className='relative group perspective-1000'
              >
                <div
                  onClick={() => openNotebook(notebook.id)}
                  className={`w-full aspect-3/4 ${notebook.coverColor} rounded-r-2xl rounded-l-sm shadow-xl cursor-pointer transform transition-all duration-300 group-hover:-translate-y-2 group-hover:rotate-1 flex flex-col`}
                  style={{
                    boxShadow:
                      "inset 12px 0 20px -10px rgba(0,0,0,0.5), 5px 15px 25px -10px rgba(0,0,0,0.3)",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E")`,
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
                    <BookOpen className='w-4 h-4' />{" "}
                    {notebook.topics?.length || 0} assuntos
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNotebook(notebook.id);
                  }}
                  className='absolute -top-3 -right-3 bg-red-100 text-red-600 p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200'
                  title='Excluir Caderno'
                >
                  <Trash2 className='w-4 h-4' />
                </button>
              </div>
            ))}

            {notebooks.length === 0 && !isAddingNotebook && (
              <div className='col-span-full text-center py-20 text-stone-400'>
                <Library className='w-16 h-16 mx-auto mb-4 opacity-50' />
                <p className='text-xl font-serif'>A sua estante está vazia.</p>
                <p>Crie o seu primeiro caderno para começar!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-neutral-200 p-4 md:p-8 font-sans selection:bg-blue-200 text-slate-800 flex justify-center items-center'>
      <div
        className='w-full max-w-6xl h-[85vh] flex flex-col md:flex-row bg-[#e8e0d0] rounded-3xl shadow-2xl relative overflow-hidden ring-1 ring-black/5'
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E")`,
        }}
      >
        <div className='w-full md:w-64 bg-[#efebe1] md:border-r border-neutral-300 shadow-[inset_-10px_0_20px_-15px_rgba(0,0,0,0.1)] flex flex-col z-10 relative'>
          <div className='p-5 border-b border-neutral-300/50 mb-2 bg-black/5'>
            <button
              onClick={closeNotebook}
              className='flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm font-medium mb-4'
            >
              <ArrowLeft className='w-4 h-4' /> Voltar
            </button>
            <p className='text-xs text-slate-500 font-bold uppercase tracking-wider mb-1'>
              Caderno de
            </p>
            <h1
              className='text-lg font-bold text-slate-800 flex items-start gap-2 leading-tight'
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              <BookOpen className='w-5 h-5 text-amber-700 shrink-0 mt-0.5' />
              {activeNotebook?.title}
            </h1>
          </div>

          <div className='flex-1 overflow-y-auto px-4 py-2 space-y-2 no-scrollbar'>
            <p className='text-xs font-bold text-slate-400 uppercase tracking-wider ml-1 mb-3'>
              Assuntos (Abas)
            </p>
            {activeNotebook?.topics?.map((topic) => (
              <div
                key={topic.id}
                onClick={() => {
                  setActiveTopicId(topic.id);
                  setIsAddingNote(false);
                }}
                className={`group relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200
                  ${activeTopicId === topic.id ? "bg-white shadow-sm ring-1 ring-black/5 scale-[1.02]" : "hover:bg-white/50 text-slate-600"}
                `}
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
                    className='p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity'
                    title='Excluir Assunto'
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
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  className='w-full bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none text-sm font-medium pb-1'
                  autoFocus
                />
                <div className='flex gap-1 flex-wrap justify-center'>
                  {TOPIC_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewTopicColor(c)}
                      className={`w-5 h-5 rounded-full ${c} ${newTopicColor === c ? "ring-2 ring-offset-2 ring-slate-400" : "opacity-70 hover:opacity-100"}`}
                    />
                  ))}
                </div>
                <div className='flex justify-end gap-2 pt-2'>
                  <button
                    onClick={() => setIsAddingTopic(false)}
                    className='p-1 text-slate-400 hover:text-slate-600'
                  >
                    <X className='w-4 h-4' />
                  </button>
                  <button
                    onClick={handleAddTopic}
                    className='p-1 text-blue-500 hover:text-blue-600'
                  >
                    <Check className='w-4 h-4' />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingTopic(true)}
                className='w-full mt-2 flex items-center justify-center gap-2 p-3 text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-white/40 border border-dashed border-slate-300 rounded-lg transition-colors'
              >
                <Plus className='w-4 h-4' /> Novo Assunto
              </button>
            )}
          </div>
        </div>

        <div className='flex-1 relative overflow-y-auto z-10'>
          <div
            className='relative z-10 p-6 md:pl-16 md:pr-12 md:pt-16 md:pb-10 min-h-full bg-[#f0e9da]'
            style={{
              lineHeight: "2.5rem",
              backgroundImage:
                "linear-gradient(to bottom, transparent calc(100% - 1px), rgba(60, 60, 60, 0.4) calc(100% - 1px), rgba(60, 60, 60, 0.4) 100%)",
              backgroundSize: "100% 2.5rem",
              backgroundPosition: "0 2.3rem",
            }}
          >
            <div className='absolute left-8 md:left-16 top-0 bottom-0 w-0.5 bg-red-400/40 z-0 hidden md:block'></div>
            {activeTopic ? (
              <div className='max-w-3xl mx-auto'>
                <header
                  className='mb-10 border-b-2 border-slate-800 pb-2 flex justify-between items-end'
                  style={{ lineHeight: "2.5rem" }}
                >
                  <div>
                    <div
                      className='flex items-center gap-2'
                      style={{ lineHeight: "2.5rem" }}
                    >
                      <Bookmark
                        className={`w-5 h-5 text-${activeTopic.color.split("-")[1]}-500`}
                      />
                      <h2 className='text-3xl font-serif text-slate-800 tracking-tight'>
                        {activeTopic.title}
                      </h2>
                    </div>
                    <p className='text-sm text-slate-500 font-mono flex items-center gap-2'>
                      <Cloud className='w-4 h-4 text-green-500' /> Nuvem
                      Atualizada
                    </p>
                  </div>
                  {!isAddingNote && (
                    <button
                      onClick={() => setIsAddingNote(true)}
                      className='bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-md shadow-sm flex items-center gap-2 text-sm font-medium transition-all'
                    >
                      <Plus className='w-4 h-4' /> Adicionar Aula
                    </button>
                  )}
                </header>

                {isAddingNote ? (
                  <div className='bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow-lg ring-1 ring-black/5 mb-10'>
                    <h3 className='text-lg font-medium text-slate-800 mb-4 font-serif'>
                      {editingNoteId ? "Editar Anotação" : "Nova Anotação"}
                    </h3>
                    <div className='space-y-4'>
                      <input
                        type='text'
                        placeholder='Título da Aula (ex: Aula 1: Introdução)'
                        value={noteForm.title}
                        onChange={(e) =>
                          setNoteForm({ ...noteForm, title: e.target.value })
                        }
                        className='w-full text-lg bg-transparent border-b-2 border-slate-200 focus:border-blue-400 outline-none pb-2 font-medium'
                      />
                      <textarea
                        placeholder='Escreva os seus resumos, tópicos e notas importantes aqui...'
                        value={noteForm.content}
                        onChange={(e) =>
                          setNoteForm({ ...noteForm, content: e.target.value })
                        }
                        className='w-full h-48 bg-transparent border border-slate-200 focus:border-blue-400 rounded-lg p-3 outline-none resize-none text-slate-700'
                        style={{
                          lineHeight: "2.5rem",
                          fontFamily: "'Caveat', cursive",
                          fontSize: "1.5rem",
                        }}
                      />
                      <div className='flex justify-end gap-3 pt-2'>
                        <button
                          onClick={() => {
                            setIsAddingNote(false);
                            setEditingNoteId(null);
                            setNoteForm({ title: "", content: "" });
                          }}
                          className='px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-md text-sm font-medium transition-colors'
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveNote}
                          className='px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm transition-colors'
                        >
                          Salvar na Nuvem
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {activeTopic.notes?.length === 0 ? (
                      <div className='text-center py-20 opacity-50 flex flex-col items-center'>
                        <Edit2 className='w-12 h-12 mb-4 text-slate-400' />
                        <p className='text-lg font-serif'>
                          Nenhuma anotação neste assunto ainda.
                        </p>
                        <p className='text-sm'>
                          Clique em "Adicionar Aula" para começar.
                        </p>
                      </div>
                    ) : (
                      activeTopic.notes?.map((note, index) => (
                        <article
                          key={note.id}
                          className='group relative pr-4'
                          style={{
                            marginBottom:
                              index < activeTopic.notes.length - 1
                                ? "7.5rem"
                                : "0",
                          }}
                        >
                          <div className='absolute -left-4 top-1 bottom-0 w-1 bg-linear-to-b from-transparent via-yellow-300/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity'></div>

                          <div
                            className='flex justify-between items-start'
                            style={{ lineHeight: "2.5rem" }}
                          >
                            <h3
                              className='text-xl font-bold text-slate-800 font-serif flex items-center gap-2'
                              style={{ lineHeight: "2.5rem" }}
                            >
                              <span className='text-sm font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded'>
                                #{index + 1}
                              </span>
                              {note.title}
                            </h3>
                            <div className='flex opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-md shadow-sm border border-slate-100'>
                              <button
                                onClick={() => handleEditNote(note)}
                                className='p-2 text-slate-400 hover:text-blue-500 transition-colors'
                              >
                                <Edit2 className='w-4 h-4' />
                              </button>
                              <div className='w-px bg-slate-200'></div>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className='p-2 text-slate-400 hover:text-red-500 transition-colors'
                              >
                                <Trash2 className='w-4 h-4' />
                              </button>
                            </div>
                          </div>

                          <div
                            className='text-slate-700 whitespace-pre-wrap font-medium'
                            style={{
                              lineHeight: "2.5rem",
                              textShadow: "0 1px 0 rgba(255,255,255,0.5)",
                              fontFamily: "'Caveat', cursive",
                              fontSize: "1.8rem",
                            }}
                          >
                            {note.content}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className='flex h-full items-center justify-center'>
                <div className='text-center opacity-40'>
                  <Bookmark className='w-16 h-16 mx-auto mb-4' />
                  <p className='text-xl font-serif'>
                    Selecione ou crie um assunto (aba)
                  </p>
                  <p>na lateral para começar a estudar.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
