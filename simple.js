const DB_NAME = "asistencias-simple";
const DB_VERSION = 1;
const STORE = "records";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CASE_BYTES = 300 * 1024 * 1024;
const MAX_IMAGES = 60;
const RECENT_RECORD_DAYS = 30;
const RECENT_RECORD_WINDOW = RECENT_RECORD_DAYS * 24 * 60 * 60 * 1000;

const form = document.querySelector("#caseForm");
const capturePanel = document.querySelector("#caseForm");
const assistanceNumber = document.querySelector("#assistanceNumber");
const plate = document.querySelector("#plate");
const serviceType = document.querySelector("#serviceType");
const serviceDate = document.querySelector("#serviceDate");
const city = document.querySelector("#city");
const locationInput = document.querySelector("#location");
const provider = document.querySelector("#provider");
const contact = document.querySelector("#contact");
const notes = document.querySelector("#notes");
const goDetails = document.querySelector("#goDetails");
const detailsPanel = document.querySelector("#detailsPanel");
const detailsStatus = document.querySelector("#detailsStatus");
const photoInput = document.querySelector("#photoInput");
const galleryInput = document.querySelector("#galleryInput");
const currentPhotoTitle = document.querySelector("#currentPhotoTitle");
const photoProgress = document.querySelector("#photoProgress");
const photoChecklist = document.querySelector("#photoChecklist");
const thumbGrid = document.querySelector("#thumbGrid");
const emptyGrid = document.querySelector("#emptyGrid");
const imageCount = document.querySelector("#imageCount");
const activeCase = document.querySelector("#activeCase");
const statusBox = document.querySelector("#status");
const progressTimeline = document.querySelector("#progressTimeline");
const timelinePercent = document.querySelector("#timelinePercent");
const timelineFill = document.querySelector("#timelineFill");
const timelinePhotos = document.querySelector("#timelinePhotos");
const timelineDetails = document.querySelector("#timelineDetails");
const timelineDone = document.querySelector("#timelineDone");
const searchPanel = document.querySelector("#searchPanel");
const showSearch = document.querySelector("#showSearch");
const backToCaptureFromDetails = document.querySelector("#backToCaptureFromDetails");
const backToCaptureFromSearch = document.querySelector("#backToCaptureFromSearch");
const searchQuery = document.querySelector("#searchQuery");
const records = document.querySelector("#records");

let db;
let savedRecords = [];
let currentId = "";
let images = [];
let saveTimer;
let currentPhotoIndex = 0;

const REQUIRED_PHOTOS = [
  { id: "front-left", title: "Frente / lateral izquierdo" },
  { id: "front-right", title: "Frente / lateral derecho" },
  { id: "rear-right", title: "Trasera / lateral derecho" },
  { id: "rear-left", title: "Trasera / lateral izquierdo" },
  { id: "plate", title: "Placa o VIN" },
  { id: "main-damage", title: "Dano principal" },
  { id: "damage-detail", title: "Detalle del dano" },
  { id: "environment", title: "Entorno del evento" },
];

function normalize(value) {
  return String(value || "").trim();
}

