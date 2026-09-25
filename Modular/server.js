const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const cors = require('cors');
const crypto = require('crypto');

const fetch = global.fetch;

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('.')); // Sirve HTML, CSS, JS desde el mismo servidor

// 🔌 Arduino
let port = null;
let parser = null;
try {
  port = new SerialPort({ path: 'COM3', baudRate: 9600 }, (err) => {
    if (err) console.error("Error al abrir COM3:", err.message);
  });
  port.on('error', (err) => {
    console.error("Error en puerto serial:", err.message);
  });
  parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
} catch (err) {
  console.error("Error al crear puerto serial:", err.message);
}

// 💾 DB
const db = new sqlite3.Database('./usuarios.db');

let estadoSensor = "";
let ultimoDetectado = null;
let ultimoUsuario = null;
let ultimoError = null;
let ultimaDeteccion = 0;

// 🎫 Sessions (token -> { user, createdAt })
// Las sesiones se guardan en memoria y en la tabla `sessions` de la BD,
// para que sobrevivan a reinicios del servidor.
const sessions = new Map();
const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 horas

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

function borrarSesion(token) {
  sessions.delete(token);
  db.run("DELETE FROM sessions WHERE token = ?", [token], () => {});
}

function limpiarSesionesExpiradas() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      borrarSesion(token);
    }
  }
}
setInterval(limpiarSesionesExpiradas, 15 * 60 * 1000); // cada 15 min

function crearSesion(user) {
  const token = crypto.randomUUID();
  const createdAt = Date.now();
  sessions.set(token, { user, createdAt });
  db.run(
    "INSERT OR REPLACE INTO sessions (token, user_json, created_at) VALUES (?, ?, ?)",
    [token, JSON.stringify(user), createdAt],
    (err) => {
      if (err) console.error("[Sesiones] Error al guardar en BD:", err.message);
    }
  );
  return token;
}

function obtenerSesion(token) {
  if (!token || !sessions.has(token)) return null;
  const session = sessions.get(token);
  if (Date.now() - session.createdAt > SESSION_TTL) {
    borrarSesion(token);
    return null;
  }
  return session.user;
}

function requireAuth(req, res, next) {
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  const user = obtenerSesion(token);
  if (!user) {
    console.log(`[Auth] 401 - path=${req.path} token=${token ? token.slice(0, 8) + '...' : 'ninguno'}`);
    return res.status(401).json({ error: 'No autorizado. Inicia sesión primero.' });
  }
  req.user = user;
  req.token = token;
  next();
}

// 🧾 TABLAS
db.serialize(() => {

  db.run(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    nombre TEXT,
    edad INTEGER,
    peso REAL,
    estatura REAL,
    actividad TEXT,
    patologias TEXT,
    objetivo TEXT,
    ingredientes_evitar TEXT
  )`);

  db.run(`
  CREATE TABLE IF NOT EXISTS credenciales (
    usuario_id INTEGER UNIQUE,
    pin TEXT,
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
  )`);

  // Migración para DBs existentes
  db.run("ALTER TABLE usuarios ADD COLUMN ingredientes_evitar TEXT", () => {});
  db.run("ALTER TABLE usuarios ADD COLUMN sexo TEXT DEFAULT 'no_definido'", () => {});

  db.run(`
  CREATE TABLE IF NOT EXISTS medicos (
    id INTEGER PRIMARY KEY,
    nombre TEXT
  )`);

  db.run(`
  CREATE TABLE IF NOT EXISTS citas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuarioId INTEGER,
    medicoId INTEGER,
    fecha TEXT
  )`);

  db.run(`
  CREATE TABLE IF NOT EXISTS citas_nutricion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL,
    fecha TEXT,
    hora TEXT,
    motivo TEXT,
    observaciones TEXT,
    peso REAL,
    imc REAL,
    estado TEXT DEFAULT 'Programada',
    FOREIGN KEY(paciente_id) REFERENCES usuarios(id)
  )`);

  db.run(`
  CREATE TABLE IF NOT EXISTS registros_peso (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL,
    fecha TEXT,
    peso REAL,
    imc REAL,
    FOREIGN KEY(paciente_id) REFERENCES usuarios(id)
  )`);

  db.run(`
  CREATE TABLE IF NOT EXISTS dietas (
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
  )`);

  db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_json TEXT,
    created_at INTEGER
  )`);

  db.run(`
  INSERT OR IGNORE INTO medicos (id, nombre) VALUES
  (1, 'Dr. García - Médico General'),
  (2, 'Dra. López - Nutrióloga'),
  (3, 'Dr. Martínez - Endocrinólogo')
  `);

});

