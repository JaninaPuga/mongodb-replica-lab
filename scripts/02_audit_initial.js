/**
 * PROYECTO FINAL I PARCIAL - CASO 3: NYC 311
 * Script 02: Comandos Mínimos de Auditoría (Sección 5.2)
 */

const targetDB = db.getSiblingDB("NYC311_Service_DB");

print("==========================================================");
print("     AUDITORÍA INICIAL DE NYC311_Service_DB (5.2)");
print("==========================================================");

print("\n1. Conteo total de documentos en db.requests.countDocuments({}):");
const countRequests = targetDB.requests.countDocuments({});
print(`   Total: ${countRequests}`);

print("\n2. Conteo en requests_raw (staging):");
print(`   Total: ${targetDB.requests_raw.countDocuments({})}`);

print("\n3. Conteo en requests_pruebas (pruebas):");
print(`   Total: ${targetDB.requests_pruebas.countDocuments({})}`);

print("\n4. db.requests.findOne():");
printjson(targetDB.requests.findOne());

print("\n5. db.requests.getIndexes():");
printjson(targetDB.requests.getIndexes());

print("\n6. db.requests.find({}).limit(5) [extracto resumido]:");
const sample5 = targetDB.requests.find({}, {
  unique_key: 1,
  agency: 1,
  complaint_type: 1,
  borough: 1,
  status: 1,
  created_date: 1,
  closed_date: 1,
  resolutionHours: 1,
  slaBreached: 1
}).limit(5).toArray();
printjson(sample5);

print("==========================================================");
print(" AUDITORÍA COMPLETADA EXITOSAMENTE");
print("==========================================================");
