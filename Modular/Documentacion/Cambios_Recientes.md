# Cambios recientes — Módulo de dietas

**Proyecto:** Modular (panel de nutrición)
**Periodo:** octubre de 2026
**Archivos modificados:** `ia_api.py`, `server.js`, `nutriologo.js`, `panel.html`, `usuarios.db`
**Tema central:** generación variada de menús con IA y visualización correcta de la dieta en el panel del paciente.

---

## Parte 1. Resumen ejecutivo

En esta ronda de cambios se corrigieron tres cosas relacionadas entre sí:

1. **La IA ahora genera menús variados** con alimentos reales del banco SMAE, en lugar de repetir siempre los mismos platillos.
2. **El panel del paciente muestra primero el menú de texto** (el dato vigente que guarda el nutriólogo o la IA) y deja el `detalle_json` únicamente como respaldo para dietas antiguas.
3. **El `detalle_json` que se guarda al generar una dieta con IA se construye a partir del menú real**, ya no con un detalle fijo de pollo/arroz/manzana.

El resultado: lo que el nutriólogo ve, lo que se guarda y lo que el paciente ve coinciden.

---

## Parte 2. Problema detectado

### Síntoma

El paciente seguía viendo el menú anterior (pollo, arroz, manzana) aunque en la base de datos ya estaba guardado otro menú. Cerrar y volver a abrir el panel no cambiaba nada.

### Causa raíz (doble)

1. **En la vista:** `panel.html` renderizaba primero `detalle_json` y sólo después los campos de texto (`desayuno`, `colacion1`, `comida`, `colacion2`, `cena`). Si el `detalle_json` estaba desactualizado, el paciente veía el menú viejo aunque el texto fuera el correcto.
2. **Al guardar:** `nutriologo.js` guardaba un `detalle_json` fijo tipo SMAE (pollo/arroz/manzana) que no tenía relación con el menú que la IA acababa de generar. El texto sí era nuevo, pero el detalle quedaba viejo.

Por eso el problema no se arreglaba recargando: el dato viejo estaba guardado en la base, no en el navegador.

---

## Parte 3. Generación variada de menús con IA

### Archivo: `ia_api.py`

Se agregó un **banco de alimentos reales por grupo SMAE** (`BANCO`), con nombre y gramos base por equivalente:

- cereales
- proteínas AOA
- lácteos
- verduras
- frutas
- grasas

La función `armar_plan_desde_cero(data)` calcula los equivalentes según el objetivo del paciente (`obtener_equivalentes`) y elige alimentos al azar del banco:

```python
def armar_plan_desde_cero(data):
    rng = random.Random(time.time_ns() * random.randint(100000, 999999))
    eq = obtener_equivalentes(data)
    plan = {}
    # por cada comida y grupo: rng.choice(BANCO[...])
    # gramos = g_base * equivalentes
    ...
    return plan
```

Detalles importantes:

- Se usa una semilla aleatoria por petición (`time_ns`), por lo que **cada generación puede dar un menú distinto**.
- Las verduras se eligen con `rng.sample(...)` para no repetir la misma verdura dentro de una comida.
- Los gramos se calculan multiplicando el `g_base` del alimento por el número de equivalentes.
- El plan se devuelve como texto por comida, por ejemplo: `65 g de Quinoa cocida, 50 g de Surimi al natural, ...`.

### Puente en `server.js`

El panel no llama directo a Flask; usa un puente:

```js
app.post('/api/generar-dieta-ia', requireAdmin, async (req, res) => {
  // reenvía el cuerpo a http://127.0.0.1:5000/recomendar
});
```

Por lo tanto, para generar dietas con IA deben estar corriendo **los dos servicios**: Flask en el puerto `5000` y Node en el `4000`.

### Ejemplo de menú generado (dieta id 25, paciente 1, 2026-10-28)

- **Desayuno:** 65 g de Quinoa cocida, 50 g de Surimi al natural, 50 g de Plátano, 2 g de Aceite de oliva virgen extra
- **Colación 1:** 100 g de Naranja pelada
- **Comida:** 65 g de Arroz integral cocido, 100 g de Huevo cocido, 100 g de Coliflor, zanahoria y ejote al vapor, 100 g de Lechuga romana, rúcula y jitomate cherry, 5 g de Aceite de oliva virgen extra
- **Colación 2:** 70 g de Guayaba, 5 g de Cacahuates naturales sin sal
- **Cena:** 40 g de Queso panela en cubos, 100 g de Champiñones, pimiento morrón y cebolla salteados, 100 g de Lechuga romana, rúcula y jitomate cherry, 15 g de Aguacate en rebanadas

---

## Parte 4. Visualización correcta en el panel del paciente

### Archivo: `panel.html` → `renderizarDietaAgrupada(plan)`

Se invirtió la prioridad de los datos:

**Prioridad 1 — campos de texto** (`desayuno`, `colacion1`, `comida`, `colacion2`, `cena`). Es el dato vigente y siempre se muestra primero. Si hay al menos un campo con contenido, la función termina ahí.

```js
comidas.forEach(g => {
  if (plan[g.key]) {
    html += '<h4>' + escapeHTML(g.titulo) + '</h4><p>' + escapeHTML(plan[g.key]) + '</p>';
  }
});
if (html.trim()) { cont.innerHTML = html; return; }
```

**Prioridad 2 — `detalle_json`** como respaldo, sólo para dietas viejas que no tienen los campos de texto:

```js
if (plan.detalle_json) {
  const detalle = typeof plan.detalle_json === 'string'
    ? JSON.parse(plan.detalle_json)
    : plan.detalle_json;
  // se pinta como lista con gramos
}
```

Además:

