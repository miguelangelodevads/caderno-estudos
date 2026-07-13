/* global __app_id, __initial_auth_token */
import { useState, useEffect } from "react";
import {
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";

const appId = typeof __app_id !== "undefined" ? __app_id : "meu-caderno-pro";

export function useStudyData() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notebooks, setNotebooks] = useState([]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Erro na autenticação:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const notebooksRef = collection(
      db,
      "artifacts",
      appId,
      "users",
      user.uid,
      "notebooks",
    );

    const unsubscribe = onSnapshot(
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
        console.error(error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const addNotebook = async (title, color) => {
    if (!user) return;
    const newId = Date.now().toString();
    const newNotebook = { id: newId, title, coverColor: color, topics: [] };
    try {
      await setDoc(
        doc(db, "artifacts", appId, "users", user.uid, "notebooks", newId),
        newNotebook,
      );
    } catch (error) {
      console.error(error);
    }
  };

  const deleteNotebook = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(
        doc(db, "artifacts", appId, "users", user.uid, "notebooks", id),
      );
    } catch (error) {
      console.error(error);
    }
  };

  const updateNotebook = async (notebookId, updatedData) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "artifacts", appId, "users", user.uid, "notebooks", notebookId),
        updatedData,
      );
    } catch (error) {
      console.error(error);
    }
  };

  return { loading, notebooks, addNotebook, deleteNotebook, updateNotebook };
}
