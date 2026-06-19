'use strict';

// ─── Acceso ───────────────────────────────────────────────────────────────────
// Contraseña única compartida para entrar a la demo. No es un mecanismo de
// seguridad real (es texto plano visible en el código fuente): solo evita que
// alguien abra la app sin saberla durante una demo en directo. Cámbiala aquí
// cuando quieras.
const APP_PASSWORD = 'sociarem2026';

// ─── Utilidades ───────────────────────────────────────────────────────────────

function clamp(x) { return Math.max(0.0, Math.min(1.0, x)); }

// ─── Umbrales por defecto ────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS = {
  pobreza:      1050,
  renta_riesgo: 780,
  carga:        10.0,
  consumo_elec: 350,
  consumo_gas:  300,
  infra_elec:   150,
  infra_gas:    100,
  ahorros:      1,
  estabilidad:  2,
  territorial:  60,
  acceso:       30,
};

// ─── Niveles de vulnerabilidad (ordinales 0-4) ────────────────────────────────

const VULNERABILITY_LEVELS = [
  { value: 0, label: 'No vulnerable',        short: 'No',      color: '#16A34A' },
  { value: 1, label: 'Vulnerabilidad baja',  short: 'Baja',    color: '#65A30D' },
  { value: 2, label: 'Vulnerabilidad media', short: 'Media',   color: '#D97706' },
  { value: 3, label: 'Vulnerabilidad alta',  short: 'Alta',    color: '#DC2626' },
  { value: 4, label: 'Muy vulnerable',       short: 'Muy alta',color: '#7C3AED' },
];

const LEVEL_THRESHOLDS = [0.20, 0.40, 0.60, 0.80];

function scoreToLevel(score) {
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (score < LEVEL_THRESHOLDS[i]) return i;
  }
  return 4;
}

// ─── I8 – Pobreza energética oculta (lógica derivada) ───────────────────────

function i8LowConsumption(hh, T) {
  return hh.I5 < T.infra_elec && hh.I6 < T.infra_gas;
}
function i8Risk(hh, T) {
  const low = i8LowConsumption(hh, T);
  const econ = hh.I1 < T.pobreza || hh.I3 > T.carga;
  const notEfficient = hh.I9 >= 1 || hh.I10 >= 1;
  return low && econ && notEfficient;
}
function i8Norm(hh, T) {
  if (i8Risk(hh, T)) {
    const deficit = (T.infra_elec - hh.I5) / T.infra_elec;
    return clamp(0.5 + 0.5 * deficit);
  }
  return 0.0;
}
function i8Display(hh, T) {
  if (i8Risk(hh, T)) {
    const pct = Math.round((1 - hh.I5 / T.infra_elec) * 100);
    return `Infraconsumo (−${pct}%)`;
  }
  return 'Normal';
}

// ─── Definición de indicadores ───────────────────────────────────────────────