function normalizePlate(value) {
  return normalize(value).toUpperCase().replace(/\s+/g, "");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(message, tone = "idle") {
  statusBox.textContent = message;
  statusBox.dataset.tone = tone;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAllRecords() {
  return new Promise((resolve, reject) => {
    const request = store().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function saveRecord(record) {
  return new Promise((resolve, reject) => {
    const request = store("readwrite").put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

function findCurrentRecord() {
  const assistance = normalize(assistanceNumber.value).toUpperCase();
  const currentPlate = normalizePlate(plate.value);
  return savedRecords.find((record) => (
    record.assistanceNumber.toUpperCase() === assistance && record.plate === currentPlate
  ));
}

function isRecentRecord(record) {
  const timestamp = Date.parse(record.updatedAt || record.createdAt || "");
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= 0 && age <= RECENT_RECORD_WINDOW;
}

function findRecentIdentityRecord() {
  const assistance = normalize(assistanceNumber.value).toUpperCase();
  const currentPlate = normalizePlate(plate.value);
  if (!assistance && !currentPlate) return null;

  return savedRecords
    .filter((record) => {
      if (record.id === currentId || !isRecentRecord(record)) return false;
      const matchesAssistance = assistance && record.assistanceNumber.toUpperCase() === assistance;
      const matchesPlate = currentPlate && record.plate === currentPlate;
      return matchesAssistance || matchesPlate;
    })
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""))[0] || null;
}

function validateIdentity() {
  const fields = [
    [assistanceNumber, "Ingresa asistencia."],
    [plate, "Ingresa placa."],
  ];
  let valid = true;
  fields.forEach(([input, message]) => {
    const empty = !normalize(input.value);
    input.closest(".field").classList.toggle("has-error", empty);
    document.querySelector(`[data-error-for="${input.id}"]`).textContent = empty ? message : "";
    if (empty) valid = false;
  });
  return valid;
}

function focusMissingIdentity() {
  const target = !normalize(assistanceNumber.value) ? assistanceNumber : (!normalize(plate.value) ? plate : null);
  if (!target) return;
  target.focus();
  target.closest(".field").scrollIntoView({ behavior: "smooth", block: "center" });
}

function showScreen(screen, options = {}) {
  const { scroll = true } = options;
  capturePanel.hidden = screen !== "capture";
  detailsPanel.hidden = screen !== "details";
  searchPanel.hidden = screen !== "search";
  goDetails.setAttribute("aria-expanded", String(screen === "details"));
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

function maybePreloadRecentRecord() {
  const match = findRecentIdentityRecord();
  if (!match) return false;
  writeRecord(match);
  validateIdentity();
  showScreen("capture", { scroll: false });
  setStatus(`Caso precargado: ${match.assistanceNumber} · ${match.plate}.`, "success");
  return true;
}

function readRecord() {
  const now = new Date().toISOString();
  const existing = currentId ? savedRecords.find((record) => record.id === currentId) : findCurrentRecord();
  return {
    id: existing?.id || currentId || createId(),
    assistanceNumber: normalize(assistanceNumber.value),
    plate: normalizePlate(plate.value),
    serviceType: normalize(serviceType.value),
    serviceDate: normalize(serviceDate.value),
    city: normalize(city.value),
    location: normalize(locationInput.value),
    provider: normalize(provider.value),
    contact: normalize(contact.value),
    notes: normalize(notes.value),
    images,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function writeRecord(record) {
  currentId = record.id;
  assistanceNumber.value = record.assistanceNumber || "";
  plate.value = record.plate || "";
  serviceType.value = record.serviceType || "";
  serviceDate.value = record.serviceDate || "";
  city.value = record.city || "";
  locationInput.value = record.location || "";
  provider.value = record.provider || "";
  contact.value = record.contact || "";
  notes.value = record.notes || "";
  images = record.images || [];
  moveToNextMissingPhoto();
  updateCaseLabel();
  renderImages();
}

function updateCaseLabel() {
  const assistance = normalize(assistanceNumber.value);
  const currentPlate = normalizePlate(plate.value);
  activeCase.textContent = assistance && currentPlate ? `${assistance} · ${currentPlate}` : "Sin caso activo";
}

function getDetailsSummary() {
  const fields = [serviceType, serviceDate, city, locationInput, provider, contact];
  const completed = fields.filter((input) => normalize(input.value)).length;
  return {
    completed,
    total: fields.length,
  };
}

function updateTimeline() {
  const photoSummary = getPhotoSummary();
  const detailsSummary = getDetailsSummary();
  const photoRatio = photoSummary.total ? photoSummary.completed / photoSummary.total : 0;
  const detailRatio = detailsSummary.total ? detailsSummary.completed / detailsSummary.total : 0;
  const progress = Math.round((photoRatio * 70) + (detailRatio * 30));
  const tone = progress >= 85 ? "done" : (progress >= 45 ? "mid" : "start");

  progressTimeline.dataset.tone = tone;
  timelinePercent.textContent = `${progress}%`;
  timelineFill.style.width = `${progress}%`;

  const photosComplete = photoSummary.completed === photoSummary.total;
  const detailsComplete = detailsSummary.completed === detailsSummary.total && detailsSummary.total > 0;

  timelinePhotos.className = photosComplete ? "is-done" : "is-active";
  timelineDetails.className = detailsComplete ? "is-done" : (photosComplete || detailsSummary.completed ? "is-active" : "");
  timelineDone.className = progress === 100 ? "is-done" : "";
}

function renderImages() {
  thumbGrid.innerHTML = "";
  imageCount.textContent = `${images.length} imagen${images.length === 1 ? "" : "es"}`;
  emptyGrid.hidden = images.length > 0;
  renderPhotoGuide();
  updateTimeline();

  images.forEach((item) => {
    const card = document.createElement("article");
    card.className = "thumb-card";

    const img = document.createElement("img");
    const url = URL.createObjectURL(item.blob);
    img.src = url;
    img.alt = item.name || "Evidencia";
    img.onload = () => URL.revokeObjectURL(url);
    img.onerror = () => URL.revokeObjectURL(url);

    const photoLabel = document.createElement("strong");
    photoLabel.textContent = item.photoTitle || "Foto adicional";

    const name = document.createElement("span");
    name.textContent = item.name || "Imagen";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Quitar";
    remove.addEventListener("click", () => {
      images = images.filter((image) => image.id !== item.id);
      renderImages();
      scheduleSave("Imagen retirada.");
    });

    card.append(img, photoLabel, name, remove);
    thumbGrid.append(card);
  });
}

function isPhotoComplete(photo) {
  return images.some((image) => image.photoId === photo.id);
}

function getPhotoSummary() {
  const completed = REQUIRED_PHOTOS.filter(isPhotoComplete).length;
  const nextMissingIndex = REQUIRED_PHOTOS.findIndex((photo) => !isPhotoComplete(photo));
  return {
    completed,
    total: REQUIRED_PHOTOS.length,
    remaining: REQUIRED_PHOTOS.length - completed,
    nextMissingIndex: nextMissingIndex >= 0 ? nextMissingIndex : REQUIRED_PHOTOS.length - 1,
  };
}

function moveToNextMissingPhoto() {
  currentPhotoIndex = getPhotoSummary().nextMissingIndex;
}

function renderPhotoGuide() {
  const summary = getPhotoSummary();
  const currentPhoto = REQUIRED_PHOTOS[currentPhotoIndex] || REQUIRED_PHOTOS[0];
  currentPhotoTitle.textContent = currentPhoto.title;
  photoProgress.textContent = summary.remaining
    ? `Faltan ${summary.remaining} de ${summary.total} fotos`
    : "Fotos requeridas completas";

  photoChecklist.innerHTML = "";
  REQUIRED_PHOTOS.forEach((photo, index) => {
    const done = isPhotoComplete(photo);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `photo-step ${done ? "is-done" : ""} ${index === currentPhotoIndex ? "is-current" : ""}`;

    const marker = document.createElement("span");
    marker.textContent = done ? "OK" : String(index + 1).padStart(2, "0");

    const label = document.createElement("strong");
    label.textContent = photo.title;

    button.append(marker, label);
    button.addEventListener("click", () => {
      currentPhotoIndex = index;
      renderPhotoGuide();
      if (!validateIdentity()) {
        setStatus("Primero ingresa asistencia y placa.", "error");
        focusMissingIdentity();
        return;
      }
      photoInput.click();
    });
    photoChecklist.append(button);
  });
}

function validateFiles(files) {
  const accepted = [];
  const rejected = [];
  let totalSize = images.reduce((sum, image) => sum + (image.size || 0), 0);

  Array.from(files || []).forEach((file) => {
    if (!file.type.startsWith("image/")) {
      rejected.push(`${file.name}: solo se aceptan imagenes.`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      rejected.push(`${file.name}: supera 20 MB.`);
      return;
    }
    if (images.length + accepted.length >= MAX_IMAGES) {
      rejected.push("El caso llego al maximo de imagenes.");
      return;
    }
    if (totalSize + file.size > MAX_CASE_BYTES) {
      rejected.push("El caso supera el limite total de almacenamiento.");
      return;
    }
    totalSize += file.size;
    accepted.push(file);
  });

  return { accepted, rejected };
}

async function addImages(fileList, source = "camera") {
  if (!validateIdentity()) {
    setStatus("Primero ingresa asistencia y placa.", "error");
    focusMissingIdentity();
    return;
  }

  const { accepted, rejected } = validateFiles(fileList);
  if (rejected.length) alert(`No se cargaron algunas imagenes:\n${rejected.join("\n")}`);
  if (!accepted.length) return;

  const mapped = accepted.map((file, index) => {
    const photo = REQUIRED_PHOTOS[currentPhotoIndex] || REQUIRED_PHOTOS[0];
    const item = {
      id: createId(),
      name: file.name || `imagen-${new Date().toISOString()}.jpg`,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      photoId: photo.id,
      photoTitle: source === "gallery" ? `Galeria - evidencia ${index + 1}` : photo.title,
      source,
      blob: file,
    };

    images = images.concat(item);
    moveToNextMissingPhoto();
    return item;
  });

  renderImages();
  const summary = getPhotoSummary();
  const nextText = summary.remaining ? ` Siguiente: ${currentPhotoTitle.textContent}.` : " Fotos requeridas completas.";
  const originText = source === "gallery" ? " de galeria" : "";
  const okText = source === "gallery" ? ` Se marcaron ${mapped.length} foto${mapped.length === 1 ? "" : "s"} como OK.` : "";
  await persistCase(`${mapped.length} imagen${mapped.length === 1 ? "" : "es"}${originText} guardada${mapped.length === 1 ? "" : "s"}.${okText}${nextText}`);
}

async function refreshRecords() {
  savedRecords = await getAllRecords();
  renderRecords();
}

async function persistCase(message = "Caso guardado.") {
  if (!validateIdentity()) return;
  const record = readRecord();
  currentId = record.id;
  await saveRecord(record);
  await refreshRecords();
  updateCaseLabel();
  detailsStatus.textContent = "Guardado";
  setStatus(message, "success");
}

function scheduleSave(message = "Cambios guardados.") {
  if (!normalize(assistanceNumber.value) || !normalize(plate.value)) return;
  detailsStatus.textContent = "Guardando...";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => persistCase(message), 350);
}

function renderRecords() {
  const query = normalize(searchQuery.value).toUpperCase();
  const filtered = savedRecords
    .filter((record) => {
      if (!query) return true;
      return record.assistanceNumber.toUpperCase().includes(query) || record.plate.toUpperCase().includes(query);
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  records.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "record-card";
    empty.textContent = query ? "Sin resultados." : "Aun no hay casos guardados.";
    records.append(empty);
    return;
  }

  filtered.forEach((record) => {
    const card = document.createElement("article");
    card.className = "record-card";

    const title = document.createElement("strong");
    title.textContent = `${record.assistanceNumber} · ${record.plate}`;

    const meta = document.createElement("span");
    const updated = record.updatedAt ? new Date(record.updatedAt).toLocaleString("es-CO") : "Sin fecha";
    meta.textContent = `${record.images?.length || 0} imagenes · ${record.city || "Sin ciudad"} · ${updated}`;

    const open = document.createElement("button");
    open.className = "button";
    open.type = "button";
    open.textContent = "Abrir";
    open.addEventListener("click", () => {
      writeRecord(record);
      showScreen("capture");
      setStatus("Caso abierto. Puedes agregar mas imagenes.", "success");
    });

    card.append(title, meta, open);
    records.append(card);
  });
}

photoInput.addEventListener("change", async (event) => {
  await addImages(event.target.files, "camera");
  event.target.value = "";
});

galleryInput.addEventListener("change", async (event) => {
  await addImages(event.target.files, "gallery");
  event.target.value = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await persistCase("Caso guardado.");
});

goDetails.addEventListener("click", () => {
  if (!validateIdentity()) {
    setStatus("Primero ingresa asistencia y placa.", "error");
    focusMissingIdentity();
    return;
  }
  showScreen("details");
  scheduleSave("Caso creado. Completa los datos faltantes.");
  serviceType.focus();
});

searchQuery.addEventListener("input", renderRecords);
showSearch.addEventListener("click", () => {
  showScreen("search");
  renderRecords();
  searchQuery.focus();
});

backToCaptureFromDetails.addEventListener("click", () => {
  showScreen("capture");
});

backToCaptureFromSearch.addEventListener("click", () => {
  showScreen("capture");
});

[assistanceNumber, plate, serviceType, serviceDate, city, locationInput, provider, contact, notes].forEach((input) => {
  input.addEventListener("input", () => {
    if (input === plate) plate.value = normalizePlate(plate.value);
    validateIdentity();
    updateCaseLabel();
    updateTimeline();
    const preloaded = input === assistanceNumber || input === plate ? maybePreloadRecentRecord() : false;
    if (!preloaded) scheduleSave();
  });
});

openDatabase()
  .then((database) => {
    db = database;
    return refreshRecords();
  })
  .then(() => {
    renderImages();
    setStatus("Lista para registrar imagenes.");
  })
  .catch((error) => {
    setStatus(`No se pudo iniciar el almacenamiento local: ${error.message || "error desconocido"}.`, "error");
  });
