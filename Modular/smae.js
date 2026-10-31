// SMAE - Sistema Mexicano de Alimentos Equivalentes
// No altera el flujo existente, solo añade cálculos

const SMAE_TABLA = {
  verdura: { nombre: 'Verduras', kcalPorEquiv: 25, gDefault: 90, alimentos: ['Brócoli', 'Calabacita', 'Espinaca', 'Lechuga', 'Jitomate', 'Pepino', 'Coliflor', 'Zanahoria'] },
  fruta: { nombre: 'Frutas', kcalPorEquiv: 60, gDefault: 100, alimentos: ['Manzana', 'Plátano', 'Naranja', 'Papaya', 'Sandía', 'Fresa', 'Kiwi', 'Melón'] },
  cereal: { nombre: 'Cereales/Tubérculos', kcalPorEquiv: 70, gDefault: 80, alimentos: ['Arroz cocido', 'Avena', 'Papa cocida', 'Camote cocido', 'Tortilla de maíz', 'Pan integral'] },
  leguminosa: { nombre: 'Leguminosas', kcalPorEquiv: 120, gDefault: 80, alimentos: ['Frijol cocido', 'Lenteja cocida', 'Garbanzos cocidos', 'Habas cocidas'] },
  proteina_aoa: { nombre: 'Proteínas/AOA', kcalPorEquiv: 55, gDefault: 30, alimentos: ['Pechuga de pollo', 'Pavo', 'Pescado blanco', 'Atún en agua', 'Huevo', 'Tofu', 'Clara de huevo'] },
  grasa: { nombre: 'Grasas', kcalPorEquiv: 45, gDefault: 10, alimentos: ['Aceite de oliva', 'Aguacate', 'Nueces', 'Almendras', 'Semillas de chía', 'Crema light'] }
};

// Recomendación de proteína por peso corporal según el objetivo (g/kg/día)
const SMAE_PROTEINA_POR_OBJETIVO = {
  ganar_musculo: { etiqueta: 'Ganar masa muscular', min: 1.4, max: 2.2 },
  perder_peso: { etiqueta: 'Perder peso', min: 1.6, max: 2.4 },
  mantener: { etiqueta: 'Mantener peso', min: 1.2, max: 1.6 }
};

function smaeProteinasPorPeso(peso, objetivo) {
  const p = Number(peso) || 0;
  const clave = objetivo === 'mantener_peso' ? 'mantener' : objetivo;
  const cfg = SMAE_PROTEINA_POR_OBJETIVO[clave];
  if (p <= 0 || !cfg) return null;
  const gramosMin = +(p * cfg.min).toFixed(1);
  const gramosMax = +(p * cfg.max).toFixed(1);
  const gramosRecomendados = +((gramosMin + gramosMax) / 2).toFixed(1);
  return {
    objetivo: clave,
    etiqueta: cfg.etiqueta,
    peso: p,
    gramosPorKgMin: cfg.min,
    gramosPorKgMax: cfg.max,
    gramosMin,
    gramosMax,
    gramosRecomendados
  };
}

function smaeCalcularMacros(calorias, pctProteina, pctCarbo, pctGrasa) {
  const cal = Number(calorias) || 0;
  const p = Number(pctProteina) || 0;
  const c = Number(pctCarbo) || 0;
  const g = Number(pctGrasa) || 0;
  const kcalP = cal * (p / 100);
  const kcalC = cal * (c / 100);
  const kcalG = cal * (g / 100);
  return {
    kcalTotales: cal,
    proteinas_g: +(kcalP / 4).toFixed(1),
    carbohidratos_g: +(kcalC / 4).toFixed(1),
    grasas_g: +(kcalG / 9).toFixed(1),
    distribucion_kcal: { proteinas: kcalP, carbohidratos: kcalC, grasas: kcalG }
  };
}