// ♻️ Recuperar sesiones activas al arrancar (persistencia entre reinicios)
db.all("SELECT token, user_json, created_at FROM sessions", [], (err, rows) => {
  if (err) {
    console.error("[Sesiones] Error al recuperar sesiones:", err.message);
    return;
  }
  const now = Date.now();
  let cargadas = 0;
  rows.forEach(r => {
    if (now - r.created_at > SESSION_TTL) {
      db.run("DELETE FROM sessions WHERE token = ?", [r.token], () => {});
      return;
    }
    try {
      sessions.set(r.token, { user: JSON.parse(r.user_json), createdAt: r.created_at });
      cargadas++;
    } catch (e) {
      db.run("DELETE FROM sessions WHERE token = ?", [r.token], () => {});
    }
  });
  console.log(`[Sesiones] ${cargadas} sesiones activas recuperadas`);
});

// 🔄 Arduino
if (parser) {
  parser.on('data', (data) => {
    const msg = data.trim();
    console.log("[Arduino] Mensaje recibido:", msg);

    if (msg.startsWith("ENROLL:")) {
      estadoSensor = msg;
      console.log("[Arduino] Estado enroll:", msg);
      return;
    }

    if (msg.startsWith("DEBUG:")) {
      console.log("[Arduino Debug]", msg);
      return;
    }

    const id = parseInt(msg);

    if (!isNaN(id) && id > 0) {
      console.log(`[Arduino] Huella detectada - ID: ${id}`);
      ultimaDeteccion = Date.now();
      ultimoDetectado = { id };
      
      db.get("SELECT * FROM usuarios WHERE id = ?", [id], (err, row) => {
        if (err) {
          console.error("[DB] Error al buscar usuario:", err.message);
          ultimoDetectado = null;
          ultimoError = { id, mensaje: "Error al buscar usuario en la base de datos" };
          return;
        }
        
        if (row) {
          console.log(`[DB] Usuario encontrado: ${row.nombre} (ID: ${row.id})`);
          ultimoDetectado = row;
          ultimoUsuario = row;
        } else {
          console.log(`[DB] Usuario no encontrado para ID: ${id}`);
          ultimoDetectado = null;
          ultimoUsuario = { id, nombre: "No registrado" };
          ultimoError = { id, mensaje: `Huella ID ${id} no registrada. Regístrate primero.` };
        }
      });
    }
  });
  
  port.on('open', () => {
    console.log("[Arduino] Puerto serial abierto en COM3");
  });
  
  port.on('error', (err) => {
    console.error("[Arduino] Error en puerto serial:", err.message);
  });
}