const INDICATOR_DEFS = {
  I1: {
    name: 'Renta neta equiv.',
    long: 'I1 – Renta neta mensual equivalente',
    role: 'pri',
    source: 'DS2 · ISEE',
    definition: 'Renta neta mensual ajustada por composición del hogar (ISEE). Mide capacidad económica para afrontar gastos energéticos.',
    display: (hh, _T) => `${hh.I1} €/mes`,
    note: (T) => `< ${T.renta_riesgo} €/mes → riesgo`,
    risk: (hh, T) => hh.I1 < T.renta_riesgo,
    norm: (hh, _T) => clamp((1200 - hh.I1) / 800),
    derived: false,
    weighted: true,
  },
  I2: {
    name: 'Bajo umbral pobreza',
    long: 'I2 – Hogar bajo umbral de pobreza relativa',
    role: 'pri',
    source: 'DS2 · ISEE (derivado de I1)',
    definition: 'Indica si la renta equivalente está por debajo del umbral de pobreza relativa (60% mediana). Se deriva directamente de I1 y no duplica su peso.',
    display: (hh, T) => `${Math.round(hh.I1 / T.pobreza * 100)}% del umbral`,
    note: (T) => `umbral: ${T.pobreza} €/mes`,
    risk: (hh, T) => hh.I1 < T.pobreza,
    norm: (hh, T) => clamp((T.pobreza - hh.I1) / T.pobreza),
    derived: true,
    weighted: false,
  },
  I3: {
    name: 'Carga energética',
    long: 'I3 – Carga energética del hogar',
    role: 'sec',
    source: 'DS4 · DS14',
    definition: 'Cociente entre gasto energético total y renta. Criterio LIHC: se considera carga alta cuando supera el umbral configurado.',
    display: (hh, _T) => `${hh.I3.toFixed(1)}%`,
    note: (T) => `> ${T.carga.toFixed(0)}% → riesgo`,
    risk: (hh, T) => hh.I3 > T.carga,
    norm: (hh, _T) => clamp((hh.I3 - 5) / 25),
    derived: false,
    weighted: true,
  },
  I4: {
    name: 'Impago / corte',
    long: 'I4 – Impago o corte de suministro',
    role: 'sec',
    source: 'DS8 · Fundación',
    definition: 'Impagos, deudas o cortes de suministro eléctrico en los últimos 12 meses.',
    display: (hh, _T) => hh.I4 ? 'SÍ' : 'NO',
    note: (_T) => 'Últimos 12 meses',
    risk: (hh, _T) => Boolean(hh.I4),
    norm: (hh, _T) => hh.I4 ? 1.0 : 0.0,
    derived: false,
    weighted: true,
  },
  I5: {
    name: 'Consumo eléctrico',
    long: 'I5 – Consumo eléctrico del hogar',
    role: 'sec',
    source: 'DS4 · DS6',
    definition: 'Consumo eléctrico total del hogar en kWh/mes.',
    display: (hh, _T) => `${hh.I5} kWh`,
    note: (T) => `< ${T.infra_elec} kWh → infraconsumo`,
    risk: (hh, T) => hh.I5 < T.infra_elec || hh.I5 > T.consumo_elec,
    norm: (hh, _T) => clamp((hh.I5 - 150) / 350),
    derived: false,
    weighted: true,
  },
  I6: {
    name: 'Consumo no eléctrico',
    long: 'I6 – Consumo energético no eléctrico',
    role: 'sec',
    source: 'DS14',
    definition: 'Consumo de fuentes no eléctricas (gas, GLP, biomasa) en kWh equivalentes por mes.',
    display: (hh, _T) => `${hh.I6} kWh`,
    note: (T) => `< ${T.infra_gas} kWh → infraconsumo`,
    risk: (hh, T) => hh.I6 < T.infra_gas || hh.I6 > T.consumo_gas,
    norm: (hh, _T) => clamp((hh.I6 - 100) / 350),
    derived: false,
    weighted: true,
  },
  I7: {
    name: 'Perfil horario',
    long: 'I7 – Perfil de consumo por franja horaria',
    role: 'sec',
    source: 'DS6',
    definition: 'Distribución del consumo eléctrico durante el día. Un perfil rígido indica sistemas inflexibles o limitaciones de uso. Escala 0=flexible … 3=muy rígido.',
    display: (hh, _T) => ['Flexible','Moderado','Rígido','Muy rígido'][hh.I7],
    note: (_T) => 'Rígido → menor flexibilidad',
    risk: (hh, _T) => hh.I7 >= 2,
    norm: (hh, _T) => hh.I7 / 3.0,
    derived: false,
    weighted: true,
  },
  I8: {
    name: 'Pobreza energética oculta',
    long: 'I8 – Pobreza energética oculta (infraconsumo forzado)',
    role: 'pri',
    source: 'DS4 · DS6 · DS15 (derivado)',
    definition: 'Consumo anormalmente bajo respecto a hogares comparables, no explicable por eficiencia. Se deriva del cruce de I5/I6 con umbrales de infraconsumo, verificado contra habitabilidad (I9/I10) y renta (I1/I3).',
    display: (hh, T) => i8Display(hh, T),
    note: (_T) => 'Infraconsumo forzado detectado',
    risk: (hh, T) => i8Risk(hh, T),
    norm: (hh, T) => i8Norm(hh, T),
    derived: true,
    weighted: true, // participa en score de P3
  },
  I9: {
    name: 'Habitabilidad',
    long: 'I9 – Condiciones de habitabilidad de la vivienda',
    role: 'pri',
    source: 'DS11 · DS10',
    definition: 'Estado térmico, estructural y sanitario de la vivienda: aislamiento, humedades, riesgos para la salud. Escala 0=adecuada … 3=crítica.',
    display: (hh, _T) => ['Adecuada','Aceptable','Pobre','Crítica'][hh.I9],
    note: (_T) => 'Pobre/crítica → riesgo',
    risk: (hh, _T) => hh.I9 >= 2,
    norm: (hh, _T) => hh.I9 / 3.0,
    derived: false,
    weighted: true,
  },
  I10: {
    name: 'Sistemas energéticos',
    long: 'I10 – Sistemas y elementos de consumo',
    role: 'pri',
    source: 'DS13',
    definition: 'Sistemas energéticos del hogar (calefacción, ACS, refrigeración) y su adecuación. Escala 0=eficiente … 3=obsoleto.',
    display: (hh, _T) => ['Eficiente','Adecuado','Deficiente','Obsoleto'][hh.I10],
    note: (_T) => 'Deficiente/obsoleto → riesgo',
    risk: (hh, _T) => hh.I10 >= 2,
    norm: (hh, _T) => hh.I10 / 3.0,
    derived: false,
    weighted: true,
  },
  I11: {
    name: 'Recibe ayudas',
    long: 'I11 – Acceso a ayudas sociales / energéticas',
    role: 'sec',
    source: 'DS8 · DS3',
    definition: 'El hogar recibe ayudas públicas energéticas (bonus, tarifa social) o sociales formales (RdC). Distingue vulnerabilidad reconocida institucionalmente.',
    display: (hh, _T) => hh.I11 ? 'SÍ' : 'NO',
    note: (_T) => 'Bonus energía / RdC',
    risk: (hh, _T) => Boolean(hh.I11),
    norm: (hh, _T) => hh.I11 ? 1.0 : 0.0,
    derived: false,
    weighted: true,
  },
  I12: {
    name: 'Microcrédito',
    long: 'I12 – Acceso a microcrédito o apoyo comunitario',
    role: 'sec',
    source: 'DS7 · DS27',
    definition: 'Acceso a microcrédito ético o apoyo financiero comunitario. La ausencia de acceso refuerza la severidad de la vulnerabilidad.',
    display: (hh, _T) => hh.I12 ? 'SÍ' : 'NO',
    note: (_T) => 'Sin acceso → riesgo',
    risk: (hh, _T) => !Boolean(hh.I12),
    norm: (hh, _T) => 1.0 - (hh.I12 ? 1.0 : 0.0),
    derived: false,
    weighted: true,
  },
  I15: {
    name: 'Pers. dependientes',
    long: 'I15 – Personas dependientes en el hogar',
    role: 'pri',
    source: 'DS16',
    definition: 'Número de personas menores de 14 o mayores de 70 años (mayores necesidades térmicas y de cuidado). Escala por número de personas.',
    display: (hh, _T) => `${hh.I15} pers.`,
    note: (_T) => '≥ 1 dependiente → riesgo',
    risk: (hh, _T) => hh.I15 >= 1,
    norm: (hh, _T) => clamp(hh.I15 / 3.0),
    derived: false,
    weighted: true,
  },
  I16: {
    name: 'Dependencia funcional',
    long: 'I16 – Dependencia funcional / movilidad reducida',
    role: 'pri',
    source: 'DS17',
    definition: 'Presencia de personas con dependencia funcional o movilidad reducida reconocida. Aumenta sensibilidad a cortes y disconfort térmico.',
    display: (hh, _T) => hh.I16 ? 'SÍ' : 'NO',
    note: (_T) => 'Dependencia reconocida',
    risk: (hh, _T) => Boolean(hh.I16),
    norm: (hh, _T) => hh.I16 ? 1.0 : 0.0,
    derived: false,
    weighted: true,
  },
  I17: {
    name: 'Dep. eléctrica / crónica',
    long: 'I17 – Enfermedades crónicas y dependencia eléctrica',
    role: 'pri',
    source: 'DS18',
    definition: 'Enfermedades crónicas que aumentan necesidades energéticas o dependencia de equipos médicos. Escala: 0=ninguna, 1=térmica, 2=eléctrica intermitente, 3=eléctrica vital (O₂, ventilación).',
    display: (hh, _T) => ['Ninguna','Térmica','Eléct. interm.','Eléct. vital'][hh.I17],
    note: (_T) => 'Eléctrica vital → riesgo severo',
    risk: (hh, _T) => hh.I17 >= 2,
    norm: (hh, _T) => hh.I17 / 3.0,
    derived: false,
    weighted: true,
  },
  I18: {
    name: 'Índice territorial',
    long: 'I18 – Índice territorial socio-ambiental',
    role: 'pri',
    source: 'DS19 · DS20',
    definition: 'Índice de riesgo del área de residencia (privación material, exposición ambiental). Escala 0–100, mayor valor = zona más desfavorecida.',
    display: (hh, _T) => `${hh.I18}/100`,
    note: (T) => `> ${T.territorial} → riesgo`,
    risk: (hh, T) => hh.I18 > T.territorial,
    norm: (hh, _T) => clamp(hh.I18 / 100.0),
    derived: false,
    weighted: true,
  },
  I19: {
    name: 'Acceso a servicios',
    long: 'I19 – Acceso efectivo a infraestructura y servicios',
    role: 'pri',
    source: 'DS21 · DS22',
    definition: 'Tiempo medio de desplazamiento para acceder a servicios esenciales (energía, salud, apoyo social). Mayor tiempo = peor acceso.',
    display: (hh, _T) => `${hh.I19} min`,
    note: (T) => `> ${T.acceso} min → riesgo`,
    risk: (hh, T) => hh.I19 > T.acceso,
    norm: (hh, _T) => clamp(hh.I19 / 60.0),
    derived: false,
    weighted: true,
  },
  I20: {
    name: 'Temp. percibida',
    long: 'I20 – Incapacidad percibida de mantener temperatura',
    role: 'sec',
    source: 'DS8',
    definition: 'El hogar declara incapacidad de mantener una temperatura adecuada en invierno o verano.',
    display: (hh, _T) => hh.I20 ? 'SÍ' : 'NO',
    note: (_T) => 'Malestar térmico declarado',
    risk: (hh, _T) => Boolean(hh.I20),
    norm: (hh, _T) => hh.I20 ? 1.0 : 0.0,
    derived: false,
    weighted: true,
  },
  I21: {
    name: 'Ahorros líquidos',
    long: 'I21 – Ahorros líquidos o activos realizables',
    role: 'sec',
    source: 'DS2 · DS8',
    definition: 'Capacidad de absorber shocks económicos, medida en meses de renta cubiertos por ahorros líquidos.',
    display: (hh, _T) => hh.I21 > 0 ? `${hh.I21} mes${hh.I21 !== 1 ? 'es' : ''}` : 'Ninguno',
    note: (T) => `< ${T.ahorros} mes → riesgo`,
    risk: (hh, T) => hh.I21 < T.ahorros,
    norm: (hh, _T) => clamp((3 - hh.I21) / 3),
    derived: false,
    weighted: true,
  },
  I22: {
    name: 'Red de apoyo social',
    long: 'I22 – Red de apoyo social del hogar',
    role: 'pri',
    source: 'DS25 · DS29',
    definition: 'Disponibilidad de apoyo informal (familia, vecinos, comunidad). Escala 0=red sólida … 3=aislamiento total.',
    display: (hh, _T) => ['Sólida','Moderada','Débil','Aislamiento'][hh.I22],
    note: (_T) => 'Débil/aislamiento → riesgo',
    risk: (hh, _T) => hh.I22 >= 2,
    norm: (hh, _T) => hh.I22 / 3.0,
    derived: false,
    weighted: true,
  },
  I23: {
    name: 'Participación comunit.',
    long: 'I23 – Participación en actividades comunitarias',
    role: 'pri',
    source: 'DS24',
    definition: 'Grado de participación en actividades de la comunidad energética o iniciativas colectivas. Escala 0=regular … 3=nula.',
    display: (hh, _T) => ['Regular','Ocasional','Escasa','Nula'][hh.I23],
    note: (_T) => 'Escasa/nula → menor integración',
    risk: (hh, _T) => hh.I23 >= 2,
    norm: (hh, _T) => hh.I23 / 3.0,
    derived: false,
    weighted: true,
  },
  I24: {
    name: 'Estigmatización',
    long: 'I24 – Aceptación social y estigmatización percibida',
    role: 'pri',
    source: 'DS26 · DS29',
    definition: 'Estigmatización o rechazo social percibido que limita participación y acceso a recursos comunitarios. Escala 0=ninguna … 3=severa.',
    display: (hh, _T) => ['Ninguna','Leve','Moderada','Severa'][hh.I24],
    note: (_T) => 'Moderada/severa → riesgo',
    risk: (hh, _T) => hh.I24 >= 2,
    norm: (hh, _T) => hh.I24 / 3.0,
    derived: false,
    weighted: true,
  },
  I25: {
    name: 'Estabilidad residencial',
    long: 'I25 – Estabilidad administrativa y residencial',
    role: 'sec',
    source: 'DS8',
    definition: 'Años de residencia continua en el domicilio actual. Baja estabilidad puede indicar situación irregular o desplazamientos frecuentes.',
    display: (hh, _T) => hh.I25 > 0 ? `${hh.I25} año${hh.I25 !== 1 ? 's' : ''}` : '< 1 año',
    note: (T) => `< ${T.estabilidad} años → inestable`,
    risk: (hh, T) => hh.I25 < T.estabilidad,
    norm: (hh, _T) => clamp((5 - hh.I25) / 5),
    derived: false,
    weighted: true,
  },
};

