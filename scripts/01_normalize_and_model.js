/**
 * PROYECTO FINAL I PARCIAL - CASO 3: NYC 311
 * Script 01: Normalización, Enriquecimiento y Modelado BSON
 *
 * Ejecución en mongosh:
 *   mongosh "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/NYC311_Service_DB?replicaSet=rs0" scripts/01_normalize_and_model.js
 */

print("==========================================================");
print(" INICIANDO NORMALIZACIÓN Y MODELADO BSON: NYC311_Service_DB");
print("==========================================================");

const dbName = "NYC311_Service_DB";
const sourceDB = db.getSiblingDB(dbName);

const totalRaw = sourceDB.requests_raw.countDocuments({});
print(`Registros en staging (requests_raw): ${totalRaw}`);

if (totalRaw === 0) {
  print("ERROR: requests_raw está vacía. Por favor importe el CSV primero.");
  quit(1);
}

// 1. Reiniciar colecciones destino
print("Preparando colecciones 'requests' y 'requests_pruebas'...");
sourceDB.requests.drop();
sourceDB.requests_pruebas.drop();

// 2. Definición de Políticas de SLA de Laboratorio (en horas)
function getSlaHours(agency, complaintType) {
  const comp = (complaintType || "").toUpperCase();
  const ag = (agency || "").toUpperCase();

  if (comp.includes("EMERGENCY") || comp.includes("HEAT") || comp.includes("GAS")) return 12;
  if (ag === "NYPD") return 24;      // Policía: 24h
  if (ag === "DOHMH") return 48;     // Salud pública: 48h
  if (ag === "DEP") return 72;       // Protección ambiental / agua / desagües: 72h
  if (ag === "DSNY") return 48;      // Sanidad / recolección / graffiti: 48h
  if (ag === "DOT") return 120;      // Transporte / baches / semáforos: 120h
  if (ag === "HPD") return 96;       // Vivienda / preservación: 96h
  return 72;                         // SLA general por defecto: 72h
}

// Determinación simulada de prioridad para laboratorio
function getPriority(complaintType, agency) {
  const comp = (complaintType || "").toUpperCase();
  if (comp.includes("HEAT") || comp.includes("GAS") || comp.includes("POISONING") || comp.includes("EMERGENCY")) {
    return "Alta";
  }
  if (agency === "NYPD" || comp.includes("WATER") || comp.includes("LEAK")) {
    return "Media";
  }
  return "Baja";
}

// 3. Procesar y transformar documentos por lotes
const batchSize = 2500;
let batch = [];
let processedCount = 0;
let invalidDatesCount = 0;
let cursor = sourceDB.requests_raw.find({});

print("Procesando documentos y tipando campos BSON...");

