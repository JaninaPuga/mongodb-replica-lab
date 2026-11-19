# NYC 311: Gestión Inteligente de Solicitudes Ciudadanas
**Proyecto Integrador - Caso de Desarrollo 3**  
*Taller integrador: CRUD avanzado, analítica gerencial, replicación, sharding y tolerancia a fallos.*

---

## 1. Contexto y Objetivos del Proyecto
Este proyecto implementa una solución de base de datos distribuida en **MongoDB 7+** sobre las solicitudes de servicio ciudadano de la ciudad de Nueva York (**NYC Open Data: 311 Service Requests from 2020 to Present**).

### Reglas Metodológicas Estrictas
* **Herramientas autorizadas:** Docker Desktop, Docker Compose, MongoDB 7+, mongosh, mongoimport y MongoDB Compass.
* **Prohibido:** Jupyter Notebooks, Python, Pandas y PyMongo.
* **Separación de colecciones:**
  * `requests_raw`: Staging en bruto cargado desde el CSV por `mongoimport`.
  * `requests`: Colección operativa normalizada en BSON con índices.
  * `requests_pruebas`: Colección espejo donde **únicamente** se ejecutan operaciones de modificación (`UPDATE`) y borrado (`DELETE`).

---

## 2. Requisitos Previos en la Máquina de cada Integrante
Antes de comenzar, cada integrante debe asegurarse de tener instalado y abierto:
1. **Git:** Para clonar el repositorio.
2. **Docker Desktop:**
   * Debe estar abierto y en estado *"Engine running"*.
   * Si usas Windows, debe tener activada la integración con WSL2.
3. **MongoDB Compass:** Para visualización y consultas analíticas interactivas.

---

## 3. Guía Paso a Paso para Montar Todo en tu Computadora

### Paso 1: Clonar el repositorio
Abre una terminal (PowerShell o Bash) y clona el proyecto:
```bash
git clone https://github.com/JaninaPuga/mongodb-replica-lab.git
cd mongodb-replica-lab
```

---

### Paso 2: Levantar el Replica Set en Docker (3 Nodos)
Con Docker Desktop abierto, ejecuta en la raíz del proyecto:
```bash
docker compose up -d
```

> **¿Qué hace este comando?**
> * Crea la red `mongoCluster`.
> * Levanta 3 contenedores de MongoDB 7 (`mongo1`, `mongo2`, `mongo3`).
> * Mapea los puertos locales:
>   * `mongo1` ➡️ `127.0.0.1:27019`
>   * `mongo2` ➡️ `127.0.0.1:27020`
>   * `mongo3` ➡️ `127.0.0.1:27021`
> * Ejecuta el contenedor de inicialización `mongo-init`, el cual configura automáticamente el Replica Set `rs0` (`rs.initiate()`).

#### Verificación del Replica Set:
Ejecuta el siguiente comando para confirmar que el clúster esté sincronizado:
```bash
docker exec mongo1 mongosh --quiet --eval "rs.status().members.map(m => ({ id: m._id, name: m.name, stateStr: m.stateStr, health: m.health }))"
```
*Debes ver 1 miembro como `PRIMARY` y 2 como `SECONDARY`, todos con `health: 1`.*

---

### Paso 3: Ingesta del CSV hacia Staging (`requests_raw`)
El repositorio ya incluye la muestra oficial de 50.000 registros en `data/nyc_311_sample.csv` (~21.6 MB).

Para importarla a MongoDB:

1. **Copiar el CSV dentro del contenedor primario:**
   ```bash
   docker cp data/nyc_311_sample.csv mongo1:/tmp/nyc_311_sample.csv
   ```

2. **Ejecutar `mongoimport` hacia la colección `requests_raw`:**
   ```bash
   docker exec mongo1 mongoimport --uri "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/NYC311_Service_DB?replicaSet=rs0" --collection requests_raw --type csv --headerline --file /tmp/nyc_311_sample.csv --drop
   ```
   *Resultado esperado:*  
   `50000 document(s) imported successfully. 0 document(s) failed to import.` (Toma ~12 segundos).