// ─── Perfiles ─────────────────────────────────────────────────────────────────

const PROFILES = {
  P1: {
    name: 'Vulnerabilidad económica estructural',
    short: 'Económica',
    color: '#2563EB',
    display_keys: ['I1','I2','I3','I4','I11','I12','I21','I25'],
    weight_keys:  ['I1','I3','I4','I11','I12','I21','I25'],
    init_weights: {I1:0.28,I3:0.18,I4:0.15,I11:0.12,I12:0.10,I21:0.10,I25:0.07},
    question: '¿Presenta vulnerabilidad P1 · económica estructural?',
  },
  P2: {
    name: 'Vulnerabilidad por condiciones de la vivienda',
    short: 'Vivienda',
    color: '#D97706',
    display_keys: ['I9','I10','I5','I6','I7','I20'],
    weight_keys:  ['I9','I10','I5','I6','I7','I20'],
    init_weights: {I9:0.30,I10:0.25,I5:0.12,I6:0.12,I7:0.08,I20:0.13},
    question: '¿Presenta vulnerabilidad P2 · condiciones de la vivienda?',
  },
  P3: {
    name: 'Pobreza energética oculta (infraconsumo)',
    short: 'P. oculta',
    color: '#0891B2',
    display_keys: ['I8','I5','I6','I1','I3','I4','I9','I10'],
    weight_keys:  ['I8','I5','I6','I1','I3','I4','I9','I10'],
    init_weights: {I8:0.34,I5:0.12,I6:0.10,I1:0.14,I3:0.12,I4:0.08,I9:0.05,I10:0.05},
    question: '¿Presenta vulnerabilidad P3 · pobreza energética oculta?',
  },
  P4: {
    name: 'Fragilidad del hogar y dependencia eléctrica',
    short: 'Fragilidad',
    color: '#7C3AED',
    display_keys: ['I15','I16','I17','I5','I6','I9','I10'],
    weight_keys:  ['I15','I16','I17','I5','I6','I9','I10'],
    init_weights: {I15:0.18,I16:0.22,I17:0.30,I5:0.10,I6:0.06,I9:0.07,I10:0.07},
    question: '¿Presenta vulnerabilidad P4 · fragilidad / dependencia eléctrica?',
  },
  P5: {
    name: 'Vulnerabilidad territorial y de acceso',
    short: 'Territorial',
    color: '#16A34A',
    display_keys: ['I18','I19','I22','I23'],
    weight_keys:  ['I18','I19','I22','I23'],
    init_weights: {I18:0.34,I19:0.34,I22:0.16,I23:0.16},
    question: '¿Presenta vulnerabilidad P5 · territorial y de acceso?',
  },
  P6: {
    name: 'Vulnerabilidad socio-comunitaria',
    short: 'Socio-com.',
    color: '#DB2777',
    display_keys: ['I22','I23','I24','I1','I3','I18'],
    weight_keys:  ['I22','I23','I24','I1','I3','I18'],
    init_weights: {I22:0.26,I23:0.22,I24:0.22,I1:0.12,I3:0.10,I18:0.08},
    question: '¿Presenta vulnerabilidad P6 · socio-comunitaria?',
  },
};

