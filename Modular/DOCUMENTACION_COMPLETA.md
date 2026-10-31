# Documentación Completa - Sistema Modular de Nutrición

## Índice

- [Descripción General](#descripción-general)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Tecnologías Utilizadas](#tecnologías-utilizadas)
- [Estructura de Archivos](#estructura-de-archivos)
- [Sistema de Autenticación y Roles](#sistema-de-autenticación-y-roles)
- [Módulos del Sistema](#módulos-del-sistema)
- [Sistema de Huella Digital (Arduino + R307)](#sistema-de-huella-digital-arduino--r307)
- [Base de Datos](#base-de-datos)
- [API REST](#api-rest)
- [Configuración e Instalación](#configuración-e-instalación)
- [Flujo de Uso](#flujo-de-uso)
- [Correcciones Realizadas](#correcciones-realizadas)

---

## Descripción General

El **Sistema Modular de Nutrición** es una aplicación web integral para el control y seguimiento de pacientes en consultorios nutricionales. Permite gestionar pacientes, agendar citas, crear planes alimentarios, hacer seguimiento de peso, generar dietas con IA y contar con un sistema de autenticación biométrica mediante sensor de huellas digitales R307.

---

## Arquitectura del Sistema

El sistema está dividido en tres componentes principales:

1. **Frontend (Cliente)**: Archivos HTML, CSS y JavaScript puros que corren en el navegador
2. **Backend (Servidor)**: Servidor Node.js con Express que expone una API REST
3. **Hardware Biométrico**: Arduino UNO/Nano conectado al sensor de huellas R307 para autenticación biométrica

```
┌─────────────┐     HTTP/JSON     ┌─────────────┐     Serial      ┌─────────────┐
│   Navegador  │ ◄─────────────►  │  server.js   │ ◄────────────►  │   Arduino    │
│  (HTML/JS)   │                   │   (Express)  │                 │  + R307      │
└─────────────┘                   └─────────────┘                 └─────────────┘
                                        │
                                        │ SQLite
                                        ▼
                                  ┌─────────────┐
                                  │  usuarios.db │
                                  └─────────────┘
```

---

## Tecnologías Utilizadas

### Backend
- **Node.js** - Entorno de ejecución
- **Express.js** - Framework web
- **SQLite3** - Base de datos local
- **SerialPort** - Comunicación con Arduino
- **CORS** - Manejo de peticiones cross-origin
- **crypto** - Generación de tokens de sesión

### Frontend
- **HTML5, CSS3, JavaScript Vanilla** - Sin frameworks
- **Fetch API** - Peticiones HTTP

### Hardware
- **Arduino UNO/Nano** - Microcontrolador
- **Sensor R307** - Módulo biométrico de huellas dactilares
- **Librería Adafruit Fingerprint Sensor Library** - Para comunicación con R307

### IA
- **Python** (ia_api.py) - API para generación de dietas con inteligencia artificial
- **Scikit-learn** - Modelo de machine learning para recomendaciones

---

## Estructura de Archivos

```
Modular/
├── server.js              # Servidor principal Express
├── shared.js              # Funciones compartidas (auth, paginación, utilidades)
├── usuarios.db            # Base de datos SQLite
│
├── index.html             # Página de login principal (huella + PIN)
├── home.html              # Página de inicio
├── registro.html          # Registro de nuevos pacientes
├── panel.html             # Panel del paciente
├── trabajador.html        # Panel del trabajador/administrador
├── nutriologo.html        # Panel del nutriólogo
│
├── trabajador.js          # Lógica del panel trabajador
├── nutriologo.js          # Lógica del panel nutriólogo
├── citas-nutricion.js     # Módulo de citas de nutrición
├── progreso-peso.js       # Seguimiento de peso
│
├── styles.css             # Estilos generales
├── trabajador.css         # Estilos panel trabajador
├── nutriologo.css         # Estilos panel nutriólogo
│
├── Registro_huella/
│   └── Registro_huella.ino  # Código Arduino para sensor R307
│
├── ia_api.py              # API de IA para generar dietas
├── entrenar_modelo.py     # Entrenamiento del modelo ML
└── Documentacion/         # Documentación adicional
```

---

## Sistema de Autenticación y Roles

### Tipos de Autenticación

El sistema cuenta con tres métodos de autenticación:

#### 1. Autenticación por Huella Digital (Biométrica)
- Utiliza el sensor R307 conectado vía Arduino
- Los usuarios se registran con su huella durante el proceso de registro
- Al colocar el dedo, el sensor identifica la huella y autentica al usuario

#### 2. Autenticación por PIN
- Alternativa a la huella digital
- Requiere ID de usuario + PIN (4-8 dígitos)
- Se registra desde `registro.html`

#### 3. Autenticación por Usuario/Contraseña (Administradores)
- Para acceder a paneles de trabajador/nutriólogo
- Credenciales por defecto: `admin` / `admin123`
- Endpoint: `POST /admin-login`

### Sistema de Roles

| Rol | Acceso | Descripción |
|---|---|---|
| `paciente` | Panel de paciente (`panel.html`) | Puede ver su perfil, dieta, agendar citas con médicos, ver sus próximas citas |
| `admin` | Panel trabajador (`trabajador.html`) y Panel nutriólogo (`nutriologo.html`) | Acceso completo a gestión de pacientes, citas, dietas, etc. |

### Gestión de Sesiones

- **Almacenamiento**: Sesiones en memoria (`Map`) + tabla `sessions` en SQLite (persistentes)
- **Tokens**: UUID v4 generados con `crypto.randomUUID()`
- **TTL**: 2 horas de duración
- **Limpieza**: Se limpian sesiones expiradas cada 15 minutos
- **Pasaje de token**: Puede enviarse por query string `?token=` o header `Authorization: Bearer <token>`

### Middlewares de Autenticación

```javascript
// Verifica que exista una sesión válida
function requireAuth(req, res, next)

// Verifica que la sesión pertenezca a un usuario con rol 'admin'
function requireAdmin(req, res, next)
```

---

## Módulos del Sistema

### 1. Panel del Paciente (`panel.html`)

**Funcionalidades:**
- Visualización de perfil (edad, peso, estatura, actividad física)
- Visualización de dieta recomendada (desayuno, comida, cena)
- Agendado de citas con médicos
- Visualización de próximas citas
- Cierre de sesión

**Endpoints utilizados:**
- `GET /session` - Verificar sesión
- `GET /dieta` - Obtener dieta del paciente
- `GET /medicos` - Listar médicos disponibles
- `GET /citas/:medicoId` - Obtener fechas ocupadas por médico
- `POST /citas` - Agendar nueva cita
- `GET /mis-citas` - Ver citas del paciente

### 2. Panel del Trabajador (`trabajador.html`)

**Funcionalidades:**
- **Gestión de Pacientes**: Listar, buscar, editar, eliminar pacientes
- **Historial de Citas Generales**: Ver, reagendar, eliminar citas con médicos
- **Búsqueda con validación**: Solo acepta números al buscar por ID (evita búsquedas con letras como "1a")
- **Edición de pacientes**: Normaliza estatura (acepta cm, metros, coma o punto)
- **Autenticación con credenciales admin**

**Validaciones implementadas:**
- Búsqueda por ID: Si contiene dígitos debe ser solo dígitos (`/^\d+$/`)
- Estatura: Normaliza y convierte entre cm (100-250) y metros (0.5-2.5)

### 3. Panel del Nutriólogo (`nutriologo.html`)

**Funcionalidades:**
- **Gestión de Pacientes**: Selección y visualización de pacientes
- **Agenda de Citas de Nutrición**: Crear, editar, eliminar citas con seguimiento
- **Seguimiento de Peso**: Registro de peso con cálculo automático de IMC, gráficas de evolución
- **Planes Alimenticios (Dietas)**: CRUD completo de dietas con desayuno, colaciones, comida, cena y recomendaciones
- **Recomendación con IA**: Generación automática de dietas basadas en datos del paciente
- **Historial Clínico**: Seguimiento integral del paciente
- **Cálculo automático de IMC**: Convierte estatura entre cm/metros automáticamente

### 4. Sistema de Registro (`registro.html`)

**Funcionalidades:**
- Registro completo de paciente (datos personales, antropométricos, actividad, patologías, objetivos)
- Configuración de PIN
- **Registro de huella digital** vía Arduino
- Validación de campos obligatorios
- Normalización de estatura

---

## Sistema de Huella Digital (Arduino + R307)

### Descripción del Hardware

El **Sensor de Huellas R307** es un módulo biométrico óptico que permite capturar, almacenar y comparar huellas dactilares. Se comunica con Arduino mediante comunicación serie TTL a 57600 baudios.

### Conexiones Físicas

Según la documentación del proyecto:

| Cable | Conexión Arduino | Descripción |
|---|---|---|
| Amarillo | Pin 2 (RX) | Conexión TX del R307 |
| Blanco | Pin 3 (TX) | Conexión RX del R307 |
| VCC | 5V | Alimentación |
| GND | GND | Tierra |

**Configuración en código Arduino:**
```cpp
SoftwareSerial mySerial(2, 3); // RX, TX
Adafruit_Fingerprint finger(&mySerial);
```

### Código Arduino (`Registro_huella.ino`)

#### Inicialización (`setup()`)
```cpp
void setup() {
  Serial.begin(9600);      // Comunicación con PC/Node.js
  mySerial.begin(57600);   // Comunicación con sensor R307
  finger.begin(57600);
  
  // Verifica conexión con sensor
  if (!finger.verifyPassword()) {
    Serial.println("ERROR: Sensor no encontrado");
    while (1) { delay(100); }
  }
  
  finger.getTemplateCount();
  Serial.println("Sistema listo...");
}
```

#### Proceso de Enrolamiento (`enrollFingerprint()`)

El enrolamiento requiere **3 capturas** de la misma huella para mayor precisión:

1. **STEP1**: Colocar dedo por primera vez - Captura imagen (`getImage()`)
2. **STEP2**: Retirar dedo y esperar a que se retire completamente
3. **STEP3**: Colocar dedo nuevamente por segunda vez - Captura segunda imagen
4. **Procesamiento**: Convierte imágenes a template (`image2Tz()`), crea modelo (`createModel()`) y almacena en posición ID (`storeModel(id)`)

```cpp
void enrollFingerprint(int id) {
  uint8_t p;
  Serial.println("ENROLL:STEP1");
  
  // Primera captura
  while (true) {
    uint8_t p = finger.getImage();
    if (p == FINGERPRINT_OK) {
      Serial.println("IMAGE OK");
      break;
    }
    if (p != FINGERPRINT_NOFINGER) {
      Serial.print("ERROR=");
      Serial.println(p);
    }
    delay(200);
  }
  
  Serial.println("ENROLL:STEP2");
  // Esperar a que retire el dedo
  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    delay(100);
  }
  
  Serial.println("ENROLL:STEP3");
  // Segunda captura
  while (finger.getImage() != FINGERPRINT_OK) {
    delay(100);
  }
  
  p = finger.image2Tz(2);      // Convertir a template
  if (p != FINGERPRINT_OK) { Serial.println("ENROLL:ERROR"); return; }
  
  p = finger.createModel();     // Crear modelo
  if (p != FINGERPRINT_OK) { Serial.println("ENROLL:ERROR"); return; }
  
  p = finger.storeModel(id);    // Guardar en ID especificado
  if (p != FINGERPRINT_OK) { Serial.println("ENROLL:ERROR"); return; }
  
  Serial.println("ENROLL:OK");
}
```

#### Detección/Autenticación (`detectarHuella()`)

Cuando no está en modo enrolamiento, el Arduino escanea continuamente:

```cpp
void detectarHuella() {
  uint8_t p = finger.getImage();
  if (p != FINGERPRINT_OK) return;
  
  p = finger.image2Tz();      // Convertir imagen a template
  if (p != FINGERPRINT_OK) return;
  
  p = finger.fingerSearch();  // Buscar en base de datos del sensor
  if (p != FINGERPRINT_OK) return;
  
  Serial.println(finger.fingerID); // Enviar ID encontrado al servidor
  delay(1000); // Evitar lecturas múltiples
}
```

#### Eliminación de Huella
```cpp
void deleteFingerprint(int id) {
  uint8_t p = finger.deleteModel(id);
  if (p == FINGERPRINT_OK) {
    Serial.print("DELETE:OK:");
    Serial.println(id);
  } else {
    Serial.print("DELETE:ERROR:");
    Serial.println(p);
  }
}
```

### Comunicación con Node.js

El servidor Node.js se comunica con Arduino por puerto serial (`COM3` por defecto):

```javascript
const port = new SerialPort({ path: 'COM3', baudRate: 9600 }, (err) => {
  if (err) console.error("Error al abrir COM3:", err.message);
});
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
```

**Comandos enviados desde Node.js al Arduino:**
- `ENROLL:<id>` - Iniciar proceso de enrolamiento para el ID especificado
- `DELETE:<id>` - Eliminar huella con el ID especificado

**Mensajes recibidos desde Arduino:**
- `ENROLL:STEP1`, `ENROLL:STEP2`, `ENROLL:STEP3` - Progreso del enrolamiento
- `IMAGE OK` - Imagen capturada correctamente
- `ENROLL:OK` - Enrolamiento exitoso
- `ENROLL:ERROR` - Error en enrolamiento
- `ENROLL:ID_INVALIDO:<id>` - ID fuera de rango (1-255)
- `<id>` - ID de huella detectada (al autenticar)
- `DELETE:OK:<id>` / `DELETE:ERROR:<codigo>` - Resultado de eliminación

### Flujo de Autenticación por Huella

1. **Usuario coloca dedo** en el sensor R307
2. **Arduino** detecta la huella, la compara con su base de datos interna y envía el ID por serial
3. **Servidor Node.js** recibe el ID vía serial, lo busca en la tabla `usuarios`
4. **Si existe**: Crea sesión con token y marca `ultimoDetectado` para que el cliente lo recoja
5. **Cliente** hace polling a `/session` o `/login-session` para obtener el token
6. **Redirección** al panel correspondiente según el tipo de usuario

```javascript
// En server.js - recepción de huella
parser.on('data', (data) => {
  const msg = data.toString().trim();
  // ... procesamiento de mensajes ...
  
  // Detección exitosa
  if (/^\d+$/.test(msg)) {
    const huellaId = parseInt(msg);
    db.get("SELECT * FROM usuarios WHERE id = ?", [huellaId], (err, row) => {
      if (row) {
        ultimoDetectado = row;
      }
    });
  }
});
```

### Requisitos del R307

- **Capacidad**: Hasta 1000 huellas (dependiendo del modelo)
- **Velocidad**: ~0.5 segundos para búsqueda
- **Tasa de falsa aceptación**: < 0.001%
- **Tasa de falsa rechazo**: < 0.1%
- **Voltaje**: 3.6V - 6.0V (5V con regulador)
- **Interfaz**: UART TTL
- **Baudios**: 57600 por defecto

---

## Base de Datos

El sistema utiliza **SQLite3** con archivo `usuarios.db`. Se crea automáticamente al iniciar el servidor.

### Esquema de Tablas

#### `usuarios`
Almacena la información de los pacientes
```sql
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT,
  edad INTEGER,
  peso REAL,
  estatura REAL,
  actividad TEXT,
  patologias TEXT,
  objetivo TEXT,
  ingredientes_evitar TEXT,
  sexo TEXT DEFAULT 'no_definido'
);
```

#### `credenciales`
Almacena PINs para autenticación alternativa
```sql
CREATE TABLE credenciales (
  usuario_id INTEGER UNIQUE,
  pin TEXT,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
);
```

#### `medicos`
Catálogo de médicos para agendar citas
```sql
CREATE TABLE medicos (
  id INTEGER PRIMARY KEY,
  nombre TEXT
);
```

#### `citas`
Citas generales entre pacientes y médicos
```sql
CREATE TABLE citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuarioId INTEGER,
  medicoId INTEGER,
  fecha TEXT,
  FOREIGN KEY(usuarioId) REFERENCES usuarios(id),
  FOREIGN KEY(medicoId) REFERENCES medicos(id)
);
```

#### `citas_nutricion`
Citas de seguimiento con el nutriólogo
```sql
CREATE TABLE citas_nutricion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT,
  motivo TEXT,
  observaciones TEXT,
  peso REAL,
  imc REAL,
  estado TEXT DEFAULT 'Programada',
  FOREIGN KEY(paciente_id) REFERENCES usuarios(id)
);
```

#### `dietas`
Planes alimentarios creados por el nutriólogo
```sql
CREATE TABLE dietas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL,
  fecha TEXT,
  desayuno TEXT,
  colacion1 TEXT,
  comida TEXT,
  colacion2 TEXT,
  cena TEXT,
  recomendaciones TEXT,
  FOREIGN KEY(paciente_id) REFERENCES usuarios(id)
);
```

#### `registros_peso`
Seguimiento independiente de peso
```sql
CREATE TABLE registros_peso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  peso REAL NOT NULL,
  imc REAL,
  FOREIGN KEY(paciente_id) REFERENCES usuarios(id)
);
```

#### `sessions`
Sesiones persistentes
```sql
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_json TEXT,
  created_at INTEGER
);
```

---

## API REST

El servidor corre en `http://localhost:4000`

### Autenticación
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `POST` | `/admin-login` | No | Login para administrador/trabajador/nutriólogo |
| `POST` | `/login-pin` | No | Login con ID + PIN |
| `POST` | `/registrar-pin` | No | Registrar PIN para usuario |
| `GET` | `/session` | No | Verificar sesión o estado de huella |
| `POST` | `/login-session` | No | Completar login por huella |
| `GET` | `/logout` | No | Cerrar sesión |

### Pacientes
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `POST` | `/registrar` | No | Registrar nuevo paciente |
| `GET` | `/usuarios` | Admin | Listar todos los pacientes (paginado) |
| `GET` | `/usuarios/buscar` | Admin | Buscar pacientes por nombre o ID |
| `PUT` | `/usuario/:id` | Admin | Editar paciente |
| `DELETE` | `/usuario/:id` | Admin | Eliminar paciente |

### Citas Generales
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/medicos` | Auth | Listar médicos |
| `GET` | `/citas/:medicoId` | Auth | Fechas ocupadas por médico |
| `POST` | `/citas` | Auth | Agendar cita (paciente) |
| `GET` | `/mis-citas` | Auth | Citas del paciente autenticado |
| `GET` | `/historial-citas` | Admin | Historial completo de citas |
| `PUT` | `/citas/:id` | Admin | Reagendar cita |
| `DELETE` | `/citas/:id` | Admin | Eliminar cita |

### Citas de Nutrición
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/nutricion/citas` | Admin | Todas las citas de nutrición |
| `GET` | `/nutricion/citas/:pacienteId` | Admin | Citas de un paciente |
| `GET` | `/nutricion/cita/:id` | Admin | Obtener cita específica |
| `POST` | `/nutricion/citas` | Admin | Crear cita de nutrición |
| `PUT` | `/nutricion/citas/:id` | Admin | Editar cita de nutrición |
| `DELETE` | `/nutricion/citas/:id` | Admin | Eliminar cita de nutrición |

### Dietas
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/dieta` | Auth | Dieta actual del paciente autenticado |
| `GET` | `/dietas/:pacienteId` | Admin | Todas las dietas de un paciente |
| `GET` | `/dieta/:id` | Admin | Obtener dieta por ID |
| `POST` | `/dietas` | Admin | Crear plan alimentario |
| `PUT` | `/dietas/:id` | Admin | Editar plan alimentario |
| `DELETE` | `/dietas/:id` | Admin | Eliminar plan alimentario |
| `POST` | `/api/generar-dieta-ia` | Admin | Generar dieta con IA |

### Seguimiento de Peso
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/progreso/:pacienteId` | Admin | Datos de progreso completo |
| `POST` | `/peso` | Admin | Registrar peso independiente |
| `GET` | `/peso/:pacienteId` | Admin | Historial de pesos |
| `DELETE` | `/peso/:id` | Admin | Eliminar registro de peso |

### Biométrico
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `POST` | `/enroll` | No | Iniciar enrolamiento de huella |
| `GET` | `/estado` | No | Estado del sensor |
| `GET` | `/ultimo-error` | No | Último error del sensor |
| `GET` | `/detectando` | No | Estado de detección |

---

## Configuración e Instalación

### Prerrequisitos
- Node.js (v14 o superior)
- Python 3.x (para IA)
- Arduino IDE
- Librería Adafruit Fingerprint Sensor

### Instalación

1. **Clonar o descargar el proyecto**
```bash
cd Modular
```

2. **Instalar dependencias de Node.js**
```bash
npm install express sqlite3 serialport @serialport/parser-readline cors
```

3. **Configurar Arduino**
   - Abrir `Registro_huella/Registro_huella.ino` en Arduino IDE
   - Instalar librería `Adafruit Fingerprint Sensor Library` desde Library Manager
   - Seleccionar puerto correcto (COM3 por defecto)
   - Subir código al Arduino

4. **Configurar puerto serial**
   - En `server.js` línea 19: Cambiar `'COM3'` por el puerto de tu Arduino

5. **Iniciar servidor Node.js**
```bash
node server.js
```
El servidor correrá en `http://localhost:4000`

6. **Iniciar API de IA (opcional)**
```bash
python ia_api.py
```

7. **Abrir aplicación**
   - Navegar a `http://localhost:4000` o abrir `index.html`

### Configuración de Datos Iniciales

Al iniciar por primera vez, se crearán las tablas automáticamente. Puedes agregar médicos manualmente a la BD:

```sql
INSERT INTO medicos (nombre) VALUES ('Dr. Juan Pérez');
INSERT INTO medicos (nombre) VALUES ('Dra. María García');
```

---

## Flujo de Uso

### Registro de Nuevo Paciente

1. Ir a `index.html` → "Registrarse"
2. Llenar formulario con datos personales y médicos
3. Configurar PIN
4. **Registrar huella**: Presionar "Registrar Huella", colocar dedo 3 veces cuando se indique
5. Completar registro

### Login de Paciente

**Opción 1 - Huella digital:**
1. En `index.html`, colocar dedo en sensor
2. El sistema detecta automáticamente y redirige al panel

**Opción 2 - PIN:**
1. En `index.html`, ingresar ID y PIN
2. Presionar "Iniciar Sesión"

### Acceso a Paneles Administrativos

1. Ir a `home.html` o desde index
2. Seleccionar "Panel trabajador" o "Panel nutriólogo"
3. Ingresar credenciales: `admin` / `admin123`
4. Acceder al panel correspondiente

### Flujo de Atención Nutricional

1. **Trabajador/Admin** registra o busca paciente
2. **Nutriólogo** agenda cita de nutrición desde su panel
3. **En consulta**: Registra peso, calcula IMC, toma observaciones
4. **Crea plan alimentario** manualmente o con IA
5. **Seguimiento**: Registra pesos periódicos y monitorea progreso

---

## Correcciones Realizadas

### 1. Validación de búsqueda con "1a" en panel de trabajador
**Problema:** El buscador aceptaba búsquedas como "1a" aunque el backend validaba solo números.

**Solución:** Se agregó validación en frontend con `/\d/.test(q) && !/^\d+$/.test(q)` que detecta si hay dígitos mezclados con letras, muestra error, limpia la tabla y resetea paginación.

**Archivos modificados:** `trabajador.js`

### 2. Validación de estatura al editar desde panel de trabajador
**Problema:** Al editar desde el panel de trabajador no se normalizaba la estatura correctamente.

**Solución:** Se implementó normalización idéntica al backend - elimina "cm", acepta coma/punto, convierte entre cm y metros con validaciones (0.5-2.5m o 50-250cm).

**Archivos modificados:** `trabajador.js`

### 3. Validación en buscador de historial de citas
**Problema:** Faltaba la misma validación que se agregó al buscador de pacientes.

**Solución:** Se aplicó la misma lógica de validación para mantener consistencia.

**Archivos modificados:** `trabajador.js`

### 4. Protección de rutas con roles
**Problema:** Muchas rutas administrativas solo usaban `requireAuth` permitiendo acceso a pacientes.

**Solución:** 
- Pacientes ahora se registran con `role: 'paciente'` al autenticar
- Rutas críticas (gestión de usuarios, dietas, citas, historial) ahora usan `requireAdmin`
- Se mantiene `requireAuth` solo para rutas que pacientes necesitan (`/mis-citas`, `/citas`, `/dieta` para su propia dieta)
- Se agregó endpoint `GET /dieta` para que pacientes vean su dieta actual

**Archivos modificados:** `server.js`

### 5. Corrección en flujo de búsqueda inválida
**Problema:** Al mostrar error por búsqueda inválida, se seguían mostrando resultados anteriores.

**Solución:** Al detectar búsqueda inválida, se limpia la tabla, se muestra mensaje de error, se resetea el estado de paginación y se hace `return` sin ejecutar búsqueda.

**Archivos modificados:** `trabajador.js`

---

## Notas Importantes

- **Puerto serial**: Verificar que el Arduino esté en COM3 o modificar en `server.js`
- **Credenciales admin**: Cambiar `ADMIN_USER` y `ADMIN_PASS` en `server.js` para producción
- **Sesiones**: Se almacenan en memoria, se pierden al reiniciar servidor pero se restauran desde BD
- **Rango de IDs para huellas**: 1-255 según código Arduino
- **Timeout de sesión**: 2 horas
- **Normalización de estatura**: El sistema acepta ambos formatos y siempre guarda en metros internamente

---

## Soporte y Mantenimiento

Para cualquier problema con el sensor R307:
1. Verificar conexiones físicas
2. Comprobar puerto COM en administrador de dispositivos
3. Verificar que la librería Adafruit esté instalada
4. Revisar baudios (57600 para sensor, 9600 para serial con PC)
5. Si el sensor no responde, verificar alimentación (5V adecuado)

Para reiniciar el sistema completo:
1. Cerrar servidor Node.js
2. Desconectar y reconectar Arduino
3. Iniciar servidor: `node server.js`
4. Abrir navegador