// 📝 Registro
app.post('/registro', (req, res) => {
  const { id, nombre, edad, peso, estatura, actividad, patologias, objetivo, ingredientes_evitar, sexo } = req.body;

  // Validación
  if (!id || !nombre || !edad || !peso || !estatura || !actividad || !objetivo) {
    return res.status(400).json({ error: "Todos los campos obligatorios deben ser completados" });
  }
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: "ID inválido" });
  if (isNaN(edad) || edad < 1 || edad > 120) return res.status(400).json({ error: "Edad inválida" });
  if (isNaN(peso) || peso < 20 || peso > 500) return res.status(400).json({ error: "Peso inválido" });
  if (isNaN(estatura) || estatura < 0.5 || estatura > 2.5) return res.status(400).json({ error: "Estatura inválida" });

  db.run(`
    INSERT INTO usuarios 
    (id, nombre, edad, peso, estatura, actividad, patologias, objetivo, ingredientes_evitar, sexo) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, nombre, edad, peso, estatura, actividad, patologias || '', objetivo, ingredientes_evitar || '', sexo || 'no_definido'],
    (err) => {
      if (err) return res.status(500).json({ error: "Error al registrar: " + err.message });
      res.json({ mensaje: "Usuario registrado" });
    }
  );
});

// 🔎 básicos
app.get('/usuario', (req, res) => res.json(ultimoUsuario));
app.get('/estado', (req, res) => res.json({ estado: estadoSensor }));

// 🔑 Login por ID + PIN
app.post('/login-pin', (req, res) => {
  const { id, pin } = req.body;

  if (!id || !pin) {
    return res.status(400).json({ error: "ID y PIN son requeridos" });
  }

  db.get(
    "SELECT u.* FROM usuarios u JOIN credenciales c ON u.id = c.usuario_id WHERE u.id = ? AND c.pin = ?",
    [id, pin],
    (err, row) => {
      if (err) {
        console.error("[Login PIN] Error:", err.message);
        return res.status(500).json({ error: "Error del servidor" });
      }

      if (!row) {
        return res.status(401).json({ error: "ID o PIN incorrectos" });
      }

      const token = crearSesion(row);
      console.log(`[Login PIN] Sesión creada para: ${row.nombre} (ID: ${row.id})`);
      res.json({ token });
    }
  );
});

// 🔑 Registrar PIN para un usuario existente
app.post('/registrar-pin', (req, res) => {
  const { id, pin } = req.body;

  if (!id || !pin) {
    return res.status(400).json({ error: "ID y PIN son requeridos" });
  }

  if (pin.length < 4 || pin.length > 8) {
    return res.status(400).json({ error: "El PIN debe tener entre 4 y 8 dígitos" });
  }

  db.get("SELECT * FROM usuarios WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: "Error del servidor" });
    if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

    db.run(
      "INSERT OR REPLACE INTO credenciales (usuario_id, pin) VALUES (?, ?)",
      [id, pin],
      (err) => {
        if (err) return res.status(500).json({ error: "Error al guardar PIN" });
        console.log(`[Registro PIN] PIN registrado para usuario ID: ${id}`);
        res.json({ mensaje: "PIN registrado correctamente" });
      }
    );
  });
});

// 🎫 Verificar sesión (token) o estado de detección por huella
app.get('/session', (req, res) => {
  const token = req.query.token;

  if (token) {
    const user = obtenerSesion(token);
    if (user) {
      return res.json({ valid: true, user });
    }
    return res.json({ valid: false });
  }

  // Fingerprint polling (índex.html)
  if (ultimoDetectado) {
    // No consumir aquí: /login-session es quien finaliza la sesión
    return res.json({ pending: true });
  }
  res.json(null);
});

app.post('/login-session', (req, res) => {

  console.log("LOGIN-SESSION llamado");
  console.log("ultimoDetectado:", ultimoDetectado);

  if (!ultimoDetectado) return res.json(null);

  if (!ultimoDetectado.nombre) {
    console.log("Usuario pendiente...");
    return res.json({ pending: true });
  }

  const user = ultimoDetectado;
  ultimoDetectado = null;

  const token = crearSesion(user);

  console.log("TOKEN CREADO:", token);
  console.log("USUARIO:", user.nombre);

  res.json({ token, user });
});

app.get('/ultimo-error', (req, res) => {
  const e = ultimoError;
  ultimoError = null;
  res.json(e);
});

app.get('/detectando', (req, res) => {
  res.json({ detectando: Date.now() - ultimaDeteccion < 2000 });
});

// 🔐 enroll
app.post('/enroll', (req, res) => {
  const { id } = req.body;

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: "ID inválido" });
  }

  if (!port || !port.isOpen) {
    estadoSensor = "ENROLL:ERROR";
    return res.status(500).json({ error: "Puerto serial no está abierto. Verifica la conexión del Arduino." });
  }

  estadoSensor = "STARTING";

  port.write(`ENROLL:${id}\n`, (err) => {
    if (err) {
      console.error("Error escribiendo al puerto serial:", err.message);
      estadoSensor = "ENROLL:ERROR";
      return res.status(500).json({ error: "Error de comunicación con el sensor" });
    }
    res.json({ mensaje: "Iniciando registro..." });
  });
});

// 👨‍⚕️ obtener médicos
app.get("/medicos", requireAuth, (req, res) => {
  db.all("SELECT * FROM medicos", [], (err, rows) => {
    res.json(rows);
  });
});

// 📅 citas por médico
app.get("/citas/:medicoId", requireAuth, (req, res) => {
  db.all(
    "SELECT fecha FROM citas WHERE medicoId = ?",
    [req.params.medicoId],
    (err, rows) => {
      res.json(rows.map(r => r.fecha));
    }
  );
});

// 📌 crear cita
app.post("/citas", requireAuth, (req, res) => {
  const { medicoId, fecha } = req.body;
  const user = req.user;

  if (!user) {
    return res.json({ mensaje: "No hay usuario activo" });
  }

  if (!fecha) {
    return res.status(400).json({ error: "La fecha es requerida" });
  }

  db.get(
    "SELECT * FROM citas WHERE medicoId = ? AND fecha = ?",
    [medicoId, fecha],
    (err, row) => {
      if (row) return res.json({ mensaje: "Fecha ocupada" });

      db.run(
        "INSERT INTO citas (usuarioId, medicoId, fecha) VALUES (?, ?, ?)",
        [user.id, medicoId, fecha],
        () => res.json({ mensaje: "Cita guardada correctamente" })
      );
    }
  );
});

// 📅 citas del usuario
app.get("/mis-citas", requireAuth, (req, res) => {
  const user = req.user;
  if (!user) return res.json([]);

  db.all(`
    SELECT citas.fecha, medicos.nombre
    FROM citas
    JOIN medicos ON citas.medicoId = medicos.id
    WHERE citas.usuarioId = ?
  `, [user.id], (err, rows) => {
    res.json(rows);
  });
});

// ============================================================
// 📋 HISTORIAL DE CITAS — Panel de Administración
// ============================================================
app.get('/historial-citas', requireAuth, (req, res) => {
  const { page, limit, offset } = paginate(req);
  const q = req.query.q;
  let baseQuery = `
    FROM citas
    JOIN usuarios ON citas.usuarioId = usuarios.id
    JOIN medicos ON citas.medicoId = medicos.id
  `;
  let whereClause = '';
  let params = [];
  if (q) {
    const id = parseInt(q);
    if (!isNaN(id)) {
      whereClause = ` WHERE citas.usuarioId = ?`;
      params.push(id);
    } else {
      whereClause = ` WHERE usuarios.nombre LIKE ? OR medicos.nombre LIKE ?`;
      params.push(`%${q}%`, `%${q}%`);
    }
  }
  db.get("SELECT COUNT(*) AS total " + baseQuery + whereClause, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: 'Error al contar historial' });
    const selectQuery = `
      SELECT citas.id, citas.usuarioId, citas.medicoId, usuarios.nombre AS paciente,
             medicos.nombre AS medico, citas.fecha
    ` + baseQuery + whereClause + ` ORDER BY citas.fecha DESC LIMIT ? OFFSET ?`;
    db.all(selectQuery, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener historial de citas' });
      sendPaginated(res, rows, countRow.total, page, limit);
    });
  });
});

// ============================================================
// 🔄 REAGENDAR CITA
// ============================================================
app.put('/citas/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { medicoId, fecha } = req.body;

  if (!medicoId || !fecha) {
    return res.status(400).json({ error: 'Faltan datos: medicoId y fecha son requeridos' });
  }

  db.get("SELECT * FROM citas WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!row) return res.status(404).json({ error: 'Cita no encontrada' });

    db.get(
      "SELECT * FROM citas WHERE medicoId = ? AND fecha = ? AND id != ?",
      [medicoId, fecha, id],
      (err, conflicto) => {
        if (conflicto) return res.json({ error: 'Fecha ocupada para ese médico' });

        db.run(
          "UPDATE citas SET medicoId = ?, fecha = ? WHERE id = ?",
          [medicoId, fecha, id],
          function (err) {
            if (err) return res.status(500).json({ error: 'Error al reagendar cita' });
            res.json({ success: true, message: 'Cita reagendada correctamente' });
          }
        );
      }
    );
  });
});

// ============================================================
// 🗑️ ELIMINAR CITA GENERAL
// ============================================================
app.delete('/citas/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM citas WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!row) return res.status(404).json({ error: 'Cita no encontrada' });

    db.run("DELETE FROM citas WHERE id = ?", [id], function (err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar cita' });
      res.json({ success: true, message: 'Cita eliminada correctamente' });
    });
  });
});

// ============================================================
// 🥗 CITAS DE NUTRICION — Módulo Historial de Citas
// ============================================================

// Obtener todas las citas de nutrición (con paginación)
app.get('/nutricion/citas', requireAuth, (req, res) => {
  const { page, limit, offset } = paginate(req);
  db.get("SELECT COUNT(*) AS total FROM citas_nutricion", [], (err, countRow) => {
    if (err) return res.status(500).json({ error: 'Error al contar citas' });
    db.all(`
      SELECT cn.*, u.nombre AS paciente_nombre
      FROM citas_nutricion cn
      JOIN usuarios u ON cn.paciente_id = u.id
      ORDER BY cn.fecha DESC, cn.hora DESC
      LIMIT ? OFFSET ?
    `, [limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener citas de nutrición' });
      sendPaginated(res, rows, countRow.total, page, limit);
    });
  });
});

// Obtener citas de nutrición de un paciente específico (con paginación)
app.get('/nutricion/citas/:pacienteId', requireAuth, (req, res) => {
  const { page, limit, offset } = paginate(req);
  const pid = req.params.pacienteId;
  db.get("SELECT COUNT(*) AS total FROM citas_nutricion WHERE paciente_id = ?", [pid], (err, countRow) => {
    if (err) return res.status(500).json({ error: 'Error al contar citas' });
    db.all(`
      SELECT cn.*, u.nombre AS paciente_nombre
      FROM citas_nutricion cn
      JOIN usuarios u ON cn.paciente_id = u.id
      WHERE cn.paciente_id = ?
      ORDER BY cn.fecha DESC, cn.hora DESC
      LIMIT ? OFFSET ?
    `, [pid, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener citas del paciente' });
      sendPaginated(res, rows, countRow.total, page, limit);
    });
  });
});

// Crear una nueva cita de nutrición
app.post('/nutricion/citas', requireAuth, (req, res) => {
  const { paciente_id, fecha, hora, motivo, observaciones, peso, imc, estado } = req.body;

  if (!paciente_id || !fecha) {
    return res.status(400).json({ error: 'Paciente y fecha son requeridos' });
  }

  db.get("SELECT * FROM usuarios WHERE id = ?", [paciente_id], (err, user) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!user) return res.status(404).json({ error: 'Paciente no encontrado' });

    db.run(`
      INSERT INTO citas_nutricion (paciente_id, fecha, hora, motivo, observaciones, peso, imc, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      paciente_id,
      fecha,
      hora || '',
      motivo || '',
      observaciones || '',
      peso || null,
      imc || null,
      estado || 'Programada'
    ], function (err) {
      if (err) return res.status(500).json({ error: 'Error al crear cita: ' + err.message });
      res.json({ success: true, id: this.lastID, message: 'Cita creada correctamente' });
    });
  });
});