// ─── 10 Hogares sintéticos ────────────────────────────────────────────────────

const DEMO_HOUSEHOLDS = [
  {id:'HOG-01',nombre:'Hogar 1',edad:67,composicion:'Pensionista sola, O₂ nocturno',
   desc:'Pensión mínima. Concentrador de oxígeno nocturno. Piso antiguo con humedades, barrio céntrico bien comunicado, buena red familiar.',
   I1:530,I3:18.2,I4:1,I5:145,I6:78,I7:2,I9:2,I10:2,
   I11:1,I12:0,I15:1,I16:1,I17:3,I18:35,I19:12,I20:1,
   I21:0,I22:1,I23:1,I24:0,I25:12,
   gt:{P1:4,P2:3,P3:3,P4:4,P5:1,P6:1}},

  {id:'HOG-02',nombre:'Hogar 2',edad:34,composicion:'Madre sola, 2 hijos menores',
   desc:'Trabajo informal, ingresos irregulares. Corte de luz hace 8 meses. Vivienda precaria mal aislada en zona periférica. Recién llegada, red social escasa.',
   I1:490,I3:22.7,I4:1,I5:340,I6:160,I7:2,I9:3,I10:2,
   I11:0,I12:1,I15:2,I16:0,I17:0,I18:68,I19:42,I20:1,
   I21:0,I22:3,I23:3,I24:2,I25:2,
   gt:{P1:3,P2:4,P3:0,P4:2,P5:4,P6:4}},

  {id:'HOG-03',nombre:'Hogar 3',edad:74,composicion:'Solo, pensión invalidez',
   desc:'Consumo anormalmente bajo: se abriga en vez de calefactar. Piso mal aislado. Renta baja, impago reciente. Barrio bien conectado, red vecinal moderada.',
   I1:510,I3:8.1,I4:1,I5:120,I6:85,I7:1,I9:3,I10:3,
   I11:1,I12:0,I15:1,I16:0,I17:1,I18:64,I19:38,I20:1,
   I21:0,I22:1,I23:2,I24:1,I25:22,
   gt:{P1:4,P2:4,P3:4,P4:1,P5:2,P6:1}},

  {id:'HOG-04',nombre:'Hogar 4',edad:45,composicion:'Pareja, 1 hijo con parálisis cerebral',
   desc:'Cuidados intensivos en casa, equipos eléctricos vitales. ISEE razonable. Vivienda adecuada, barrio bien comunicado, buena integración comunitaria.',
   I1:1050,I3:18.6,I4:0,I5:440,I6:160,I7:3,I9:1,I10:1,
   I11:1,I12:0,I15:1,I16:1,I17:3,I18:30,I19:10,I20:0,
   I21:2,I22:1,I23:0,I24:0,I25:10,
   gt:{P1:1,P2:1,P3:0,P4:4,P5:0,P6:0}},

  {id:'HOG-05',nombre:'Hogar 5',edad:31,composicion:'Solo, solicitante de asilo',
   desc:'Centro de acogida temporal en periferia aislada. Sin ingresos propios. Barrera institucional total, sin red social, estigmatización percibida severa. Vivienda compartida deficiente.',
   I1:290,I3:31.0,I4:0,I5:140,I6:80,I7:2,I9:2,I10:2,
   I11:1,I12:1,I15:0,I16:0,I17:0,I18:75,I19:55,I20:1,
   I21:0,I22:3,I23:3,I24:3,I25:1,
   gt:{P1:4,P2:2,P3:3,P4:0,P5:4,P6:4}},

  {id:'HOG-06',nombre:'Hogar 6',edad:48,composicion:'Pareja, 2 hijos adolescentes',
   desc:'ISEE razonable pero villa antigua con humedades graves y caldera obsoleta. Frío en invierno. Barrio céntrico, buena red social y participación comunitaria activa.',
   I1:1120,I3:13.6,I4:0,I5:390,I6:280,I7:2,I9:3,I10:3,
   I11:0,I12:0,I15:0,I16:0,I17:0,I18:28,I19:9,I20:1,
   I21:3,I22:0,I23:0,I24:0,I25:10,
   gt:{P1:1,P2:4,P3:0,P4:0,P5:0,P6:0}},

  {id:'HOG-07',nombre:'Hogar 7',edad:78,composicion:'Pareja de ancianos dependientes',
   desc:'Dos pensiones sociales mínimas. Consumen muy poco por restricción forzada, no por eficiencia. Vivienda deficiente. Zona rural mal comunicada, lejos de servicios, red social débil.',
   I1:490,I3:6.8,I4:0,I5:110,I6:80,I7:1,I9:2,I10:2,
   I11:1,I12:0,I15:2,I16:1,I17:1,I18:62,I19:48,I20:1,
   I21:0,I22:2,I23:2,I24:2,I25:30,
   gt:{P1:3,P2:3,P3:4,P4:3,P5:4,P6:3}},

  {id:'HOG-08',nombre:'Hogar 8',edad:53,composicion:'Solo, funcionario municipal',
   desc:'Funcionario municipal, ingresos estables y holgados. Piso moderno eficiente en barrio céntrico. Sin señales de vulnerabilidad en ninguna dimensión. Buena red social.',
   I1:1540,I3:4.9,I4:0,I5:210,I6:100,I7:0,I9:0,I10:0,
   I11:0,I12:0,I15:0,I16:0,I17:0,I18:20,I19:8,I20:0,
   I21:6,I22:0,I23:1,I24:0,I25:15,
   gt:{P1:0,P2:0,P3:0,P4:0,P5:0,P6:0}},

  {id:'HOG-09',nombre:'Hogar 9',edad:35,composicion:'Solo, ex-recluso en reinserción',
   desc:'6 meses fuera del sistema penitenciario. Sin historial crediticio ni red social, estigmatización severa. ISEE bajo. Vivienda modesta en barrio céntrico, participación nula.',
   I1:680,I3:8.1,I4:0,I5:135,I6:70,I7:1,I9:2,I10:2,
   I11:1,I12:0,I15:0,I16:0,I17:0,I18:38,I19:14,I20:1,
   I21:0,I22:3,I23:3,I24:3,I25:1,
   gt:{P1:3,P2:1,P3:1,P4:0,P5:1,P6:4}},

  {id:'HOG-10',nombre:'Hogar 10',edad:44,composicion:'Pareja, 2 hijos, clase media',
   desc:'Ambos empleados fijos, ingresos holgados. Piso en propiedad bien aislado y eficiente. Barrio bien comunicado, integración comunitaria plena. Sin vulnerabilidad.',
   I1:1680,I3:5.8,I4:0,I5:280,I6:160,I7:1,I9:0,I10:0,
   I11:0,I12:0,I15:0,I16:0,I17:0,I18:22,I19:7,I20:0,
   I21:6,I22:0,I23:0,I24:0,I25:12,
   gt:{P1:0,P2:0,P3:0,P4:0,P5:0,P6:0}},
];

