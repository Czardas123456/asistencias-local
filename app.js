const DB_NAME = "mapfre-asistencias";
const DB_VERSION = 3;
const STORE = "secureRecords";
const LEGACY_STORE = "records";
const SECURITY_CONFIG_KEY = "mapfre-security-config-v1";
const KDF_ITERATIONS = 250000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_CASE_BYTES = 350 * 1024 * 1024;
const MAX_EVIDENCE_ITEMS = 45;

const form = document.querySelector("#caseForm");
const elements = {
  recordId: document.querySelector("#recordId"),
  assistanceNumber: document.querySelector("#assistanceNumber"),
  plate: document.querySelector("#plate"),
  serviceType: document.querySelector("#serviceType"),
  serviceDate: document.querySelector("#serviceDate"),
  status: document.querySelector("#status"),
  city: document.querySelector("#city"),
  location: document.querySelector("#location"),
  provider: document.querySelector("#provider"),
  contact: document.querySelector("#contact"),
  description: document.querySelector("#description"),
};

const dbNotice = document.querySelector("#dbNotice");
const totalRecords = document.querySelector("#totalRecords");
const missingTitle = document.querySelector("#missingTitle");
const missingBox = document.querySelector("#missingBox");
const missingList = document.querySelector("#missingList");
const mediaPreview = document.querySelector("#mediaPreview");
const evidenceCount = document.querySelector("#evidenceCount");
const clearEvidence = document.querySelector("#clearEvidence");
const recordsList = document.querySelector("#recordsList");
const searchQuery = document.querySelector("#searchQuery");
const continueCase = document.querySelector("#continueCase");
const startSection = document.querySelector("#startSection");
const caseWorkspace = document.querySelector("#caseWorkspace");
const activeCaseLabel = document.querySelector("#activeCaseLabel");
const autosaveStatus = document.querySelector("#autosaveStatus");
const stepNotice = document.querySelector("#stepNotice");
const stepNoticeTitle = document.querySelector("#stepNoticeTitle");
const stepNoticeText = document.querySelector("#stepNoticeText");
const shotChecklist = document.querySelector("#shotChecklist");
const flowSteps = Array.from(document.querySelectorAll(".flow-steps li"));
const wizardPanels = Array.from(document.querySelectorAll("[data-wizard-step]"));
const currentShotTitle = document.querySelector("#currentShotTitle");
const currentShotCounter = document.querySelector("#currentShotCounter");
const currentShotInstruction = document.querySelector("#currentShotInstruction");
const vehicleMask = document.querySelector("#vehicleMask");
const vehicleGuideImage = document.querySelector("#vehicleGuideImage");
const angleBadge = document.querySelector("#angleBadge");
const guidedPhotoInput = document.querySelector("#guidedPhotoInput");
const prevShot = document.querySelector("#prevShot");
const nextShot = document.querySelector("#nextShot");
const videoFinalSection = document.querySelector("#videoFinalSection");
const evidencePreviewSection = document.querySelector("#evidencePreviewSection");
const finishPhotos = document.querySelector("#finishPhotos");
const backToIdentity = document.querySelector("#backToIdentity");
const backToPhotos = document.querySelector("#backToPhotos");
const documentInput = document.querySelector("#documentInput");
const clearAllData = document.querySelector("#clearAllData");
const securityGate = document.querySelector("#securityGate");
const securityHelp = document.querySelector("#securityHelp");
const securityPin = document.querySelector("#securityPin");
const securityPinConfirm = document.querySelector("#securityPinConfirm");
const securityPinConfirmField = document.querySelector("#securityPinConfirmField");
const securityStatus = document.querySelector("#securityStatus");
const unlockApp = document.querySelector("#unlockApp");
const resetSecureApp = document.querySelector("#resetSecureApp");

let db;
let currentEvidence = [];
let cachedRecords = [];
let autosaveTimer;
let currentShotIndex = 0;
let currentWizardStep = 0;
let cryptoKey;
let securityConfig;
let setupMode = false;