// Obtener una cita de nutrición por ID
app.get('/nutricion/cita/:id', requireAuth, (req, res) => {
  db.get(`
    SELECT cn.*, u.nombre AS paciente_nombre
    FROM citas_nutricion cn
    JOIN usuarios u ON cn.paciente_id = u.id
    WHERE cn.id = ?
  `, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error al obtener cita' });
    if (!row) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(row);
  });
});

// Actualizar una cita de nutrición
app.put('/nutricion/citas/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { paciente_id, fecha, hora, motivo, observaciones, peso, imc, estado } = req.body;

  db.get("SELECT * FROM citas_nutricion WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!row) return res.status(404).json({ error: 'Cita no encontrada' });

    db.run(`
      UPDATE citas_nutricion SET
        paciente_id = ?, fecha = ?, hora = ?, motivo = ?,
        observaciones = ?, peso = ?, imc = ?, estado = ?
      WHERE id = ?
    `, [
      paciente_id || row.paciente_id,
      fecha || row.fecha,
      hora !== undefined ? hora : row.hora,
      motivo !== undefined ? motivo : row.motivo,
      observaciones !== undefined ? observaciones : row.observaciones,
      peso !== undefined ? peso : row.peso,
      imc !== undefined ? imc : row.imc,
      estado || row.estado,
      id
    ], function (err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar cita' });
      res.json({ success: true, message: 'Cita actualizada correctamente' });
    });
  });
});