// Dataset de trabajo mutable — se reemplaza al cargar XLSX
let HOUSEHOLDS = JSON.parse(JSON.stringify(DEMO_HOUSEHOLDS));

// ─── Funciones de cálculo ─────────────────────────────────────────────────────

function scoreHousehold(hh, weights, profile, T) {
  const keys = PROFILES[profile].weight_keys;
  const totalW = keys.reduce((s, k) => s + (weights[k] || 0), 0) || 1;
  return keys.reduce((s, k) => s + (weights[k] || 0) * INDICATOR_DEFS[k].norm(hh, T), 0) / totalW;
}

// MSE ordinal: target = expertLabel / 4, minimiza (score - target)²
function optimizeWeights(profile, expertLabels, thresholds) {
  const profDef = PROFILES[profile];
  const keys = profDef.weight_keys;
  const init = profDef.init_weights;
  const labeled = HOUSEHOLDS.filter(hh => expertLabels[hh.id] !== undefined);

  if (labeled.length === 0) return {...init};

  const LAMBDA = 15.0;
  const ITERS  = 700;
  let lr = 0.05;

  const w = {};
  keys.forEach(k => w[k] = init[k]);

  for (let iter = 0; iter < ITERS; iter++) {
    const totalW = keys.reduce((s, k) => s + w[k], 0) || 1;
    const grad = {};
    keys.forEach(k => grad[k] = 0);

    for (const hh of labeled) {
      const target   = expertLabels[hh.id] / 4;        // normalise 0-4 → 0-1
      const rawScore = keys.reduce((s, k) => s + w[k] * INDICATOR_DEFS[k].norm(hh, thresholds), 0) / totalW;
      const err      = rawScore - target;               // MSE gradient

      for (const k of keys) {
        const nk     = INDICATOR_DEFS[k].norm(hh, thresholds);
        const numerN = keys.reduce((a, j) => a + w[j] * INDICATOR_DEFS[j].norm(hh, thresholds), 0);
        grad[k] += err * (nk * totalW - numerN) / (totalW * totalW);
      }
    }

    for (const k of keys) {
      grad[k] += 2 * LAMBDA * (w[k] - init[k]);
      w[k] = Math.max(0.001, w[k] - lr * grad[k]);
    }

    const sum = keys.reduce((s, k) => s + w[k], 0);
    keys.forEach(k => w[k] /= sum);

    if ((iter + 1) % 200 === 0) lr *= 0.6;
  }

  return w;
}