const REQUIRED_SHOTS = [
  {
    id: "front-left",
    title: "Esquina delantera izquierda",
    asset: "assets/guide-photos/front-left.png",
    badge: "Frente + lateral izquierdo",
    instruction: "Ubicate a 45 grados del frente izquierdo. El vehiculo debe verse completo y ocupar casi todo el encuadre.",
  },
  {
    id: "front-right",
    title: "Esquina delantera derecha",
    asset: "assets/guide-photos/front-right.png",
    badge: "Frente + lateral derecho",
    instruction: "Cruza por el frente y toma la esquina delantera derecha. Mantén el vehiculo completo dentro de la silueta.",
  },
  {
    id: "rear-right",
    title: "Esquina trasera derecha",
    asset: "assets/guide-photos/rear-right.png",
    badge: "Trasera + lateral derecho",
    instruction: "Camina hacia atras por el lado derecho y captura la esquina trasera derecha con el vehiculo completo.",
  },
  {
    id: "rear-left",
    title: "Esquina trasera izquierda",
    asset: "assets/guide-photos/rear-left.png",
    badge: "Trasera + lateral izquierdo",
    instruction: "Cruza por la parte trasera y captura la esquina trasera izquierda. Incluye defensa, luces y lateral.",
  },
  {
    id: "plate-vin",
    title: "Placa / VIN",
    asset: "assets/guide-photos/plate-vin.png",
    badge: "Identificacion visible",
    instruction: "Acercate lo suficiente para que la placa o VIN sea legible, sin cortar los bordes.",
  },
  {
    id: "main-damage",
    title: "Daño principal",
    asset: "assets/guide-photos/main-damage.png",
    badge: "Plano medio del daño",
    instruction: "Toma el panel afectado completo. Debe entenderse donde esta ubicado el daño dentro del vehiculo.",
  },
  {
    id: "damage-detail",
    title: "Detalle del daño",
    asset: "assets/guide-photos/damage-detail.png",
    badge: "Primer plano",
    instruction: "Acercate al daño para registrar grietas, golpes, rayones o piezas comprometidas con buena luz.",
  },
  {
    id: "environment",
    title: "Entorno del evento",
    asset: "assets/guide-photos/environment.png",
    badge: "Contexto del sitio",
    instruction: "Toma una foto amplia del lugar: via, señales, posicion del vehiculo, otros actores o referencias visibles.",
  },
];

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Este navegador no permite almacenamiento local avanzado."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(LEGACY_STORE)) {
        database.deleteObjectStore(LEGACY_STORE);
      }
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function encryptRecord(record) {
  if (!cryptoKey) throw new Error("La app esta bloqueada. Ingresa el PIN.");
  const safeRecord = {
    ...record,
    evidence: await Promise.all((record.evidence || []).map(async (item) => {
      const blob = item.blob instanceof Blob ? item.blob : new Blob([], { type: item.type || "application/octet-stream" });
      const encryptedBlob = await encryptBytes(await blob.arrayBuffer());
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        size: item.size,
        lastModified: item.lastModified,
        shot: item.shot,
        shotId: item.shotId,
        kind: item.kind,
        encryptedBlob,
      };
    })),
  };
  const encryptedRecord = await encryptText(JSON.stringify(safeRecord));
  return {
    id: record.id,
    updatedAt: record.updatedAt,
    version: 1,
    encryptedRecord,
  };
}

async function decryptRecord(storedRecord) {
  if (storedRecord.encryptedRecord) {
    const json = await decryptText(storedRecord.encryptedRecord);
    const record = JSON.parse(json);
    record.evidence = await Promise.all((record.evidence || []).map(async (item) => {
      const blobBytes = await decryptBytes(item.encryptedBlob);
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        size: item.size,
        lastModified: item.lastModified,
        shot: item.shot,
        shotId: item.shotId,
        kind: item.kind,
        blob: new Blob([blobBytes], { type: item.type || "application/octet-stream" }),
      };
    }));
    return record;
  }
  return storedRecord;
}