// Eliminar una cita de nutrición
app.delete('/nutricion/citas/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM citas_nutricion WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!row) return res.status(404).json({ error: 'Cita no encontrada' });

    db.run("DELETE FROM citas_nutricion WHERE id = ?", [id], function (err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar cita' });
      res.json({ success: true, message: 'Cita eliminada correctamente' });
    });
  });
});

// ============================================================
// 📊 SEGUIMIENTO DE PESO Y PROGRESO
// ============================================================
// Endpoint que devuelve el resumen de progreso de peso de un paciente
// Extrae toda la información de la tabla citas_nutricion
// Diseñado para ser consumido por gráficas futuras sin modificar el backend
app.get('/progreso/:pacienteId', requireAuth, (req, res) => {
  const pacienteId = req.params.pacienteId;

  // Validar que el paciente exista
  db.get("SELECT * FROM usuarios WHERE id = ?", [pacienteId], (err, usuario) => {
    if (err) {
      return res.status(500).json({ error: 'Error del servidor' });
    }
    if (!usuario) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    // Obtener el historial de peso combinando citas de nutricion con peso
    // registrado y los registros de peso independientes (registros_peso)
    db.all(`
      SELECT 'cita' AS origen, c.fecha AS fecha, c.hora AS hora, c.peso AS peso, c.imc AS imc, c.estado AS estado
      FROM citas_nutricion c
      WHERE c.paciente_id = ? AND c.peso IS NOT NULL
      UNION ALL
      SELECT 'registro' AS origen, r.fecha AS fecha, '' AS hora, r.peso AS peso, r.imc AS imc, 'Registro' AS estado
      FROM registros_peso r
      WHERE r.paciente_id = ?
      ORDER BY fecha ASC, hora ASC
    `, [pacienteId, pacienteId], (err, citas) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener progreso' });
      }

      // Si no hay citas con peso registrado, devolver respuesta vacía
      if (!citas || citas.length === 0) {
        return res.json({
          paciente: {
            id: usuario.id,
            nombre: usuario.nombre,
            estatura: usuario.estatura
          },
          pesoInicial: null,
          pesoActual: null,
          imcInicial: null,
          imcActual: null,
          cambioPeso: null,
          historial: []
        });
      }

      // Construir el historial cronológico (formato optimizado para el frontend y gráficas)
      const historial = citas.map(c => ({
        fecha: c.fecha,
        peso: c.peso,
        imc: c.imc,
        estado: c.estado
      }));

      // Calcular resumen de progreso
      const primera = historial[0];
      const ultima = historial[historial.length - 1];

      const pesoInicial = primera.peso;
      const pesoActual = ultima.peso;
      const imcInicial = primera.imc;
      const imcActual = ultima.imc;
      const cambioPeso = parseFloat((pesoActual - pesoInicial).toFixed(2));

      // Calcular peso ideal según fórmula de Devine
      let pesoIdeal = null;
      const estaturaCm = usuario.estatura > 3 ? usuario.estatura : usuario.estatura * 100;
      if (usuario.sexo === 'hombre') {
        pesoIdeal = 50 + 2.3 * ((estaturaCm - 152.4) / 2.54);
      } else if (usuario.sexo === 'mujer') {
        pesoIdeal = 45.5 + 2.3 * ((estaturaCm - 152.4) / 2.54);
      }
      if (pesoIdeal != null) pesoIdeal = parseFloat(pesoIdeal.toFixed(1));

      const diferenciaIdeal = pesoIdeal != null && pesoActual != null
        ? parseFloat((pesoActual - pesoIdeal).toFixed(1))
        : null;

      res.json({
        paciente: {
          id: usuario.id,
          nombre: usuario.nombre,
          estatura: usuario.estatura,
          sexo: usuario.sexo
        },
        pesoInicial,
        pesoActual,
        imcInicial,
        imcActual,
        cambioPeso,
        pesoIdeal,
        diferenciaIdeal,
        historial
      });
    });
  });
});