// Métricas ordinales: MAE, RMSE, exact accuracy, within-1 accuracy, matriz 5×5
function computeOrdinalMetrics(weights, profile, expertLabels, T) {
  const labeled = HOUSEHOLDS.filter(hh => expertLabels[hh.id] !== undefined);
  const n = labeled.length;
  const empty = {n:0, mae:0, rmse:0, exactAccuracy:0, withinOneAccuracy:0,
                 confusionMatrix: Array.from({length:5}, () => Array(5).fill(0))};
  if (n === 0) return empty;

  let absErr = 0, sqErr = 0, exact = 0, within1 = 0;
  const matrix = Array.from({length:5}, () => Array(5).fill(0));

  for (const hh of labeled) {
    const label = expertLabels[hh.id];             // 0-4
    const score = scoreHousehold(hh, weights, profile, T);
    const pred  = scoreToLevel(score);             // 0-4
    const diff  = Math.abs(pred - label);

    absErr += diff;
    sqErr  += diff * diff;
    if (diff === 0) exact++;
    if (diff <= 1)  within1++;
    if (label >= 0 && label <= 4 && pred >= 0 && pred <= 4) matrix[label][pred]++;
  }

  return {
    n,
    mae:               absErr / n,
    rmse:              Math.sqrt(sqErr / n),
    exactAccuracy:     exact   / n,
    withinOneAccuracy: within1 / n,
    confusionMatrix:   matrix,
  };
}