function smaeMacrosAEquivalentes(macros) {
  if (!macros) return {};
  const kcalTotales = macros.kcalTotales || 0;
  const kcalP = macros.distribucion_kcal ? macros.distribucion_kcal.proteinas : (Number(macros.proteinas_g) || 0) * 4;
  const kcalC = macros.distribucion_kcal ? macros.distribucion_kcal.carbohidratos : (Number(macros.carbohidratos_g) || 0) * 4;
  const kcalG = macros.distribucion_kcal ? macros.distribucion_kcal.grasas : (Number(macros.grasas_g) || 0) * 9;

  return {
    verdura: +(kcalTotales * 0.10 / SMAE_TABLA.verdura.kcalPorEquiv).toFixed(2),
    fruta: +(kcalTotales * 0.10 / SMAE_TABLA.fruta.kcalPorEquiv).toFixed(2),
    cereal: +(kcalC / SMAE_TABLA.cereal.kcalPorEquiv).toFixed(2),
    leguminosa: +((kcalP * 0.15) / SMAE_TABLA.leguminosa.kcalPorEquiv).toFixed(2),
    proteina_aoa: +((kcalP * 0.85) / SMAE_TABLA.proteina_aoa.kcalPorEquiv).toFixed(2),
    grasa: +(kcalG / SMAE_TABLA.grasa.kcalPorEquiv).toFixed(2)
  };
}

function smaeEquivalentesAGramos(equivalentes, seleccionAlimentos) {
  const sel = seleccionAlimentos || {};
  const resultado = {};
  Object.keys(equivalentes || {}).forEach(grupo => {
    const tabla = SMAE_TABLA[grupo];
    if (!tabla) return;
    const equiv = Number(equivalentes[grupo]) || 0;
    if (equiv <= 0) return;
    const alimento = sel[grupo] || tabla.alimentos[0];
    const gPorEquiv = tabla.gDefault;
    const gramos = Math.round(equiv * gPorEquiv);
    resultado[grupo] = { grupo: tabla.nombre, equivalentes: +equiv.toFixed(2), alimento, gramos, texto: gramos + 'g de ' + alimento.toLowerCase() };
  });
  return resultado;
}

function smaeGenerarDesgloseMenu(equivalentesGramos) {
  const gruposPorComida = {
    desayuno: ['proteina_aoa', 'cereal', 'fruta'],
    colacion1: ['fruta'],
    comida: ['proteina_aoa', 'cereal', 'verdura', 'grasa'],
    colacion2: ['fruta', 'proteina_aoa'],
    cena: ['proteina_aoa', 'verdura', 'grasa']
  };
  const menu = {};
  Object.keys(gruposPorComida).forEach(comida => {
    const lista = [];
    gruposPorComida[comida].forEach(g => {
      if (equivalentesGramos[g]) {
        lista.push(equivalentesGramos[g].texto);
      }
    });
    menu[comida] = lista;
  });
  return menu;
}

function smaeGramosADetalleJSON(equivalentesGramos) {
  const gruposPorComida = {
    desayuno: ['proteina_aoa', 'cereal', 'fruta'],
    colacion1: ['fruta'],
    comida: ['proteina_aoa', 'cereal', 'verdura', 'grasa'],
    colacion2: ['fruta', 'proteina_aoa'],
    cena: ['proteina_aoa', 'verdura', 'grasa']
  };
  const detalle = {};
  Object.keys(gruposPorComida).forEach(comida => {
    const items = [];
    gruposPorComida[comida].forEach(g => {
      if (equivalentesGramos[g]) {
        items.push({ alimento: equivalentesGramos[g].alimento, gramos: String(equivalentesGramos[g].gramos) });
      }
    });
    if (items.length > 0) {
      detalle[comida] = items;
    }
  });
  return Object.keys(detalle).length > 0 ? detalle : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SMAE_TABLA, SMAE_PROTEINA_POR_OBJETIVO, smaeProteinasPorPeso, smaeCalcularMacros, smaeMacrosAEquivalentes, smaeEquivalentesAGramos, smaeGenerarDesgloseMenu, smaeGramosADetalleJSON };
}