// ============================================================
// ⚖️ REGISTRO DE PESO INDEPENDIENTE
// Permite al nutriologo registrar el peso del dia sin crear una cita
// ============================================================

// Registrar un peso del paciente (con IMC calculado a partir de su estatura)
app.post('/peso', requireAuth, (req, res) => {
  const { paciente_id, fecha, peso } = req.body;

  if (!paciente_id || !fecha || peso == null) {
    return res.status(400).json({ error: 'Paciente, fecha y peso son requeridos' });
  }
  if (isNaN(peso) || peso < 20 || peso > 500) {
    return res.status(400).json({ error: 'Peso inválido' });
  }

  db.get("SELECT * FROM usuarios WHERE id = ?", [paciente_id], (err, user) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!user) return res.status(404).json({ error: 'Paciente no encontrado' });

    let imc = null;
    if (user.estatura > 0) {
      const est = user.estatura > 3 ? user.estatura / 100 : user.estatura;
      imc = parseFloat((peso / (est * est)).toFixed(1));
    }

    db.run(
      "INSERT INTO registros_peso (paciente_id, fecha, peso, imc) VALUES (?, ?, ?, ?)",
      [paciente_id, fecha, peso, imc],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error al registrar peso: ' + err.message });
        res.json({ success: true, id: this.lastID, imc, message: 'Peso registrado correctamente' });
      }
    );
  });
});

// Listar los registros de peso independientes de un paciente
app.get('/peso/:pacienteId', requireAuth, (req, res) => {
  const pid = req.params.pacienteId;
  db.all(
    "SELECT id, paciente_id, fecha, peso, imc FROM registros_peso WHERE paciente_id = ? ORDER BY fecha DESC, id DESC",
    [pid],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener registros de peso' });
      res.json(rows || []);
    }
  );
});

// Eliminar un registro de peso independiente
app.delete('/peso/:id', requireAuth, (req, res) => {
  db.run("DELETE FROM registros_peso WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar registro de peso' });
    res.json({ success: true, message: 'Registro de peso eliminado' });
  });
});

// ============================================================
// 🥗 PLANES ALIMENTICIOS — CRUD Dietas
// ============================================================