- Las recomendaciones se siguen mostrando.
- Se conserva `escapeHTML` para evitar inyección de HTML.
- Si no hay nada, se muestra `Sin datos`.

Con esto, aunque una dieta tenga un `detalle_json` viejo, el paciente verá el menú de texto actual.

---

## Parte 5. Coherencia del detalle estructurado al guardar con IA

### Archivo: `nutriologo.js`

Se agregó la función `detalleDesdePlanIA(plan)`, que convierte el texto del menú generado en la estructura por comida que espera la base de datos.

Mapeo de nombres:

| Texto de la IA | Campo del detalle |
|---|---|
| `desayuno` | `desayuno` |
| `colacion_1` | `colacion1` |
| `comida` | `comida` |
| `colacion_2` | `colacion2` |
| `cena` | `cena` |

La separación de alimentos es cuidadosa: **sólo corta cuando el siguiente fragmento empieza con “N g de ”**, para no partir descripciones como “Coliflor, zanahoria y ejote”.

```js
const items = String(texto)
  .split(/,\s*(?=\d+(?:[.,]\d+)?\s*g\s+de\s)/i)
  .map(t => t.trim())
  .filter(Boolean)
  .map(item => {
    const m = item.match(/^(\d+(?:[.,]\d+)?)\s*g\s+de\s+(.+)$/i);
    if (m) return { alimento: m[2].trim(), gramos: m[1].replace(',', '.') };
    return { alimento: item, gramos: '' };
  });
```

Uso dentro de `generarDietaIA()`:

```js
// antes: se armaba un SMAE fijo con pollo/arroz
iaSmaeDetalle = detalleDesdePlanIA(resultado.plan);
```

Y al guardar, en `guardarDietaDefinitiva()`:

```js
detalle_json: iaSmaeDetalle || null
```

Resultado: el `detalle_json` guardado describe exactamente los mismos alimentos y gramos que el menú de texto.

---

## Parte 6. Corrección de datos ya guardados

Además del arreglo de código, se revisó la dieta que estaba causando el problema en el paciente de prueba (ID 1).

- El registro tenía el **texto actualizado** pero un `detalle_json` con pollo/arroz/manzana.
- Se corrigió su `detalle_json` para que coincidiera con el menú de texto (quinoa, carne de res, papaya, nueces, etc.).
- Se verificó que ya no quedaran rastros del menú viejo (por ejemplo, `263` g de pollo o `Manzana`).

En la base actual, la dieta más reciente del paciente 1 es la **id 25 (fecha 2026-10-28)**, generada después del arreglo, y su `detalle_json` coincide comida por comida con el texto. La dieta id 23 que se corrigió durante la sesión ya no está en la base; la verificación final se hizo sobre la id 25.

---

## Parte 7. Cómo se elige la dieta que ve el paciente

### Archivo: `server.js` → `GET /dieta`

```js
db.get(
  `SELECT * FROM dietas WHERE paciente_id = ? ORDER BY fecha DESC, id DESC LIMIT 1`,
  [user.id],
  ...
);
```

El panel siempre recibe **la dieta más reciente** del paciente: primero por fecha y, si hay varias del mismo día, por id más alto. Por eso, al volver a generar y guardar, la nueva dieta pasa a ser la visible.

---

## Parte 8. Pruebas realizadas

1. **Sintaxis:**
   - `node --check nutriologo.js` → OK
   - `node --check server.js` → OK
   - `python -m py_compile ia_api.py` → OK
2. **API:**
   - Inicio de sesión del paciente de prueba (ID `1`, PIN `1234`) y consulta a `GET /dieta`.
   - El servidor devuelve la dieta más reciente con su plan.
3. **Archivos servidos:**
   - `panel.html` contiene la marca `PRIORIDAD 1`.
   - `nutriologo.js` contiene `detalleDesdePlanIA`.
4. **Base de datos:**
   - La dieta id 25 tiene texto y `detalle_json` coherentes en las cinco comidas.
5. **Navegador:**
   - Se recomienda recargar con `Ctrl + F5` para evitar caché del `panel.html` o del JS.

---

## Parte 9. Alcance e impacto

- **No se modificó el esquema de la base de datos.** Siguen existiendo las mismas columnas y tablas.
- **No se tocó la autenticación** ni el manejo de sesiones.
- **No se afectó el módulo de Arduino/huella** ni otros módulos del sistema.
- **Compatibilidad hacia atrás:** las dietas viejas que sólo tienen `detalle_json` se siguen mostrando gracias al respaldo de la Prioridad 2.
- **Sin repositorio git:** los cambios están aplicados directamente en los archivos del proyecto.

---

## Parte 10. Cómo probar el flujo completo

1. Levantar el servicio de IA (Flask) en el puerto `5000`.
2. Levantar el servidor Node en el puerto `4000`.
3. Entrar al panel del nutriólogo y generar una dieta con IA para un paciente.
4. Guardar la dieta.
5. Entrar al panel del paciente (o recargar con `Ctrl + F5`).
6. Verificar que el menú mostrado sea el mismo que se generó y guardó.
7. Opcional: revisar en la base que el `detalle_json` de esa dieta coincida con el texto.

---

## Parte 11. Recomendaciones / pendientes

- Si en el futuro se edita una dieta vieja, conviene **regenerar su `detalle_json`** o dejarlo en `null` para que el panel use el texto.
- Mantener el banco de alimentos (`BANCO`) actualizado si se agregan o cambian equivalentes.
- Considerar pruebas automatizadas para `detalleDesdePlanIA`, en especial con descripciones que llevan comas.
- Si el panel sigue mostrando datos viejos después de estos cambios, revisar en este orden: (1) recarga forzada, (2) que la dieta guardada sea la más reciente por fecha/id, (3) que el registro tenga los campos de texto correctos.

---

**Fin del documento.**