---

### Paso 4: Normalización, Tipado BSON y Creación de Colecciones
Ahora ejecutamos el script de normalización en JavaScript. Este script convierte las fechas a formato BSON `ISODate`, valida coordenadas `location: { lat, lon }`, calcula `resolutionHours`, asigna políticas de SLA de laboratorio (`slaHours`, `slaBreached`), crea los arreglos `alerts[]` y `history[]`, genera índices y clona a `requests_pruebas`:

1. **Copiar el script al contenedor:**
   ```bash
   docker cp scripts/01_normalize_and_model.js mongo1:/tmp/01_normalize_and_model.js
   ```

2. **Ejecutar con `mongosh`:**
   ```bash
   docker exec mongo1 mongosh "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/NYC311_Service_DB?replicaSet=rs0" /tmp/01_normalize_and_model.js
   ```

---

### Paso 5: Auditoría y Verificación de la Base de Datos (Sección 5.2)
Para comprobar que los datos y los índices quedaron creados correctamente:

1. **Copiar el script de auditoría:**
   ```bash
   docker cp scripts/02_audit_initial.js mongo1:/tmp/02_audit_initial.js
   ```

2. **Ejecutar la auditoría:**
   ```bash
   docker exec mongo1 mongosh "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/NYC311_Service_DB?replicaSet=rs0" /tmp/02_audit_initial.js
   ```

*Debe certificar:*
* `requests_raw`: 50.000 documentos.
* `requests`: 50.000 documentos tipados con BSON.
* `requests_pruebas`: 50.000 documentos clonados.
* 8 índices activos (`idx_unique_key`, `idx_created_date`, `idx_agency_status`, `idx_complaint_type`, `idx_borough_complaint`, `idx_location`, `idx_alerts`, `idx_history_status`).

---

## 4. Conexión desde MongoDB Compass
Para conectarte desde la interfaz gráfica de MongoDB Compass en tu máquina:
1. Abre **MongoDB Compass**.
2. En la casilla **New Connection** (URI), pega la siguiente cadena:
   ```text
   mongodb://127.0.0.1:27019/?directConnection=true
   ```
   *(Nota: si el nodo primario en tu máquina es el 2 o el 3, usa el puerto `27020` o `27021`).*
3. Haz clic en **Connect**.
4. Verás la base de datos `NYC311_Service_DB` con sus 3 colecciones listas para trabajar.

---

## 5. Estructura del Repositorio
```
mongodb-replica-lab/
├── docker-compose.yml           # Definición del clúster Replica Set (3 nodos + inicializador)
├── data/
│   └── nyc_311_sample.csv       # Muestra oficial de 50.000 registros de NYC Open Data
├── scripts/
│   ├── 00_download_dataset.ps1  # Script PowerShell para descarga directa desde la API Socrata
│   ├── 01_normalize_and_model.js# Modelado BSON, cálculo de SLAs, índices y clonación
│   ├── 02_audit_initial.js      # Comandos de auditoría de la sección 5.2 del caso
│   └── clone_pruebas.js         # Utilidad para re-clonar requests a requests_pruebas si se requiere
├── consultas/                   # Consultas analíticas y pipelines de agregación (Fase 2 y 3)
├── Evidencias/                  # Capturas de pantalla para el informe final
├── config/                      # Configuraciones para Sharding y clúster
└── README.md                    # Esta guía completa
```

---

## 6. Comandos de Detención y Reinicio del Laboratorio
* **Pausar los contenedores (sin perder datos):**
  ```bash
  docker compose stop
  ```
* **Reanudar los contenedores:**
  ```bash
  docker compose start
  ```
* **Destruir contenedores y volúmenes (reinicio total desde cero):**
  ```bash
  docker compose down -v
  ```