async function saveRecord(record) {
  return new Promise((resolve, reject) => {
    encryptRecord(record)
      .then((secureRecord) => {
        const request = transaction("readwrite").put(secureRecord);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

function getAllRecords() {
  return new Promise((resolve, reject) => {
    const request = transaction().getAll();
    request.onsuccess = async () => {
      try {
        const records = await Promise.all((request.result || []).map((record) => decryptRecord(record)));
        resolve(records);
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteRecord(id) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearRecordStore() {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function requireCrypto() {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Este navegador no permite cifrado local. Abre el archivo en Chrome, Edge o Safari actualizado.");
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunkSize = 0x8000;
  for (let i = 0; i < view.length; i += chunkSize) {
    binary += String.fromCharCode(...view.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomBytes(size = 12) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${bytesToBase64(randomBytes(12)).replace(/[+/=]/g, "")}`;
}

async function deriveKey(pin, saltBase64) {
  requireCrypto();
  const pinKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(saltBase64),
      iterations: KDF_ITERATIONS,
      hash: "SHA-256",
    },
    pinKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptBytes(bytes, key = cryptoKey) {
  const iv = randomBytes();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  };
}

async function decryptBytes(payload, key = cryptoKey) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  );
  return decrypted;
}

async function encryptText(text, key = cryptoKey) {
  return encryptBytes(new TextEncoder().encode(text), key);
}

async function decryptText(payload, key = cryptoKey) {
  const bytes = await decryptBytes(payload, key);
  return new TextDecoder().decode(bytes);
}

function loadSecurityConfig() {
  const raw = localStorage.getItem(SECURITY_CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function createSecurityConfig(pin) {
  const salt = bytesToBase64(randomBytes(16));
  const key = await deriveKey(pin, salt);
  const verifier = await encryptText("mapfre-local-ok", key);
  const config = {
    version: 1,
    salt,
    verifier,
    iterations: KDF_ITERATIONS,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(SECURITY_CONFIG_KEY, JSON.stringify(config));
  return { config, key };
}

async function unlockWithPin(pin) {
  const key = await deriveKey(pin, securityConfig.salt);
  const verifier = await decryptText(securityConfig.verifier, key);
  if (verifier !== "mapfre-local-ok") throw new Error("PIN incorrecto.");
  return key;
}

function normalize(value) {
  return String(value || "").trim();
}

function normalizePlate(value) {
  return normalize(value).toUpperCase().replace(/\s+/g, "");
}

function setWizardStep(stepIndex) {
  const active = hasActiveCase();
  currentWizardStep = active ? Math.max(0, Math.min(stepIndex, 2)) : 0;
  startSection.hidden = active && currentWizardStep > 0;
  caseWorkspace.hidden = !active;

  wizardPanels.forEach((panel) => {
    const isPhotos = panel.dataset.wizardStep === "photos";
    const isComplement = panel.dataset.wizardStep === "complement";
    panel.hidden = !((currentWizardStep === 1 && isPhotos) || (currentWizardStep === 2 && isComplement));
  });

  flowSteps.forEach((step, index) => {
    step.classList.toggle("is-current", index === currentWizardStep);
    step.classList.toggle("is-done", active && index < currentWizardStep);
  });
  renderGuidedShot();
  renderStepNotice();
}

function setWorkspaceVisible(visible, stepIndex = 1) {
  if (!visible) {
    currentWizardStep = 0;
    startSection.hidden = false;
    caseWorkspace.hidden = true;
    wizardPanels.forEach((panel) => {
      panel.hidden = panel.dataset.wizardStep !== "photos";
    });
    flowSteps.forEach((step, index) => {
      step.classList.toggle("is-current", index === 0);
      step.classList.remove("is-done");
    });
    stepNotice.hidden = true;
    renderGuidedShot();
    return;
  }
  setWizardStep(stepIndex);
}

function hasActiveCase() {
  return Boolean(normalize(elements.recordId.value) && normalize(elements.assistanceNumber.value) && normalize(elements.plate.value));
}

function updateActiveCaseLabel() {
  const assistance = normalize(elements.assistanceNumber.value);
  const plate = normalizePlate(elements.plate.value);
  activeCaseLabel.textContent = assistance && plate ? `Asistencia ${assistance} · Placa ${plate}` : "Sin asistencia seleccionada";
}

function setAutosaveStatus(message, tone = "idle") {
  autosaveStatus.textContent = message;
  autosaveStatus.dataset.tone = tone;
}

function findByIdentity(assistanceNumber, plate) {
  const assistance = normalize(assistanceNumber).toUpperCase();
  const normalizedPlate = normalizePlate(plate);
  return cachedRecords.find((record) => {
    return record.assistanceNumber.toUpperCase() === assistance && record.plate === normalizedPlate;
  });
}

function isShotCompleteInEvidence(evidence = [], shot) {
  return evidence.some((item) => item.shotId === shot.id || item.shot === shot.title);
}

function getPhotoProgress(record = readForm()) {
  const evidence = record.evidence || [];
  const completed = REQUIRED_SHOTS.filter((shot) => isShotCompleteInEvidence(evidence, shot)).length;
  const firstMissingIndex = REQUIRED_SHOTS.findIndex((shot) => !isShotCompleteInEvidence(evidence, shot));
  return {
    completed,
    total: REQUIRED_SHOTS.length,
    complete: completed === REQUIRED_SHOTS.length,
    firstMissingIndex: firstMissingIndex >= 0 ? firstMissingIndex : REQUIRED_SHOTS.length - 1,
  };
}

function getDetailMissing(record = readForm()) {
  const checks = [
    ["Tipo de servicio", record.serviceType],
    ["Fecha y hora", record.serviceDate],
    ["Ciudad", record.city],
    ["Direccion / ubicacion", record.location],
    ["Prestador / responsable", record.provider],
    ["Descripcion del servicio", record.description],
  ];

  return checks.filter(([, value]) => !value).map(([label]) => label);
}

function getMissing(record = readForm()) {
  const photoProgress = getPhotoProgress(record);
  const missing = [];
  if (!photoProgress.complete) {
    missing.push(`Fotos obligatorias (${photoProgress.completed}/${photoProgress.total})`);
  }
  return missing.concat(getDetailMissing(record));
}

function getNextIncompleteStep(record = readForm()) {
  return getPhotoProgress(record).complete ? 2 : 1;
}

function getResumeMessage(record = readForm()) {
  const photoProgress = getPhotoProgress(record);
  const remainingPhotos = photoProgress.total - photoProgress.completed;
  const detailMissing = getDetailMissing(record);

  if (!photoProgress.complete) {
    const shot = REQUIRED_SHOTS[photoProgress.firstMissingIndex];
    return `Faltan ${remainingPhotos} foto${remainingPhotos === 1 ? "" : "s"}. Continua con: ${shot.title}.`;
  }

  if (detailMissing.length) {
    const visible = detailMissing.slice(0, 3).join(", ");
    const extra = detailMissing.length > 3 ? ` y ${detailMissing.length - 3} mas` : "";
    return `Fotos completas. Falta completar: ${visible}${extra}.`;
  }

  return "Caso completo. Puedes revisarlo o iniciar un nuevo registro.";
}

function focusNextPending(record = readForm()) {
  const photoProgress = getPhotoProgress(record);
  if (!photoProgress.complete) {
    vehicleMask.focus();
    return;
  }

  const fieldByMissing = {
    "Tipo de servicio": elements.serviceType,
    "Fecha y hora": elements.serviceDate,
    Ciudad: elements.city,
    "Direccion / ubicacion": elements.location,
    "Prestador / responsable": elements.provider,
    "Descripcion del servicio": elements.description,
  };
  const firstMissing = getDetailMissing(record)[0];
  (fieldByMissing[firstMissing] || elements.serviceType).focus();
}

function setStatusFromMissing(record) {
  const missing = getMissing(record);
  if (!missing.length) return "Completo";
  if (record.status === "Completo") return "En revision";
  return record.status || "Incompleto";
}

function readForm() {
  return {
    id: normalize(elements.recordId.value),
    assistanceNumber: normalize(elements.assistanceNumber.value),
    plate: normalizePlate(elements.plate.value),
    serviceType: normalize(elements.serviceType.value),
    serviceDate: normalize(elements.serviceDate.value),
    status: normalize(elements.status.value),
    city: normalize(elements.city.value),
    location: normalize(elements.location.value),
    provider: normalize(elements.provider.value),
    contact: normalize(elements.contact.value),
    description: normalize(elements.description.value),
    evidence: currentEvidence,
  };
}

function writeForm(record, stepIndex = null) {
  elements.recordId.value = record.id || "";
  elements.assistanceNumber.value = record.assistanceNumber || "";
  elements.plate.value = record.plate || "";
  elements.serviceType.value = record.serviceType || "";
  elements.serviceDate.value = record.serviceDate || "";
  elements.status.value = record.status || "Incompleto";
  elements.city.value = record.city || "";
  elements.location.value = record.location || "";
  elements.provider.value = record.provider || "";
  elements.contact.value = record.contact || "";
  elements.description.value = record.description || "";
  currentEvidence = record.evidence || [];
  const photoProgress = getPhotoProgress(record);
  currentShotIndex = photoProgress.firstMissingIndex;
  setWorkspaceVisible(Boolean(record.id), stepIndex ?? getNextIncompleteStep(record));
  updateActiveCaseLabel();
  renderEvidence();
  renderMissing();
  renderStepNotice();
}

function validateRequired() {
  const required = [
    [elements.assistanceNumber, "Ingresa el numero de asistencia."],
    [elements.plate, "Ingresa la placa."],
  ];

  let valid = true;
  required.forEach(([input, message]) => {
    const field = input.closest(".field");
    const error = document.querySelector(`[data-error-for="${input.id}"]`);
    const empty = !normalize(input.value);
    field.classList.toggle("has-error", empty);
    error.textContent = empty ? message : "";
    if (empty) valid = false;
  });

  return valid;
}

function buildRecord() {
  const formRecord = readForm();
  const now = new Date().toISOString();
  const id = formRecord.id || createId();
  const record = {
    ...formRecord,
    id,
    status: setStatusFromMissing(formRecord),
    updatedAt: now,
    createdAt: formRecord.id ? findRecord(formRecord.id)?.createdAt || now : now,
  };
  return record;
}

function findRecord(id) {
  return cachedRecords.find((record) => record.id === id);
}

function renderMissing() {
  const missing = getMissing();
  missingList.innerHTML = "";
  missing.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    missingList.append(li);
  });
  missingTitle.textContent = missing.length ? "Falta para cerrar el caso" : "Caso completo";
  missingBox.hidden = missing.length === 0;
  renderStepNotice();
}

function renderStepNotice() {
  if (!hasActiveCase()) {
    stepNotice.hidden = true;
    return;
  }

  const record = readForm();
  const photoProgress = getPhotoProgress(record);
  const detailMissing = getDetailMissing(record);
  stepNotice.hidden = false;

  if (!photoProgress.complete) {
    const remaining = photoProgress.total - photoProgress.completed;
    stepNotice.dataset.tone = "warning";
    stepNoticeTitle.textContent = "Siguiente paso: fotos";
    stepNoticeText.textContent = `Faltan ${remaining} foto${remaining === 1 ? "" : "s"} guiada${remaining === 1 ? "" : "s"}. Toma ahora: ${REQUIRED_SHOTS[photoProgress.firstMissingIndex].title}.`;
    return;
  }

  if (detailMissing.length) {
    stepNotice.dataset.tone = "warning";
    stepNoticeTitle.textContent = "Siguiente paso: informacion";
    stepNoticeText.textContent = `Las fotos estan completas. Completa: ${detailMissing.join(", ")}.`;
    return;
  }

  stepNotice.dataset.tone = "success";
  stepNoticeTitle.textContent = "Caso completo";
  stepNoticeText.textContent = "La asistencia tiene fotos y datos principales completos.";
}

function isShotComplete(shot) {
  return isShotCompleteInEvidence(currentEvidence, shot);
}

function getCompletedRequiredShots() {
  return REQUIRED_SHOTS.filter((shot) => isShotComplete(shot)).length;
}

function updateCaptureChrome() {
  const allRequiredPhotosDone = getCompletedRequiredShots() === REQUIRED_SHOTS.length;
  const isFinalPhoto = currentShotIndex === REQUIRED_SHOTS.length - 1;
  videoFinalSection.hidden = !(allRequiredPhotosDone || isFinalPhoto);
  evidencePreviewSection.hidden = currentEvidence.length === 0;
  clearEvidence.hidden = currentEvidence.length === 0;
}

function renderGuidedShot() {
  const shot = REQUIRED_SHOTS[currentShotIndex] || REQUIRED_SHOTS[0];
  if (!shot) return;

  currentShotTitle.textContent = shot.title;
  currentShotCounter.textContent = `Foto ${currentShotIndex + 1} de ${REQUIRED_SHOTS.length}`;
  currentShotInstruction.textContent = shot.instruction;
  vehicleMask.dataset.angle = shot.id;
  vehicleMask.setAttribute("aria-label", `Tomar foto: ${shot.title}`);
  vehicleGuideImage.src = shot.asset;
  vehicleGuideImage.alt = `Guia visual: ${shot.title}`;
  angleBadge.textContent = shot.badge;
  prevShot.disabled = currentShotIndex === 0;
  nextShot.textContent = currentShotIndex === REQUIRED_SHOTS.length - 1 ? "Completar informacion" : "Siguiente foto";
  updateCaptureChrome();
}

function goToNextPendingShot() {
  const nextIndex = REQUIRED_SHOTS.findIndex((shot, index) => index > currentShotIndex && !isShotComplete(shot));
  if (nextIndex >= 0) {
    currentShotIndex = nextIndex;
    renderGuidedShot();
    renderShotChecklist();
    return;
  }

  const anyPending = REQUIRED_SHOTS.findIndex((shot) => !isShotComplete(shot));
  currentShotIndex = anyPending >= 0 ? anyPending : REQUIRED_SHOTS.length - 1;
  renderGuidedShot();
  renderShotChecklist();
}

function renderShotChecklist() {
  shotChecklist.innerHTML = "";
  REQUIRED_SHOTS.forEach((shot, index) => {
    const complete = isShotComplete(shot);
    const item = document.createElement("div");
    item.className = `shot-status ${complete ? "is-complete" : ""} ${index === currentShotIndex ? "is-active" : ""}`;
    const status = document.createElement("span");
    status.textContent = complete ? "Listo" : String(index + 1).padStart(2, "0");
    const title = document.createElement("strong");
    title.textContent = shot.title;
    item.append(status, title);
    item.addEventListener("click", () => {
      currentShotIndex = index;
      renderGuidedShot();
      renderShotChecklist();
    });
    shotChecklist.append(item);
  });
}

function renderEvidence() {
  mediaPreview.innerHTML = "";
  evidenceCount.textContent = currentEvidence.length
    ? `${currentEvidence.length} evidencia${currentEvidence.length === 1 ? "" : "s"} cargada${currentEvidence.length === 1 ? "" : "s"}`
    : "Sin evidencias cargadas";
  clearEvidence.hidden = currentEvidence.length === 0;

  currentEvidence.forEach((item) => {
    const card = document.createElement("article");
    card.className = "media-item";

    const url = URL.createObjectURL(item.blob);
    const type = item.type || "";
    let media;
    if (type.startsWith("video/")) {
      media = document.createElement("video");
      media.controls = true;
      media.preload = "metadata";
      media.onloadeddata = () => URL.revokeObjectURL(url);
      media.onerror = () => URL.revokeObjectURL(url);
      media.className = "media-thumb";
      media.src = url;
    } else if (type.startsWith("image/")) {
      media = document.createElement("img");
      media.alt = item.name || "Evidencia fotografica";
      media.onload = () => URL.revokeObjectURL(url);
      media.onerror = () => URL.revokeObjectURL(url);
      media.className = "media-thumb";
      media.src = url;
    } else {
      URL.revokeObjectURL(url);
      media = document.createElement("div");
      media.className = "media-thumb document-thumb";
      media.textContent = getFileBadge(item.name, item.type);
    }

    const name = document.createElement("span");
    name.className = "media-name";
    name.textContent = item.shot ? `${item.shot} · ${item.name || "Archivo sin nombre"}` : item.name || "Archivo sin nombre";

    const button = document.createElement("button");
    button.className = "remove-media";
    button.type = "button";
    button.textContent = "Quitar";
    button.addEventListener("click", () => {
      currentEvidence = currentEvidence.filter((evidence) => evidence.id !== item.id);
      renderEvidence();
      renderMissing();
      persistActiveCase("Evidencia eliminada.");
    });

    card.append(media, name, button);
    mediaPreview.append(card);
  });
  renderShotChecklist();
  updateCaptureChrome();
}

function getFileBadge(name = "", type = "") {
  const extension = String(name).split(".").pop();
  if (extension && extension !== name) return extension.slice(0, 5).toUpperCase();
  if (type.includes("pdf")) return "PDF";
  if (type.includes("word")) return "DOC";
  if (type.includes("excel") || type.includes("spreadsheet")) return "XLS";
  return "DOC";
}

function acceptsFile(file, allowDocuments = false) {
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) return true;
  if (!allowDocuments) return false;
  const name = String(file.name || "").toLowerCase();
  return (
    file.type === "application/pdf" ||
    file.type.startsWith("text/") ||
    file.type.includes("word") ||
    file.type.includes("excel") ||
    file.type.includes("spreadsheet") ||
    [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"].some((extension) => name.endsWith(extension))
  );
}

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function getFileLimit(file, options = {}) {
  if (options.kind === "document") return MAX_DOCUMENT_BYTES;
  if (file.type.startsWith("video/")) return MAX_VIDEO_BYTES;
  if (file.type.startsWith("image/")) return MAX_IMAGE_BYTES;
  return MAX_DOCUMENT_BYTES;
}

function getEvidenceTotalBytes(evidence = currentEvidence) {
  return evidence.reduce((total, item) => total + Number(item.size || 0), 0);
}

function validateSelectedFiles(files, options = {}) {
  const accepted = [];
  const rejected = [];
  Array.from(files || []).forEach((file) => {
    if (!acceptsFile(file, Boolean(options.allowDocuments))) {
      rejected.push(`${file.name || "Archivo"}: tipo no permitido`);
      return;
    }

    const limit = getFileLimit(file, options);
    if (file.size > limit) {
      rejected.push(`${file.name || "Archivo"}: supera ${formatBytes(limit)}`);
      return;
    }

    accepted.push(file);
  });

  const remainingSlots = Math.max(0, MAX_EVIDENCE_ITEMS - currentEvidence.length);
  if (accepted.length > remainingSlots) {
    accepted.splice(remainingSlots).forEach((file) => {
      rejected.push(`${file.name || "Archivo"}: el caso ya alcanzo el limite de ${MAX_EVIDENCE_ITEMS} archivos`);
    });
  }

  let totalBytes = getEvidenceTotalBytes();
  const sizeAccepted = [];
  accepted.forEach((file) => {
    if (totalBytes + file.size > MAX_CASE_BYTES) {
      rejected.push(`${file.name || "Archivo"}: el caso supera el limite total de ${formatBytes(MAX_CASE_BYTES)}`);
      return;
    }
    totalBytes += file.size;
    sizeAccepted.push(file);
  });

  return { accepted: sizeAccepted, rejected };
}

async function addFiles(files, shot = "", options = {}) {
  if (!hasActiveCase()) {
    alert("Primero ingresa el numero de asistencia y la placa, luego toca Continuar.");
    return;
  }

  const { accepted, rejected } = validateSelectedFiles(files, options);
  if (rejected.length) {
    alert(`No se cargaron algunos archivos:\n${rejected.join("\n")}`);
  }
  if (!accepted.length) return;

  const currentShot = REQUIRED_SHOTS[currentShotIndex];
  const mapped = accepted.map((file) => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name || `evidencia-${new Date().toISOString()}`,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    shot: shot || currentShot?.title || "",
    shotId: shot || options.kind === "document" ? "" : currentShot?.id || "",
    kind: options.kind || (file.type.startsWith("image/") || file.type.startsWith("video/") ? "media" : "document"),
    blob: file,
  }));

  currentEvidence = currentEvidence.concat(mapped);
  renderEvidence();
  renderMissing();
  if (mapped.length) {
    await persistActiveCase(`${mapped.length} evidencia${mapped.length === 1 ? "" : "s"} guardada${mapped.length === 1 ? "" : "s"}.`);
    if (!shot) goToNextPendingShot();
  }
}

function renderRecords() {
  const query = normalize(searchQuery.value).toUpperCase();
  const filtered = cachedRecords
    .filter((record) => {
      if (!query) return true;
      return record.assistanceNumber.toUpperCase().includes(query) || record.plate.toUpperCase().includes(query);
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  recordsList.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "record-meta";
    empty.textContent = query ? "No hay registros que coincidan con la busqueda." : "Aun no hay registros guardados.";
    recordsList.append(empty);
    return;
  }

  filtered.forEach((record) => {
    const missing = getMissing(record);
    const card = document.createElement("article");
    card.className = "record-card";

    const content = document.createElement("div");
    const title = document.createElement("div");
    title.className = "record-title";
    title.append(`${record.assistanceNumber} · ${record.plate}`);

    const pill = document.createElement("span");
    pill.className = `pill ${missing.length ? "incomplete" : "complete"}`;
    pill.textContent = missing.length ? `${missing.length} pendiente${missing.length === 1 ? "" : "s"}` : "Completo";
    title.append(pill);

    const meta = document.createElement("div");
    meta.className = "record-meta";
    const date = record.serviceDate ? new Date(record.serviceDate).toLocaleString("es-CO") : "Sin fecha";
    meta.textContent = `${record.serviceType || "Sin tipo"} · ${date} · ${record.evidence?.length || 0} evidencia(s)`;

    const hint = document.createElement("div");
    hint.className = "record-hint";
    hint.textContent = getResumeMessage(record);
    content.append(title, meta, hint);

    const actions = document.createElement("div");
    actions.className = "record-actions";

    const open = document.createElement("button");
    open.className = "button";
    open.type = "button";
    open.textContent = missing.length ? "Continuar" : "Revisar";
    open.addEventListener("click", () => {
      writeForm(record, getNextIncompleteStep(record));
      switchView("registro");
      setAutosaveStatus(getResumeMessage(record), missing.length ? "saving" : "success");
      focusNextPending(record);
    });

    const remove = document.createElement("button");
    remove.className = "button secondary text-like-action danger-action";
    remove.type = "button";
    remove.textContent = "Eliminar";
    remove.addEventListener("click", async () => {
      const ok = window.confirm(`Eliminar la asistencia ${record.assistanceNumber} (${record.plate})?`);
      if (!ok) return;
      await deleteRecord(record.id);
      await refreshRecords();
    });

    actions.append(open, remove);
    card.append(content, actions);
    recordsList.append(card);
  });
}

async function refreshRecords() {
  if (!db) return;
  cachedRecords = await getAllRecords();
  totalRecords.textContent = cachedRecords.length;
  renderRecords();
}

function switchView(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-visible", view.id === `view-${name}`);
  });
  if (name === "consulta") {
    refreshRecords();
    searchQuery.focus();
  }
}

function resetForm() {
  form.reset();
  elements.recordId.value = "";
  elements.status.value = "Incompleto";
  currentEvidence = [];
  setWorkspaceVisible(false);
  updateActiveCaseLabel();
  setAutosaveStatus("Listo para capturar evidencias");
  document.querySelectorAll(".field.has-error").forEach((field) => field.classList.remove("has-error"));
  document.querySelectorAll(".error").forEach((error) => {
    error.textContent = "";
  });
  renderEvidence();
  renderMissing();
}

async function persistActiveCase(successMessage = "Cambios guardados.") {
  if (!hasActiveCase() || !db) return;

  setAutosaveStatus("Guardando...", "saving");
  const record = buildRecord();
  elements.recordId.value = record.id;
  elements.status.value = record.status;

  try {
    await saveRecord(record);
    await refreshRecords();
    updateActiveCaseLabel();
    renderStepNotice();
    setAutosaveStatus(successMessage, "success");
  } catch (error) {
    setAutosaveStatus("No se pudo guardar.", "error");
    dbNotice.hidden = false;
    dbNotice.textContent = `No fue posible guardar el registro: ${error.message || "error desconocido"}.`;
  }
}

function scheduleAutosave() {
  if (!hasActiveCase()) return;
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    persistActiveCase("Cambios guardados automaticamente.");
  }, 450);
}

async function startCase() {
  if (!validateRequired()) return;
  if (!db) {
    dbNotice.hidden = false;
    dbNotice.textContent = "No se puede crear el caso porque este navegador no habilito el almacenamiento local.";
    return;
  }

  const existing = findByIdentity(elements.assistanceNumber.value, elements.plate.value);
  if (existing) {
    writeForm(existing, getNextIncompleteStep(existing));
    setAutosaveStatus(getResumeMessage(existing), "success");
    focusNextPending(existing);
    return;
  }

  const record = buildRecord();
  try {
    await saveRecord(record);
    await refreshRecords();
    writeForm(record, 1);
    setAutosaveStatus("Caso creado. Las evidencias se guardaran automaticamente.", "success");
  } catch (error) {
    dbNotice.hidden = false;
    dbNotice.textContent = `No fue posible crear el caso: ${error.message || "error desconocido"}.`;
  }
}

function setSecurityStatus(message) {
  securityStatus.textContent = message || "";
}

function configureSecurityGate() {
  try {
    requireCrypto();
    securityConfig = loadSecurityConfig();
    setupMode = !securityConfig;
    securityPinConfirmField.hidden = !setupMode;
    resetSecureApp.hidden = setupMode;
    securityHelp.textContent = setupMode
      ? "Crea un PIN minimo de 6 digitos. Con este PIN se cifran los casos y evidencias guardados en este dispositivo."
      : "Ingresa tu PIN para desbloquear los casos guardados en este dispositivo.";
    unlockApp.textContent = setupMode ? "Crear PIN y entrar" : "Desbloquear";
    securityPin.focus();
  } catch (error) {
    setSecurityStatus(error.message);
    unlockApp.disabled = true;
  }
}

async function unlockApplication() {
  const pin = normalize(securityPin.value);
  const confirmation = normalize(securityPinConfirm.value);
  setSecurityStatus("");

  if (pin.length < 6) {
    setSecurityStatus("Usa un PIN de minimo 6 digitos.");
    return;
  }

  try {
    unlockApp.disabled = true;
    unlockApp.textContent = setupMode ? "Creando..." : "Desbloqueando...";

    if (setupMode) {
      if (pin !== confirmation) {
        setSecurityStatus("Los PIN no coinciden.");
        return;
      }
      const created = await createSecurityConfig(pin);
      securityConfig = created.config;
      cryptoKey = created.key;
    } else {
      cryptoKey = await unlockWithPin(pin);
    }

    db = await openDatabase();
    await refreshRecords();
    renderEvidence();
    renderMissing();
    setWorkspaceVisible(false);
    updateActiveCaseLabel();
    document.body.classList.remove("is-locked");
    securityGate.hidden = true;
    securityPin.value = "";
    securityPinConfirm.value = "";
  } catch (error) {
    cryptoKey = null;
    setSecurityStatus(error.message || "No fue posible desbloquear la aplicacion.");
  } finally {
    unlockApp.disabled = false;
    unlockApp.textContent = setupMode ? "Crear PIN y entrar" : "Desbloquear";
  }
}

async function clearAllLocalData() {
  const first = window.confirm("Esto elimina todos los casos y evidencias guardados en este dispositivo. No se puede deshacer.");
  if (!first) return;
  const second = window.confirm("Confirma nuevamente: borrar todos los datos locales cifrados y reiniciar el PIN?");
  if (!second) return;

  if (db) await clearRecordStore();
  localStorage.removeItem(SECURITY_CONFIG_KEY);
  currentEvidence = [];
  cachedRecords = [];
  cryptoKey = null;
  securityConfig = null;
  setupMode = true;
  form.reset();
  elements.recordId.value = "";
  document.body.classList.add("is-locked");
  securityGate.hidden = false;
  configureSecurityGate();
  setSecurityStatus("Datos locales eliminados. Crea un nuevo PIN para continuar.");
}

async function resetLockedApplication() {
  const first = window.confirm("Si no recuerdas el PIN, se borraran los casos y evidencias locales porque no se pueden descifrar sin ese PIN.");
  if (!first) return;
  const second = window.confirm("Confirmas borrar datos locales y crear un PIN nuevo?");
  if (!second) return;

  try {
    if (db) db.close();
  } catch (error) {
    // Ignore close errors during reset.
  }

  localStorage.removeItem(SECURITY_CONFIG_KEY);
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = resolve;
    request.onblocked = resolve;
  });

  db = null;
  cryptoKey = null;
  currentEvidence = [];
  cachedRecords = [];
  securityConfig = null;
  setupMode = true;
  securityPin.value = "";
  securityPinConfirm.value = "";
  configureSecurityGate();
  setSecurityStatus("PIN reiniciado. Crea un PIN nuevo para continuar.");
}

function exportSummary() {
  const payload = cachedRecords.map((record) => ({
    ...record,
    evidence: (record.evidence || []).map((item) => ({
      name: item.name,
      type: item.type,
      size: item.size,
      lastModified: item.lastModified,
    })),
    missing: getMissing(record),
  }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `resumen-asistencias-mapfre-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

document.querySelector("#fileInput").addEventListener("change", async (event) => {
  await addFiles(event.target.files);
  event.target.value = "";
});

document.querySelector("#photoInput").addEventListener("change", async (event) => {
  await addFiles(event.target.files, "Foto adicional");
  event.target.value = "";
});

document.querySelector("#videoInput").addEventListener("change", async (event) => {
  await addFiles(event.target.files, "Video final");
  event.target.value = "";
});

documentInput.addEventListener("change", async (event) => {
  await addFiles(event.target.files, "Documento complementario", {
    allowDocuments: true,
    kind: "document",
  });
  event.target.value = "";
});

guidedPhotoInput.addEventListener("change", async (event) => {
  await addFiles(event.target.files);
  event.target.value = "";
});

vehicleMask.addEventListener("click", () => {
  if (!hasActiveCase()) {
    alert("Primero ingresa el numero de asistencia y la placa, luego toca Continuar.");
    return;
  }
  guidedPhotoInput.click();
});

prevShot.addEventListener("click", () => {
  if (currentShotIndex > 0) {
    currentShotIndex -= 1;
    renderGuidedShot();
    renderShotChecklist();
  }
});

nextShot.addEventListener("click", () => {
  if (currentShotIndex < REQUIRED_SHOTS.length - 1) {
    currentShotIndex += 1;
  } else {
    setWizardStep(2);
    elements.serviceType.focus();
    return;
  }
  renderGuidedShot();
  renderShotChecklist();
});

finishPhotos.addEventListener("click", () => {
  setWizardStep(2);
  elements.serviceType.focus();
});

backToIdentity.addEventListener("click", () => {
  setWizardStep(0);
  elements.assistanceNumber.focus();
});

backToPhotos.addEventListener("click", () => {
  setWizardStep(1);
  vehicleMask.focus();
});

clearEvidence.addEventListener("click", () => {
  currentEvidence = [];
  renderEvidence();
  renderMissing();
  persistActiveCase("Evidencias eliminadas.");
});

document.querySelector("#resetForm").addEventListener("click", resetForm);
document.querySelector("#exportAll").addEventListener("click", exportSummary);
clearAllData.addEventListener("click", clearAllLocalData);
continueCase.addEventListener("click", startCase);
searchQuery.addEventListener("input", renderRecords);
unlockApp.addEventListener("click", unlockApplication);
resetSecureApp.addEventListener("click", resetLockedApplication);
securityPin.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !setupMode) unlockApplication();
});
securityPinConfirm.addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockApplication();
});

Object.values(elements).forEach((element) => {
  if (element && element.id !== "recordId") {
    const syncField = () => {
      if (element === elements.plate) {
        element.value = normalizePlate(element.value);
      }
      validateRequired();
      renderMissing();
      updateActiveCaseLabel();
      scheduleAutosave();
    };
    element.addEventListener("input", syncField);
    element.addEventListener("change", syncField);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateRequired()) return;

  const record = buildRecord();
  elements.status.value = record.status;
  try {
    await saveRecord(record);
    await refreshRecords();
    writeForm(record, 2);
    setAutosaveStatus("Asistencia guardada en este dispositivo.", "success");
  } catch (error) {
    dbNotice.hidden = false;
    dbNotice.textContent = `No fue posible guardar el registro: ${error.message || "error desconocido"}.`;
  }
});

configureSecurityGate();