while (cursor.hasNext()) {
  const raw = cursor.next();

  // Fechas BSON
  let createdDate = null;
  if (raw.created_date && raw.created_date !== "") {
    createdDate = new Date(raw.created_date);
    if (isNaN(createdDate.getTime())) createdDate = null;
  }

  let closedDate = null;
  if (raw.closed_date && raw.closed_date !== "") {
    closedDate = new Date(raw.closed_date);
    if (isNaN(closedDate.getTime())) closedDate = null;
  }

  if (!createdDate) invalidDatesCount++;

  // Coordenadas y objeto location
  let location = null;
  const lat = parseFloat(raw.latitude);
  const lon = parseFloat(raw.longitude);
  if (!isNaN(lat) && !isNaN(lon) && lat >= 40.0 && lat <= 41.5 && lon >= -74.5 && lon <= -73.0) {
    location = { lat: lat, lon: lon };
  }

  // Tiempo de resolución en horas
  let resolutionHours = null;
  if (createdDate && closedDate && closedDate >= createdDate) {
    resolutionHours = Math.round(((closedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60)) * 100) / 100;
  }

  const agency = (raw.agency || "UNSPECIFIED").trim().toUpperCase();
  const complaintType = (raw.complaint_type || "Unspecified").trim();
  const slaHours = getSlaHours(agency, complaintType);
  const priority = getPriority(complaintType, agency);

  // Evaluación de incumplimiento de SLA
  let slaBreached = false;
  if (resolutionHours !== null) {
    slaBreached = resolutionHours > slaHours;
  } else if (raw.status === "Open" && createdDate) {
    // Si sigue abierta al momento del corte, comparar con SLA
    const referenceDate = new Date("2024-01-20T00:00:00.000Z");
    const openHours = (referenceDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
    slaBreached = openHours > slaHours;
  }

  // Generación consistente de arreglo alerts[] para CRUD avanzado
  const alerts = [];
  if (slaBreached) alerts.push("SLA_BREACH");
  if (priority === "Alta") alerts.push("ALTA_PRIORIDAD");
  if (raw.descriptor && raw.descriptor.toUpperCase().includes("RECURRING")) alerts.push("REINCIDENCIA");
  if (raw.status === "Open" && slaBreached) alerts.push("REQUIERE_ESCALACION");

  // Generación consistente de arreglo history[] para $elemMatch
  const history = [
    {
      step: 1,
      status: "RECIBIDA",
      timestamp: createdDate || new Date(),
      actor: "CANAL_CIUDADANO",
      comment: "Solicitud registrada a través de canal digital o telefónico NYC 311"
    }
  ];

  if (closedDate) {
    history.push({
      step: 2,
      status: "RESUELTA",
      timestamp: closedDate,
      actor: `AGENCIA_${agency}`,
      comment: (raw.resolution_description && raw.resolution_description.trim() !== "")
        ? raw.resolution_description.trim()
        : "Expediente atendido y cerrado por la unidad operativa correspondiente."
    });
  }

  // Documento normalizado BSON
  const doc = {
    unique_key: NumberLong(String(raw.unique_key)),
    created_date: createdDate,
    closed_date: closedDate,
    agency: agency,
    agency_name: raw.agency_name || agency,
    complaint_type: complaintType,
    descriptor: raw.descriptor || "Unspecified",
    location_type: raw.location_type || null,
    incident_zip: raw.incident_zip ? String(raw.incident_zip) : null,
    incident_address: raw.incident_address || null,
    street_name: raw.street_name || null,
    community_board: raw.community_board || null,
    borough: (raw.borough && raw.borough !== "Unspecified") ? raw.borough.trim().toUpperCase() : "UNSPECIFIED",
    location: location,
    status: raw.status || (closedDate ? "Closed" : "Open"),
    resolution_description: (raw.resolution_description && raw.resolution_description.trim() !== "") ? raw.resolution_description.trim() : null,
    priority: priority,
    slaHours: slaHours,
    resolutionHours: resolutionHours,
    slaBreached: slaBreached,
    escalationCount: 0,
    queue: "ESTANDAR",
    alerts: alerts,
    history: history,
    origen: "real_nyc_open_data"
  };

  batch.push(doc);
  processedCount++;

  if (batch.length === batchSize) {
    sourceDB.requests.insertMany(batch, { ordered: false });
    batch = [];
    print(`Insertados ${processedCount} / ${totalRaw} documentos en 'requests'...`);
  }
}

if (batch.length > 0) {
  sourceDB.requests.insertMany(batch, { ordered: false });
  print(`Insertados ${processedCount} / ${totalRaw} documentos en 'requests'.`);
}

// 4. Creación de Índices Operativos y Analíticos
print("Creando índices en la colección operativa 'requests'...");
sourceDB.requests.createIndex({ unique_key: 1 }, { unique: true, name: "idx_unique_key" });
sourceDB.requests.createIndex({ created_date: -1 }, { name: "idx_created_date" });
sourceDB.requests.createIndex({ agency: 1, status: 1 }, { name: "idx_agency_status" });
sourceDB.requests.createIndex({ complaint_type: 1 }, { name: "idx_complaint_type" });
sourceDB.requests.createIndex({ borough: 1, complaint_type: 1 }, { name: "idx_borough_complaint" });
sourceDB.requests.createIndex({ "location.lat": 1, "location.lon": 1 }, { name: "idx_location" });
sourceDB.requests.createIndex({ alerts: 1 }, { name: "idx_alerts" });
sourceDB.requests.createIndex({ "history.status": 1 }, { name: "idx_history_status" });

// 5. Clonación a 'requests_pruebas'
print("Clonando 'requests' hacia 'requests_pruebas' para operaciones de modificación/borrado...");
sourceDB.requests.aggregate([{ $match: {} }, { $out: "requests_pruebas" }]);

// Copiar índices a requests_pruebas
sourceDB.requests_pruebas.createIndex({ unique_key: 1 }, { unique: true, name: "idx_unique_key" });
sourceDB.requests_pruebas.createIndex({ created_date: -1 }, { name: "idx_created_date" });
sourceDB.requests_pruebas.createIndex({ agency: 1, status: 1 }, { name: "idx_agency_status" });
sourceDB.requests_pruebas.createIndex({ complaint_type: 1 }, { name: "idx_complaint_type" });
sourceDB.requests_pruebas.createIndex({ borough: 1 }, { name: "idx_borough" });

// 6. Auditoría y validación final
print("\n================ AUDITORÍA DE RESULTADOS ================");
print(`Total en requests_raw:      ${sourceDB.requests_raw.countDocuments({})}`);
print(`Total en requests:          ${sourceDB.requests.countDocuments({})}`);
print(`Total en requests_pruebas:  ${sourceDB.requests_pruebas.countDocuments({})}`);
print("Muestra de un documento normalizado:");
printjson(sourceDB.requests.findOne());

print("\nÍndices creados en 'requests':");
printjson(sourceDB.requests.getIndexes().map(idx => idx.name));
print("==========================================================");
print(" MODELADO Y NORMALIZACIÓN COMPLETADOS CON ÉXITO");
print("==========================================================");