// Obtener todos los planes alimenticios de un paciente específico (con paginación)
app.get('/dietas/:pacienteId', requireAuth, (req, res) => {
  const { page, limit, offset } = paginate(req);
  const pid = req.params.pacienteId;
  db.get("SELECT COUNT(*) AS total FROM dietas WHERE paciente_id = ?", [pid], (err, countRow) => {
    if (err) return res.status(500).json({ error: 'Error al contar dietas' });
    db.all(`
      SELECT d.*, u.nombre AS paciente_nombre
      FROM dietas d
      JOIN usuarios u ON d.paciente_id = u.id
      WHERE d.paciente_id = ?
      ORDER BY d.fecha DESC
      LIMIT ? OFFSET ?
    `, [pid, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener planes alimenticios' });
      sendPaginated(res, rows, countRow.total, page, limit);
    });
  });
});

// Crear un nuevo plan alimenticio
app.post('/dietas', requireAuth, (req, res) => {
  const { paciente_id, fecha, desayuno, colacion1, comida, colacion2, cena, recomendaciones } = req.body;

  if (!paciente_id) {
    return res.status(400).json({ error: 'El paciente es requerido' });
  }

  db.get("SELECT * FROM usuarios WHERE id = ?", [paciente_id], (err, user) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!user) return res.status(404).json({ error: 'Paciente no encontrado' });

    db.run(`
      INSERT INTO dietas (paciente_id, fecha, desayuno, colacion1, comida, colacion2, cena, recomendaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      paciente_id,
      fecha || new Date().toISOString().split('T')[0],
      desayuno || '',
      colacion1 || '',
      comida || '',
      colacion2 || '',
      cena || '',
      recomendaciones || ''
    ], function (err) {
      if (err) return res.status(500).json({ error: 'Error al crear plan: ' + err.message });
      res.json({ success: true, id: this.lastID, message: 'Plan alimenticio creado correctamente' });
    });
  });
});

// Obtener un plan alimenticio por ID
app.get('/dieta/:id', requireAuth, (req, res) => {
  db.get(`
    SELECT d.*, u.nombre AS paciente_nombre
    FROM dietas d
    JOIN usuarios u ON d.paciente_id = u.id
    WHERE d.id = ?
  `, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error al obtener plan' });
    if (!row) return res.status(404).json({ error: 'Plan no encontrado' });
    res.json(row);
  });
});

// Actualizar un plan alimenticio existente
app.put('/dietas/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { paciente_id, fecha, desayuno, colacion1, comida, colacion2, cena, recomendaciones } = req.body;

  db.get("SELECT * FROM dietas WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!row) return res.status(404).json({ error: 'Plan no encontrado' });

    db.run(`
      UPDATE dietas SET
        paciente_id = ?, fecha = ?, desayuno = ?, colacion1 = ?,
        comida = ?, colacion2 = ?, cena = ?, recomendaciones = ?
      WHERE id = ?
    `, [
      paciente_id || row.paciente_id,
      fecha || row.fecha,
      desayuno !== undefined ? desayuno : row.desayuno,
      colacion1 !== undefined ? colacion1 : row.colacion1,
      comida !== undefined ? comida : row.comida,
      colacion2 !== undefined ? colacion2 : row.colacion2,
      cena !== undefined ? cena : row.cena,
      recomendaciones !== undefined ? recomendaciones : row.recomendaciones,
      id
    ], function (err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar plan' });
      res.json({ success: true, message: 'Plan alimenticio actualizado correctamente' });
    });
  });
});

// Eliminar un plan alimenticio
app.delete('/dietas/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM dietas WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    if (!row) return res.status(404).json({ error: 'Plan no encontrado' });

    db.run("DELETE FROM dietas WHERE id = ?", [id], function (err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar plan' });
      res.json({ success: true, message: 'Plan alimenticio eliminado correctamente' });
    });
  });
});

// ============================================================
// 🤖 API BRIDGE: GENERAR DIETA CON IA
// ============================================================
app.post('/api/generar-dieta-ia', requireAuth, async (req, res) => {
  try {
    const response = await fetch(IA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (!response.ok) throw new Error('Servicio de IA no disponible');
    const resultado = await response.json();
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'Error al comunicarse con IA: ' + err.message });
  }
});

// ============================================================
// 📄 PAGINATION HELPER
// ============================================================
function paginate(req, defaultLimit = 20) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function sendPaginated(res, rows, total, page, limit) {
  res.json({ data: rows, total, page, limit });
}

const IA_API_URL = 'http://127.0.0.1:5000/recomendar';

// 🤖 IA
async function obtenerDieta(usuario) {
  try {
    const res = await fetch(IA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(usuario)
    });

    return await res.json();
  } catch {
    return null;
  }
}

app.get('/dieta', async (req, res) => {
  const user = obtenerSesion(req.query.token);
  if (!user) return res.json(null);
  res.json(await obtenerDieta(user));
});

// ============================================================
// 👷‍♂️ ENDPOINTS PARA EL PANEL DE ADMINISTRACION DE PACIENTES
// ============================================================
// Devuelve todos los pacientes registrados (con paginación)
app.get('/usuarios', requireAuth, (req, res) => {
  if (req.query.all === 'true') {
    db.all("SELECT * FROM usuarios ORDER BY id", [], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener usuarios' });
      res.json(rows);
    });
    return;
  }
  const { page, limit, offset } = paginate(req);
  db.get("SELECT COUNT(*) AS total FROM usuarios", [], (err, countRow) => {
    if (err) return res.status(500).json({ error: 'Error al contar usuarios' });
    db.all("SELECT * FROM usuarios ORDER BY id LIMIT ? OFFSET ?", [limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener usuarios' });
      sendPaginated(res, rows, countRow.total, page, limit);
    });
  });
});

// Busca pacientes por nombre (parcial) o ID exacto (con paginación)
app.get('/usuarios/buscar', requireAuth, (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.json({ data: [], total: 0, page: 1, limit: 20 });
  }

  const id = parseInt(q);

  if (!isNaN(id)) {
    db.get("SELECT * FROM usuarios WHERE id = ?", [id], (err, row) => {
      if (err) return res.status(500).json({ error: 'Error al buscar' });
      const data = row ? [row] : [];
      sendPaginated(res, data, data.length, 1, 20);
    });
  } else {
    const { page, limit, offset } = paginate(req);
    db.get("SELECT COUNT(*) AS total FROM usuarios WHERE nombre LIKE ?", [`%${q}%`], (err, countRow) => {
      if (err) return res.status(500).json({ error: 'Error al buscar' });
      db.all("SELECT * FROM usuarios WHERE nombre LIKE ? ORDER BY id LIMIT ? OFFSET ?", [`%${q}%`, limit, offset], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al buscar' });
        sendPaginated(res, rows, countRow.total, page, limit);
      });
    });
  }
});
// ============================================================
// FIN ENDPOINTS PANEL ADMINISTRACION
// ============================================================

// ============================================================
// ✏️ EDITAR PACIENTE
// ============================================================
app.put('/usuario/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  const { nombre, edad, peso, estatura, actividad, patologias, objetivo, ingredientes_evitar, sexo } = req.body;

  db.get("SELECT * FROM usuarios WHERE id = ?", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error del servidor' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    db.run(`
      UPDATE usuarios SET
        nombre = ?, edad = ?, peso = ?, estatura = ?,
        actividad = ?, patologias = ?, objetivo = ?, ingredientes_evitar = ?, sexo = ?
      WHERE id = ?
    `,
      [nombre, edad, peso, estatura, actividad, patologias || '', objetivo, ingredientes_evitar || '', sexo || row.sexo || 'no_definido', id],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Error al actualizar usuario' });
        }

        res.json({ success: true, message: 'Usuario actualizado correctamente' });
      }
    );
  });
});

// ============================================================
// 🗑️ ELIMINAR PACIENTE
// ============================================================
app.delete('/usuario/:id', requireAuth, (req, res) => {
  const id = req.params.id;

  // Validar que el usuario exista
  db.get("SELECT * FROM usuarios WHERE id = ?", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error del servidor' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    db.run('DELETE FROM usuarios WHERE id = ?', [id], function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error al eliminar usuario' });
      }

      if (port && port.isOpen) {
        try {
          port.write(`DELETE:${id}\n`, (err) => {
            if (err) console.error("Error al eliminar huella del Arduino:", err.message);
          });
        } catch (e) {
          console.error("Error al escribir al Arduino:", e.message);
        }
      } else {
        console.warn("⚠️  Puerto serial no disponible. La huella ID", id, "no se eliminó del sensor.");
      }

      res.json({ success: true, message: 'Usuario eliminado correctamente' });
    });
  });
});

// 🔑 Admin login
app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crearSesion({ role: 'admin', username });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
});

// 🚪 logout
app.get('/logout', (req, res) => {
  const token = req.query.token;
  if (token) borrarSesion(token);
  res.send("Logout");
});

app.listen(4000, () => console.log("Servidor en http://localhost:4000"));
//python ia_api.py = pa q jale la ia :P
//node server.js = para q jale la pagina web :P