// ─── Tests de paridad Python ↔ JavaScript ────────────────────────────────────

const PARITY_REFERENCE = {
  'HOG-01_P1':0.79954,'HOG-02_P1':0.66794,'HOG-03_P1':0.73382,'HOG-04_P1':0.403753,
  'HOG-05_P1':0.736,'HOG-06_P1':0.18992,'HOG-07_P1':0.58146,'HOG-08_P1':0.1,
  'HOG-09_P1':0.58032,'HOG-10_P1':0.10576,
  'HOG-01_P2':0.55,'HOG-02_P2':0.735714,'HOG-03_P2':0.706667,'HOG-04_P2':0.383333,
  'HOG-05_P2':0.55,'HOG-06_P2':0.877333,'HOG-07_P2':0.523333,'HOG-08_P2':0.020571,
  'HOG-09_P2':0.523333,'HOG-10_P2':0.09181,
  'HOG-01_P3':0.502943,'HOG-02_P3':0.454829,'HOG-03_P3':0.51963,'HOG-04_P3':0.241435,
  'HOG-05_P3':0.508,'HOG-06_P3':0.288994,'HOG-07_P3':0.41489,'HOG-08_P3':0.020571,
  'HOG-09_P3':0.359547,'HOG-10_P3':0.065554,
  'HOG-01_P4':0.673333,'HOG-02_P4':0.301238,'HOG-03_P4':0.3,'HOG-04_P4':0.71981,
  'HOG-05_P4':0.093333,'HOG-06_P4':0.239429,'HOG-07_P4':0.533333,'HOG-08_P4':0.017143,
  'HOG-09_P4':0.093333,'HOG-10_P4':0.047429,
  'HOG-01_P5':0.293667,'HOG-02_P5':0.7892,'HOG-03_P5':0.592933,'HOG-04_P5':0.212,
  'HOG-05_P5':0.886667,'HOG-06_P5':0.1462,'HOG-07_P5':0.696133,'HOG-08_P5':0.166667,
  'HOG-09_P5':0.528533,'HOG-10_P5':0.114467,
  'HOG-01_P6':0.3413,'HOG-02_P6':0.858367,'HOG-03_P6':0.473767,'HOG-04_P6':0.187567,
  'HOG-05_P6':0.98,'HOG-06_P6':0.0688,'HOG-07_P6':0.629967,'HOG-08_P6':0.089333,
  'HOG-09_P6':0.8208,'HOG-10_P6':0.0208,
};

function runParityTests() {
  const T = {...DEFAULT_THRESHOLDS};
  const results = [];
  let passed = 0, failed = 0;

  for (const hh of HOUSEHOLDS) {
    for (const p of Object.keys(PROFILES)) {
      const key = `${hh.id}_${p}`;
      const js = scoreHousehold(hh, PROFILES[p].init_weights, p, T);
      const py = PARITY_REFERENCE[key];
      const ok = Math.abs(js - py) < 0.001;
      if (ok) passed++; else failed++;
      results.push({key, js: js.toFixed(5), py: py.toFixed(5), ok});
    }
  }

  console.group(`Paridad Python ↔ JS: ${passed}/${passed+failed} tests OK`);
  for (const r of results) {
    if (!r.ok) console.warn(`FALLO ${r.key}: JS=${r.js} py=${r.py}`);
  }
  if (failed === 0) console.log('✓ Todos los scores coinciden con Python (tolerancia 0.001)');
  console.groupEnd();
  return {passed, failed, results};
}
