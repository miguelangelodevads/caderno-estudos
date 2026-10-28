// Experimental E2EE foundation. Intentionally not imported by the application yet.
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const ITERATIONS = 600_000;
const MAX_BYTES = 700_000;

function random(size) { return crypto.getRandomValues(new Uint8Array(size)); }
function encode(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function decode(text, size) {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text) || text.length > 1_000_000) throw new Error("Formato criptografado inválido.");
  const bytes = Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
  if ((size && bytes.length !== size) || encodeChunked(bytes) !== text) throw new Error("Formato criptografado inválido.");
  return bytes;
}
function encodeChunked(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function context({ appId, uid, keyId }, purpose, documentId = "") {
  if (![appId, uid, keyId].every(v => typeof v === "string" && v.length > 0 && v.length < 256 && !v.includes("/"))) throw new Error("Identidade do cofre inválida.");
  return encoder.encode(JSON.stringify(["caderno-e2ee", 1, appId, uid, keyId, purpose, documentId]));
}
async function importAES(raw) { return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
async function passwordKey(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length < 16 || passphrase.length > 1024) throw new Error("Use uma senha do cofre com pelo menos 16 caracteres.");
  const bytes = encoder.encode(passphrase);
  try {
    const source = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey({name:"PBKDF2", hash:"SHA-256", salt, iterations:ITERATIONS}, source, {name:"AES-GCM", length:256}, false, ["encrypt", "decrypt"]);
  } finally { bytes.fill(0); }
}
async function seal(key, bytes, additionalData) {
  const iv = random(12);
  const ciphertext = await crypto.subtle.encrypt({name:"AES-GCM", iv, additionalData, tagLength:128}, key, bytes);
  return {iv:encode(iv), ciphertext:encodeChunked(new Uint8Array(ciphertext))};
}
async function open(key, envelope, additionalData) {
  if (!envelope || typeof envelope !== "object") throw new Error("Conteúdo criptografado inválido.");
  const ciphertext = decode(envelope.ciphertext);
  if (ciphertext.length < 16 || ciphertext.length > MAX_BYTES + 16) throw new Error("Conteúdo criptografado inválido.");
  try {
    return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM", iv:decode(envelope.iv,12), additionalData, tagLength:128}, key, ciphertext));
  } catch { throw new Error("Não foi possível desbloquear: chave incorreta ou conteúdo alterado."); }
}
function validateRecord(record, identity) {
  if (!record || record.version !== 1 || record.algorithm !== "AES-256-GCM" || record.kdf !== "PBKDF2-SHA-256" || record.iterations !== ITERATIONS || record.uid !== identity.uid || record.appId !== identity.appId) throw new Error("Cofre incompatível ou de outra conta.");
  context(record,"validate");
}

export async function createVault(passphrase, identity) {
  const record = {version:1, algorithm:"AES-256-GCM", kdf:"PBKDF2-SHA-256", iterations:ITERATIONS, appId:identity.appId, uid:identity.uid, keyId:crypto.randomUUID()};
  context(record,"validate");
  const salt = random(16), raw = random(32), recovery = random(32);
  try {
    const password = await passwordKey(passphrase,salt);
    const recoveryAES = await importAES(recovery);
    record.salt = encode(salt);
    record.passwordWrap = await seal(password,raw,context(record,"password-wrap"));
    record.recoveryWrap = await seal(recoveryAES,raw,context(record,"recovery-wrap"));
    return {record, key:await importAES(raw), recoveryKey:encode(recovery)};
  } finally { raw.fill(0); recovery.fill(0); }
}
export async function unlockVault(record, passphrase, identity) {
  validateRecord(record,identity);
  const password = await passwordKey(passphrase,decode(record.salt,16));
  const raw = await open(password,record.passwordWrap,context(record,"password-wrap"));
  try { return await importAES(raw); } finally { raw.fill(0); }
}
export async function recoverVault(record, recoveryKey, identity) {
  validateRecord(record,identity);
  const recovery = decode(recoveryKey,32);
  try {
    const raw = await open(await importAES(recovery),record.recoveryWrap,context(record,"recovery-wrap"));
    try { return await importAES(raw); } finally { raw.fill(0); }
  } finally { recovery.fill(0); }
}
export async function encryptNotebook(key, notebook, identity, documentId) {
  if (typeof documentId !== "string" || !documentId || documentId.length > 256 || documentId.includes("/")) throw new Error("Caderno inválido.");
  const bytes = encoder.encode(JSON.stringify(notebook));
  if (bytes.length > MAX_BYTES) throw new Error("Caderno muito grande para este formato experimental.");
  try { return {version:1, keyId:identity.keyId, ...await seal(key,bytes,context(identity,"notebook",documentId))}; }
  finally { bytes.fill(0); }
}
export async function decryptNotebook(key, envelope, identity, documentId) {
  if (envelope?.version !== 1 || envelope.keyId !== identity.keyId) throw new Error("Conteúdo incompatível com este cofre.");
  const bytes = await open(key,envelope,context(identity,"notebook",documentId));
  try { return JSON.parse(decoder.decode(bytes)); } finally { bytes.fill(0); }
}
