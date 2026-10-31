// SMAE Mixer - Generador de platillos con grupos
const SMAE_MIXER = {
  proteinas: [
    { alimento: 'Pechuga de pollo', grupo: 'proteina_aoa', gBase: 90 },
    { alimento: 'Pavo', grupo: 'proteina_aoa', gBase: 90 },
    { alimento: 'Pescado blanco', grupo: 'proteina_aoa', gBase: 90 },
    { alimento: 'Atún en agua', grupo: 'proteina_aoa', gBase: 90 },
    { alimento: 'Huevo', grupo: 'proteina_aoa', gBase: 70 },
    { alimento: 'Tofu', grupo: 'proteina_aoa', gBase: 80 }
  ],
  cereales: [
    { alimento: 'Arroz cocido', grupo: 'cereal', gBase: 80 },
    { alimento: 'Avena cocida', grupo: 'cereal', gBase: 80 },
    { alimento: 'Papa cocida', grupo: 'cereal', gBase: 100 },
    { alimento: 'Camote cocido', grupo: 'cereal', gBase: 100 },
    { alimento: 'Tortilla de maíz', grupo: 'cereal', gBase: 60 }
  ],
  leguminosas: [
    { alimento: 'Frijol cocido', grupo: 'leguminosa', gBase: 80 },
    { alimento: 'Lenteja cocida', grupo: 'leguminosa', gBase: 80 },
    { alimento: 'Garbanzos cocidos', grupo: 'leguminosa', gBase: 80 }
  ],
  verduras: [
    { alimento: 'Brócoli', grupo: 'verdura', gBase: 90 },
    { alimento: 'Calabacita', grupo: 'verdura', gBase: 90 },
    { alimento: 'Espinaca', grupo: 'verdura', gBase: 90 },
    { alimento: 'Jitomate', grupo: 'verdura', gBase: 90 },
    { alimento: 'Pepino', grupo: 'verdura', gBase: 90 },
    { alimento: 'Coliflor', grupo: 'verdura', gBase: 90 }
  ],
  frutas: [
    { alimento: 'Manzana', grupo: 'fruta', gBase: 100 },
    { alimento: 'Plátano', grupo: 'fruta', gBase: 80 },
    { alimento: 'Naranja', grupo: 'fruta', gBase: 100 },
    { alimento: 'Papaya', grupo: 'fruta', gBase: 100 },
    { alimento: 'Fresa', grupo: 'fruta', gBase: 100 }
  ],
  grasas: [
    { alimento: 'Aceite de oliva', grupo: 'grasa', gBase: 10 },
    { alimento: 'Aguacate', grupo: 'grasa', gBase: 30 },
    { alimento: 'Nueces', grupo: 'grasa', gBase: 10 },
    { alimento: 'Almendras', grupo: 'grasa', gBase: 10 }
  ]
};

function generarMenuConGrupos(opciones) {
  const {
    tipoComida = 'comida',
    proteina = 'Pechuga de pollo',
    cereal = 'Arroz cocido',
    verdura = 'Brócoli',
    leguminosa = null,
    fruta = null,
    grasa = 'Aceite de oliva'
  } = opciones || {};

  const items = [];
  const p = SMAE_MIXER.proteinas.find(x => x.alimento === proteina) || SMAE_MIXER.proteinas[0];
  items.push({ alimento: p.alimento, grupo: p.grupo, gramos: p.gBase });
  const c = SMAE_MIXER.cereales.find(x => x.alimento === cereal);
  if (c) items.push({ alimento: c.alimento, grupo: c.grupo, gramos: c.gBase });
  const v = SMAE_MIXER.verduras.find(x => x.alimento === verdura);
  if (v) items.push({ alimento: v.alimento, grupo: v.grupo, gramos: v.gBase });
  if (leguminosa) {
    const l = SMAE_MIXER.leguminosas.find(x => x.alimento === leguminosa);
    if (l) items.push({ alimento: l.alimento, grupo: l.grupo, gramos: l.gBase });
  }
  if (fruta) {
    const f = SMAE_MIXER.frutas.find(x => x.alimento === fruta);
    if (f) items.push({ alimento: f.alimento, grupo: f.grupo, gramos: f.gBase });
  }
  const g = SMAE_MIXER.grasas.find(x => x.alimento === grasa);
  if (g && tipoComida === 'comida') items.push({ alimento: g.alimento, grupo: g.grupo, gramos: g.gBase });

  const detalle = {};
  detalle[tipoComida] = items.map(i => ({ alimento: i.alimento, gramos: String(i.gramos) }));
  return { detalle, items };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SMAE_MIXER, generarMenuConGrupos };
}
