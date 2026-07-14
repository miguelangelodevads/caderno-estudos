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
  ChevronUp,
  ChevronDown,
  Menu,
} from "lucide-react";
import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [mostrarLogin, setMostrarLogin] = useState(true);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Detectar iOS para mostrar instruções alternativas
    const isIosDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIos(isIosDevice);

    // Capturar o evento de instalação (Android/Chrome)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setShowInstallPrompt(false);
      }
    }
  };

  const fazerLoginComEmail = async (email, senha) => {
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (error) {
      console.error("Erro no login:", error);
      alert("Credenciais incorretas ou erro ao conectar.");
    }
  };

  const fazerCadastroComEmail = async (email, senha) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        senha,
      );
      const newUser = userCredential.user;
      // Cria um documento para o novo usuário no Firestore
      await setDoc(doc(db, "artifacts", appId, "users", newUser.uid), {
        email: newUser.email,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erro no cadastro:", error);
      alert(
        "Erro ao cadastrar. Verifique se o e-mail já está em uso ou se a senha é forte o suficiente.",
      );
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
    if (!auth || !db) return;
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
    const newNotebookRef = doc(
      collection(db, "artifacts", appId, "users", user.uid, "notebooks"),
    );
    const newNotebook = {
      id: newNotebookRef.id,
      title: newNotebookTitle,
      coverColor: newNotebookColor,
      topics: [],
    };
    try {
      await setDoc(newNotebookRef, newNotebook);
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
      id: doc(collection(db, "_")).id,
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
      if (activeTopicId === id)
        setActiveTopicId(updatedTopics.length > 0 ? updatedTopics[0].id : null);
    } catch (error) {
      console.error("Erro ao deletar assunto:", error);
    }
  };

  const handleMoveTopic = async (index, direction) => {
    if (!activeNotebook || !user || !db) return;
    const topics = [...activeNotebook.topics];
    if (direction === "up" && index > 0) {
      [topics[index - 1], topics[index]] = [topics[index], topics[index - 1]];
    } else if (direction === "down" && index < topics.length - 1) {
      [topics[index + 1], topics[index]] = [topics[index], topics[index + 1]];
    } else {
      return;
    }
    const updatedNotebook = { ...activeNotebook, topics };
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
      console.error("Erro ao mover assunto:", error);
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
                id: doc(collection(db, "_")).id,
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
    if (notebook && notebook.topics.length > 0)
      setActiveTopicId(notebook.topics[0].id);
    else setActiveTopicId(null);
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
    return (
      <AreaLogin
        aoFazerLogin={fazerLoginComEmail}
        aoFazerCadastro={fazerCadastroComEmail}
      />
    );
  }

  // --- Renderização da Estante (Home) ---
  if (activeNotebookId === null) {
    return (
      <div className='min-h-screen bg-[#efebe1] p-4 sm:p-8 font-sans text-slate-800'>
        <div className='max-w-6xl mx-auto'>
          {/* Cabeçalho da Estante - Responsivo */}
          <header className='mb-8 sm:mb-12 flex flex-col md:flex-row md:items-center justify-between border-b-2 border-stone-300 pb-4 gap-4'>
            <div className='flex items-center gap-3 text-stone-800'>
              <Library className='w-8 h-8' />
              <h1 className='text-2xl sm:text-3xl font-serif font-bold'>
                Os Meus Cadernos
              </h1>
            </div>

            <div className='flex items-center flex-wrap gap-2 sm:gap-4'>
              {db ? (
                <div className='flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-green-600 bg-green-100 px-3 py-1.5 rounded-full font-medium'>
                  <Cloud className='w-4 h-4' /> Nuvem Ativa
                </div>
              ) : (
                <div className='flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-red-600 bg-red-100 px-3 py-1.5 rounded-full font-medium'>
                  <Cloud className='w-4 h-4' /> Offline
                </div>
              )}

              <button
                onClick={fazerLogout}
                className='text-stone-500 hover:text-stone-800 p-2 rounded-full hover:bg-stone-200 transition-colors ml-auto md:ml-0'
                title='Terminar Sessão'
              >
                <LogOut className='w-5 h-5' />
              </button>

              <button
                onClick={() => setIsAddingNotebook(true)}
                className='bg-stone-800 hover:bg-stone-700 text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg shadow-sm flex items-center gap-2 text-sm sm:text-base font-medium transition-all w-full md:w-auto justify-center'
              >
                <Plus className='w-5 h-5' /> Novo Caderno
              </button>
            </div>
          </header>

          {isAddingNotebook && (
            <div className='bg-white p-6 rounded-xl shadow-md mb-8 max-w-md ring-1 ring-black/5 animate-in fade-in slide-in-from-top-4 w-full'>
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

          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8'>
            {notebooks.map((notebook) => (
              <div
                key={notebook.id}
                className='relative group perspective-1000 w-full max-w-70 mx-auto sm:max-w-none'
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
                  <div className='mt-8 sm:mt-12 mx-4 sm:mx-6 bg-[#f8f5ee] p-3 sm:p-4 rounded-sm shadow-sm border border-stone-200 flex-1 max-h-24 sm:max-h-32 flex flex-col justify-center items-center text-center'>
                    <p className='text-[10px] sm:text-xs text-stone-500 font-mono uppercase tracking-widest mb-1 border-b border-stone-300 w-full pb-1'>
                      Matéria
                    </p>
                    <h2 className='text-base sm:text-lg font-bold text-stone-800 font-serif leading-tight'>
                      {notebook.title}
                    </h2>
                  </div>
                  <div className='absolute bottom-4 sm:bottom-6 right-4 sm:right-6 text-white/70 text-xs sm:text-sm font-mono flex items-center gap-1 sm:gap-2'>
                    <BookOpen className='w-3 h-3 sm:w-4 sm:h-4' />{" "}
                    {notebook.topics?.length || 0} assuntos
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNotebook(notebook.id);
                  }}
                  className='absolute -top-3 -right-3 bg-red-100 text-red-600 p-2 rounded-full shadow-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-200'
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

  // --- Renderização do Caderno Aberto (Interior) ---
  return (
    <div className='min-h-screen bg-[#e8e0d0] font-sans selection:bg-blue-200 text-slate-800 flex justify-center items-center'>
      <div
        className='w-full h-dvh flex flex-col md:flex-row bg-[#e8e0d0] relative overflow-hidden'
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E")`,
        }}
      >
        {/* Top Bar Mobile */}
        <div className='md:hidden bg-[#efebe1] border-b border-neutral-300 p-3 flex items-center justify-between z-30 shrink-0'>
          <div className='flex items-center gap-3'>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className='p-1.5 text-slate-600 hover:bg-black/5 rounded-md'
            >
              <Menu className='w-6 h-6' />
            </button>
            <div className='flex items-center gap-2'>
              <BookOpen className='w-5 h-5 text-amber-700' />
              <span className='font-bold text-slate-800 font-mono truncate max-w-[150px]'>
                {activeNotebook.title}
              </span>
            </div>
          </div>
          <button
            onClick={closeNotebook}
            className='p-1.5 text-slate-600 hover:bg-black/5 rounded-md'
          >
            <ArrowLeft className='w-5 h-5' />
          </button>
        </div>

        {/* Overlay do Drawer (Mobile) */}
        {isMobileMenuOpen && (
          <div
            className='fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden'
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar (Drawer em mobile, Fixa em PC) */}
        <div
          className={`
          absolute md:relative top-0 left-0 h-full w-4/5 sm:w-64 max-w-sm 
          bg-[#efebe1] md:border-r border-neutral-300 shadow-[inset_-10px_0_20px_-15px_rgba(0,0,0,0.1)] 
          flex flex-col z-50 md:z-20 shrink-0
          transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        >
          <div className='p-5 border-b border-neutral-300/50 bg-[#e3dfd6] shrink-0 flex flex-col justify-center md:h-[130px]'>
            <button
              onClick={closeNotebook}
              className='hidden md:flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm font-medium mb-3'
            >
              <ArrowLeft className='w-4 h-4' /> Voltar
            </button>
            <p className='text-xs text-slate-500 font-bold uppercase tracking-wider mb-1'>
              Caderno de
            </p>
            <h1
              className='text-lg font-bold text-slate-800 flex items-start gap-2 leading-tight w-full'
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              <BookOpen className='w-5 h-5 text-amber-700 shrink-0 mt-0.5' />
              <span className='whitespace-normal break-word'>
                {activeNotebook.title}
              </span>
            </h1>
          </div>

          <div className='flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-4 py-2 space-y-2 no-scrollbar'>
            <p className='text-xs font-bold text-slate-400 uppercase tracking-wider ml-1 mb-3 shrink-0'>
              Assuntos (Abas)
            </p>
            {activeNotebook?.topics?.map((topic, index) => (
              <div
                key={topic.id}
                onClick={() => {
                  setActiveTopicId(topic.id);
                  setIsMobileMenuOpen(false);
                  setIsAddingNote(false);
                }}
                className={`group relative flex items-center justify-between p-2 md:p-3 rounded-lg cursor-pointer transition-all duration-200 shrink-0 min-w-30 md:min-w-0 border md:border-0 border-stone-200
                  ${activeTopicId === topic.id ? "bg-white shadow-sm md:ring-1 md:ring-black/5 scale-100 md:scale-[1.02] border-stone-300" : "bg-white/50 md:bg-transparent hover:bg-white/50 text-slate-600"}
                `}
              >
                <div className='flex items-center gap-2 md:gap-3 overflow-hidden w-full'>
                  <div
                    className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${topic.color} shadow-sm shrink-0`}
                  />
                  <span
                    className={`font-medium text-sm md:text-base truncate ${activeTopicId === topic.id ? "text-slate-800" : ""}`}
                  >
                    {topic.title}
                  </span>
                </div>

                {activeTopicId === topic.id && (
                  <div className='flex items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ml-1 bg-white/80 rounded-md shadow-sm border border-slate-100 shrink-0'>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveTopic(index, "up");
                      }}
                      disabled={index === 0}
                      className='p-1 text-slate-400 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors'
                      title='Mover para cima'
                    >
                      <ChevronUp className='w-3 h-3 md:w-4 md:h-4' />
                    </button>
                    <div className='w-px h-4 bg-slate-200'></div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveTopic(index, "down");
                      }}
                      disabled={index === activeNotebook.topics.length - 1}
                      className='p-1 text-slate-400 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors'
                      title='Mover para baixo'
                    >
                      <ChevronDown className='w-3 h-3 md:w-4 md:h-4' />
                    </button>
                    <div className='w-px h-4 bg-slate-200'></div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTopic(topic.id);
                      }}
                      className='p-1 text-slate-400 hover:text-red-500 transition-colors'
                      title='Excluir Assunto'
                    >
                      <Trash2 className='w-3 h-3 md:w-4 md:h-4' />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isAddingTopic ? (
              <div className='bg-white p-3 rounded-lg shadow-sm ring-1 ring-blue-400/50 space-y-3 mt-0 md:mt-4 shrink-0 min-w-45 md:min-w-0'>
                <input
                  type='text'
                  placeholder='Nome...'
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  className='w-full bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none text-sm font-medium pb-1'
                  autoFocus
                />
                <div className='flex gap-1 flex-wrap justify-center'>
                  {/* Mostramos menos cores no mobile para caber */}
                  {TOPIC_COLORS.slice(0, 4).map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewTopicColor(c)}
                      className={`w-4 h-4 md:w-5 md:h-5 rounded-full ${c} ${newTopicColor === c ? "ring-2 ring-offset-1 ring-slate-400" : "opacity-70 hover:opacity-100"}`}
                    />
                  ))}
                </div>
                <div className='flex justify-end gap-2 pt-1'>
                  <button
                    onClick={() => setIsAddingTopic(false)}
                    className='p-1 text-slate-400 hover:text-slate-600'
                  >
                    <X className='w-3 h-3 md:w-4 md:h-4' />
                  </button>
                  <button
                    onClick={handleAddTopic}
                    className='p-1 text-blue-500 hover:text-blue-600'
                  >
                    <Check className='w-3 h-3 md:w-4 md:h-4' />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingTopic(true)}
                className='shrink-0 min-w-30 md:min-w-0 mt-0 md:mt-2 flex items-center justify-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-white/40 border border-dashed border-slate-300 rounded-lg transition-colors'
              >
                <Plus className='w-3 h-3 md:w-4 md:h-4' /> Novo
              </button>
            )}
          </div>
        </div>

        {/* Área Principal (Página do Caderno) */}
        <div className='flex-1 flex flex-col relative z-10 overflow-hidden'>
          {activeTopic ? (
            <>
              {/* Header Edge-to-Edge */}
              <header className='bg-[#e3dfd6] p-4 sm:p-6 md:px-12 md:py-0 border-b border-neutral-300/50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-0 z-20 shrink-0 md:h-[130px]'>
                <div>
                  <div className='flex items-center gap-2'>
                    <Bookmark
                      className={`w-5 h-5 md:w-6 md:h-6 text-${activeTopic.color.split("-")[1]}-500 shrink-0`}
                    />
                    <h2 className='text-2xl md:text-3xl font-serif font-bold text-slate-800 tracking-tight break-word'>
                      {activeTopic.title}
                    </h2>
                  </div>
                  <p className='text-xs md:text-sm text-slate-500 font-mono flex items-center gap-1 md:gap-2 mt-2'>
                    <Cloud className='w-3 h-3 md:w-4 md:h-4 text-green-500' />{" "}
                    Nuvem Atualizada
                  </p>
                </div>
                {!isAddingNote && (
                  <button
                    onClick={() => setIsAddingNote(true)}
                    className='bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-lg shadow-sm flex items-center justify-center gap-2 text-sm font-medium transition-all w-full sm:w-auto'
                  >
                    <Plus className='w-4 h-4' /> Adicionar Aula
                  </button>
                )}
              </header>

              {/* Lined Paper Area */}
              <div className='flex-1 relative overflow-y-auto bg-[#f0e9da]'>
                <div
                  className='relative min-h-full px-4 sm:px-6 md:pl-16 md:pr-12 pt-8 pb-10'
                  style={{
                    lineHeight: "2rem",
                    backgroundImage:
                      "linear-gradient(to bottom, transparent calc(100% - 1px), rgba(60, 60, 60, 0.4) calc(100% - 1px), rgba(60, 60, 60, 0.4) 100%)",
                    backgroundSize: "100% 2rem",
                    backgroundPosition: "0 1.8rem",
                  }}
                >
                  <div className='absolute left-4 sm:left-8 md:left-16 top-0 bottom-0 w-px md:w-0.5 bg-red-400/40 z-0'></div>
                  <div className='max-w-5xl pl-1 md:pl-2 relative z-10'>
                    {isAddingNote ? (
                      <div className='bg-white/90 backdrop-blur-sm p-4 md:p-6 rounded-xl shadow-lg ring-1 ring-black/5 mb-8 md:mb-10'>
                        <h3 className='text-base md:text-lg font-medium text-slate-800 mb-4 font-serif'>
                          {editingNoteId ? "Editar Anotação" : "Nova Anotação"}
                        </h3>
                        <div className='space-y-4'>
                          <input
                            type='text'
                            placeholder='Título da Aula'
                            value={noteForm.title}
                            onChange={(e) =>
                              setNoteForm({
                                ...noteForm,
                                title: e.target.value,
                              })
                            }
                            className='w-full text-base md:text-lg bg-transparent border-b-2 border-slate-200 focus:border-blue-400 outline-none pb-2 font-medium'
                          />
                          <textarea
                            placeholder='Escreva os seus resumos aqui...'
                            value={noteForm.content}
                            onChange={(e) =>
                              setNoteForm({
                                ...noteForm,
                                content: e.target.value,
                              })
                            }
                            className='w-full h-32 md:h-48 bg-transparent border border-slate-200 focus:border-blue-400 rounded-lg p-3 outline-none resize-none text-slate-700'
                            style={{
                              lineHeight: "2rem",
                              fontFamily: "'Caveat', cursive",
                              fontSize: "1.3rem",
                            }}
                          />
                          <div className='flex justify-end gap-2 md:gap-3 pt-2'>
                            <button
                              onClick={() => {
                                setIsAddingNote(false);
                                setEditingNoteId(null);
                                setNoteForm({ title: "", content: "" });
                              }}
                              className='px-3 md:px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-md text-xs md:text-sm font-medium transition-colors'
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={handleSaveNote}
                              className='px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs md:text-sm font-medium shadow-sm transition-colors'
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {activeTopic.notes?.length === 0 ? (
                          <div className='text-center py-12 md:py-20 opacity-50 flex flex-col items-center'>
                            <Edit2 className='w-10 h-10 md:w-12 md:h-12 mb-4 text-slate-400' />
                            <p className='text-base md:text-lg font-serif'>
                              Nenhuma anotação neste assunto ainda.
                            </p>
                          </div>
                        ) : (
                          activeTopic.notes?.map((note, index) => (
                            <article
                              key={note.id}
                              className='group relative pr-2 md:pr-4'
                              style={{
                                marginBottom:
                                  index < activeTopic.notes.length - 1
                                    ? "4rem"
                                    : "0",
                              }}
                            >
                              <div className='absolute -left-3 md:-left-4 top-1 bottom-0 w-0.5 md:w-1 bg-linear-to-b from-transparent via-yellow-300/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity'></div>

                              <div
                                className='flex flex-row justify-between items-start gap-2'
                                style={{ lineHeight: "2rem" }}
                              >
                                <h3
                                  className='text-lg md:text-xl font-bold text-slate-800 font-serif flex items-center gap-2'
                                  style={{ lineHeight: "2rem" }}
                                >
                                  <span className='text-xs md:text-sm font-mono text-slate-400 bg-slate-100 px-1.5 md:px-2 py-0.5 rounded'>
                                    #{index + 1}
                                  </span>
                                  {note.title}
                                </h3>
                                <div className='flex self-start opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/80 rounded-md shadow-sm border border-slate-100'>
                                  <button
                                    onClick={() => handleEditNote(note)}
                                    className='p-1.5 md:p-2 text-slate-400 hover:text-blue-500 transition-colors'
                                  >
                                    <Edit2 className='w-3 h-3 md:w-4 md:h-4' />
                                  </button>
                                  <div className='w-px bg-slate-200'></div>
                                  <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className='p-1.5 md:p-2 text-slate-400 hover:text-red-500 transition-colors'
                                  >
                                    <Trash2 className='w-3 h-3 md:w-4 md:h-4' />
                                  </button>
                                </div>
                              </div>

                              <div
                                className='text-slate-700 whitespace-pre-wrap font-medium'
                                style={{
                                  lineHeight: "2rem",
                                  textShadow: "0 1px 0 rgba(255,255,255,0.5)",
                                  fontFamily: "'Caveat', cursive",
                                  fontSize: "1.3rem", // Tamanho ligeiramente menor em mobile para caber melhor
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
                </div>
              </div>
            </>
          ) : (
            <div className='flex-1 flex flex-col items-center justify-center bg-[#f0e9da] min-h-full text-slate-400 opacity-50 p-8'>
              <BookOpen className='w-16 h-16 mb-4' />
              <p className='text-xl font-serif'>
                Selecione ou crie um assunto.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PWA Install Prompt */}
      {showInstallPrompt && (
        <div className='fixed bottom-0 left-0 right-0 p-4 md:p-6 z-[100] flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-300'>
          <div className='bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 max-w-lg w-full'>
            <div className='bg-blue-100 p-3 rounded-xl shrink-0'>
              <BookOpen className='w-6 h-6 text-blue-600' />
            </div>
            <div className='flex-1 text-center sm:text-left'>
              <h3 className='font-bold text-slate-800 text-lg'>Instalar App</h3>
              <p className='text-slate-600 text-sm'>
                Adicione o Caderno de Estudos ao ecrã inicial do seu telemóvel para um acesso mais rápido!
              </p>
            </div>
            <div className='flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0'>
              <button
                onClick={() => setShowInstallPrompt(false)}
                className='flex-1 sm:flex-none px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors'
              >
                Agora não
              </button>
              <button
                onClick={handleInstallClick}
                className='flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors'
              >
                Instalar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Instructions (since iOS doesn't support the prompt API properly) */}
      {isIos && !window.matchMedia('(display-mode: standalone)').matches && (
        <div className='fixed bottom-0 left-0 right-0 p-4 z-[100] md:hidden'>
          <div className='bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl p-3 flex items-start gap-3 text-sm'>
            <div className='mt-0.5 text-blue-500'>
              <Bookmark className='w-5 h-5' />
            </div>
            <p className='text-slate-700 leading-tight'>
              Para instalar no iOS: toque em <strong className='text-slate-900'>Partilhar</strong> e depois em <strong className='text-slate-900'>"Adicionar ao Ecrã Principal"</strong>.
            </p>
            <button onClick={() => setIsIos(false)} className='p-1 text-slate-400 shrink-0 ml-auto'>
              <X className='w-4 h-4' />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
