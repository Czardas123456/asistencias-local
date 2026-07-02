const DB_NAME = "asistencias-simple";
const DB_VERSION = 1;
const STORE = "records";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CASE_BYTES = 300 * 1024 * 1024;
const MAX_IMAGES = 60;

const form = document.querySelector("#caseForm");
const assistanceNumber = document.querySelector("#assistanceNumber");
const plate = document.querySelector("#plate");
const notes = document.querySelector("#notes");
const photoInput = document.querySelector("#photoInput");
const galleryInput = document.querySelector("#galleryInput");
const thumbGrid = document.querySelector("#thumbGrid");
const emptyGrid = document.querySelector("#emptyGrid");
const imageCount = document.querySelector("#imageCount");
const activeCase = document.querySelector("#activeCase");
const statusBox = document.querySelector("#status");
const searchPanel = document.querySelector("#searchPanel");
const showSearch = document.querySelector("#showSearch");
const searchQuery = document.querySelector("#searchQuery");
const records = document.querySelector("#records");

let db;
let savedRecords = [];
let currentId = "";
let images = [];
let saveTimer;

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

function readRecord() {
  const now = new Date().toISOString();
  const existing = currentId ? savedRecords.find((record) => record.id === currentId) : findCurrentRecord();
  return {
    id: existing?.id || currentId || createId(),
    assistanceNumber: normalize(assistanceNumber.value),
    plate: normalizePlate(plate.value),
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
  notes.value = record.notes || "";
  images = record.images || [];
  updateCaseLabel();
  renderImages();
}

function updateCaseLabel() {
  const assistance = normalize(assistanceNumber.value);
  const currentPlate = normalizePlate(plate.value);
  activeCase.textContent = assistance && currentPlate ? `${assistance} · ${currentPlate}` : "Sin caso activo";
}

function renderImages() {
  thumbGrid.innerHTML = "";
  imageCount.textContent = `${images.length} imagen${images.length === 1 ? "" : "es"}`;
  emptyGrid.hidden = images.length > 0;

  images.forEach((item) => {
    const card = document.createElement("article");
    card.className = "thumb-card";

    const img = document.createElement("img");
    const url = URL.createObjectURL(item.blob);
    img.src = url;
    img.alt = item.name || "Evidencia";
    img.onload = () => URL.revokeObjectURL(url);
    img.onerror = () => URL.revokeObjectURL(url);

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

    card.append(img, name, remove);
    thumbGrid.append(card);
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

async function addImages(fileList) {
  if (!validateIdentity()) {
    setStatus("Primero ingresa asistencia y placa.", "error");
    return;
  }

  const { accepted, rejected } = validateFiles(fileList);
  if (rejected.length) alert(`No se cargaron algunas imagenes:\n${rejected.join("\n")}`);
  if (!accepted.length) return;

  images = images.concat(accepted.map((file) => ({
    id: createId(),
    name: file.name || `imagen-${new Date().toISOString()}.jpg`,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    blob: file,
  })));

  renderImages();
  await persistCase(`${accepted.length} imagen${accepted.length === 1 ? "" : "es"} guardada${accepted.length === 1 ? "" : "s"}.`);
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
  setStatus(message, "success");
}

function scheduleSave(message = "Cambios guardados.") {
  if (!normalize(assistanceNumber.value) || !normalize(plate.value)) return;
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
    meta.textContent = `${record.images?.length || 0} imagenes · ${updated}`;

    const open = document.createElement("button");
    open.className = "button";
    open.type = "button";
    open.textContent = "Abrir";
    open.addEventListener("click", () => {
      writeRecord(record);
      setStatus("Caso abierto. Puedes agregar mas imagenes.", "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    card.append(title, meta, open);
    records.append(card);
  });
}

photoInput.addEventListener("change", async (event) => {
  await addImages(event.target.files);
  event.target.value = "";
});

galleryInput.addEventListener("change", async (event) => {
  await addImages(event.target.files);
  event.target.value = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await persistCase("Caso guardado.");
});

searchQuery.addEventListener("input", renderRecords);
showSearch.addEventListener("click", () => {
  searchPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  searchQuery.focus();
});

[assistanceNumber, plate, notes].forEach((input) => {
  input.addEventListener("input", () => {
    if (input === plate) plate.value = normalizePlate(plate.value);
    validateIdentity();
    updateCaseLabel();
    scheduleSave();
  });
});

openDatabase()
  .then((database) => {
    db = database;
    return refreshRecords();
  })
  .then(() => {
    setStatus("Lista para registrar imagenes.");
  })
  .catch((error) => {
    setStatus(`No se pudo iniciar el almacenamiento local: ${error.message || "error desconocido"}.`, "error");
  });
