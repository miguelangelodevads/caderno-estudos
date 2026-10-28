import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { BILLING_ENABLED, billingRequest } from "../utils/billingClient.js";
import { subscribeOnResume } from "../utils/resumeSubscription.js";

// Toda aprovação vem do servidor; dados de cache não aprovam uma sessão nova.
export function useBillingAccess(user, db, appId) {
  const [state, setState] = useState({ uid: null, status: "checking", error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!BILLING_ENABLED || !user || user.isAnonymous) return;
    let mounted = true;
    let serverRevision = 0;
    const publish = (active, error = "") => {
      if (mounted) setState({ uid: user.uid, status: error ? "error" : active ? "active" : "pending", error });
    };
    const unsubscribe = subscribeOnResume((isCurrent) => {
      const controller = new AbortController();
      const currentRevision = ++serverRevision;
      billingRequest(user, "/access", { signal: controller.signal }).then((result) => {
        if (isCurrent() && serverRevision === currentRevision) publish(result.active);
      }).catch((error) => {
        if (isCurrent() && serverRevision === currentRevision && error.name !== "AbortError") publish(false, error.message);
      });
      const stop = onSnapshot(doc(db, "artifacts", appId, "access", user.uid), { includeMetadataChanges: true }, (snapshot) => {
        if (!isCurrent() || snapshot.metadata.fromCache) return;
        serverRevision++;
        const access = snapshot.data();
        publish(access?.active === true && (!access.expiresAt || access.expiresAt.toMillis() > Date.now()));
      }, (error) => {
        if (isCurrent()) { serverRevision++; publish(false, error.code === "permission-denied" ? "Não foi possível consultar seu acesso. Tente novamente." : "Sem conexão para confirmar seu acesso. Tente novamente."); }
      });
      return () => { controller.abort(); stop(); };
    });
    return () => { mounted = false; unsubscribe(); };
  }, [user, db, appId, revision]);
  return {
    ...(state.uid === user?.uid ? state : { status: "checking", error: "" }),
    retry: () => setRevision((value) => value + 1),
  };
}
