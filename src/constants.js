/* =============================================
   TALUDES — Constants, Defaults, Scenarios
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};

  // Physics
  T.GAMMA_WATER = 9.81; // kN/m³

  // Defaults (Caso de Validación — Escenario Bonus)
  T.DEFAULTS = {
    height: 10,
    slopeAngle: 45,
    gamma: 18,
    cohesion: 10,
    friction: 30,
    waterTable: 3,
    numSlices: 15,
    method: 'bishop',
    circleX: null,   // auto-calculate
    circleY: null,
    circleR: null,
    drainedMode: true, // true = drained (effective stress), false = undrained (total stress)
    units: 'si'
  };

  // Parameter ranges
  T.RANGES = {
    height:     { min: 2,   max: 50,  step: 0.5, unit: 'm' },
    slopeAngle: { min: 10,  max: 85,  step: 1,   unit: '°' },
    gamma:      { min: 14,  max: 24,  step: 0.1,  unit: 'kN/m³' },
    cohesion:   { min: 0,   max: 100, step: 0.5, unit: 'kPa' },
    friction:   { min: 0,   max: 45,  step: 0.5, unit: '°' },
    waterTable: { min: 0,   max: 50,  step: 0.1, unit: 'm' },
    numSlices:  { min: 5,   max: 50,  step: 1,   unit: '' },
    circleX:    { min: -50, max: 50,  step: 0.1, unit: 'm' },
    circleY:    { min: 0,   max: 80,  step: 0.1, unit: 'm' },
    circleR:    { min: 2,   max: 80,  step: 0.1, unit: 'm' }
  };

  // Labels for display
  T.LABELS = {
    height: 'Altura',
    slopeAngle: 'Ángulo del talud',
    gamma: 'Peso unitario γ',
    cohesion: 'Cohesión c',
    friction: 'Fricción φ',
    waterTable: 'Nivel freático',
    numSlices: 'Dovelas',
    circleX: 'Centro X',
    circleY: 'Centro Y',
    circleR: 'Radio R'
  };

  // FS thresholds
  T.FS_STABLE = 1.5;
  T.FS_CAUTION = 1.0;

  // Colors
  T.COLORS = {
    soil:           '#D4B896',
    soilBorder:     '#8B7355',
    soilDark:       '#3A3225',
    soilDarkBorder: '#5A4A35',
    water:          '#5B9BD5',
    waterFill:      'rgba(91,155,213,0.25)',
    waterLine:      'rgba(91,155,213,0.6)',
    skyTop:         '#E8F0FE',
    skyBottom:      '#FFFFFF',
    skyDarkTop:     '#1a1a2e',
    skyDarkBottom:  '#16213e',
    grid:           'rgba(0,0,0,0.06)',
    gridDark:       'rgba(255,255,255,0.08)',
    circleSafe:     'rgba(153,153,153,0.4)',
    circleCaution:  'rgba(230,126,34,0.7)',
    circleDanger:   '#DC3545',
    sliceGood:      '#27AE60',  // green - contributes to stability
    sliceNeutral:   '#F4D03F',  // yellow - neutral
    sliceBad:       '#E74C3C',  // red - destabilizing
    fsGreen:        '#27AE60',
    fsYellow:       '#F39C12',
    fsRed:          '#E74C3C',
    center:         '#333333'
  };

  // Scenarios from SCENARIOS.md
  T.SCENARIOS = {
    validation: {
      name: 'Caso de Validación',
      subtitle: 'Parámetros estándar para verificación.',
      params: { height: 10, slopeAngle: 45, gamma: 18, cohesion: 10, friction: 30, waterTable: 3, numSlices: 15 },
      lesson: 'Configuración estándar para comparación con valores de referencia.',
      question: 'Referencia: Fellenius ≈ 1.2-1.5, Bishop ≈ 1.3-1.6'
    },
    highway_cut: {
      name: 'Corte de Carretera',
      subtitle: 'Suelo granular, talud empinado, sin agua.',
      params: { height: 8, slopeAngle: 60, gamma: 19, cohesion: 5, friction: 35, waterTable: 0, numSlices: 12 },
      lesson: 'Estabilidad controlada por fricción y geometría del corte.',
      question: 'Sensible a variaciones de φ y β.'
    },
    soft_clay: {
      name: 'Terraplén sobre Arcilla',
      subtitle: 'Suelo cohesivo, nivel freático elevado.',
      params: { height: 6, slopeAngle: 30, gamma: 16, cohesion: 25, friction: 15, waterTable: 4, numSlices: 15 },
      lesson: 'La estabilidad depende del equilibrio entre cohesión y presión de poros.',
      question: 'Evaluar impacto del NF en el FS.'
    },
    urban_excavation: {
      name: 'Excavación Urbana',
      subtitle: 'Corte profundo, ángulo subvertical, presencia de agua.',
      params: { height: 12, slopeAngle: 75, gamma: 18, cohesion: 15, friction: 28, waterTable: 6, numSlices: 15 },
      lesson: 'Requiere suelo competente o contención. FS típicamente bajo.',
      question: 'Evaluar c necesaria para FS > 1.5 sin contención.'
    },
    tropical_hillside: {
      name: 'Ladera Tropical',
      subtitle: 'Ladera natural, suelo residual, NF variable.',
      params: { height: 20, slopeAngle: 25, gamma: 17, cohesion: 8, friction: 32, waterTable: 3, numSlices: 20 },
      lesson: 'Estabilidad condicionada por variación estacional del NF.',
      question: 'Variar NF para evaluar umbral de inestabilidad.'
    },
    failing_slope: {
      name: 'El Talud que Falla',
      subtitle: 'Parámetros desfavorables combinados.',
      params: { height: 15, slopeAngle: 70, gamma: 20, cohesion: 5, friction: 20, waterTable: 10, numSlices: 15 },
      lesson: 'Combinación de geometría agresiva, suelo débil y NF alto.',
      question: 'Evaluar qué intervención (geometría, suelo, drenaje) es más efectiva.'
    }
  };

  // FS reference context
  T.FS_REFERENCES = [
    { fs: 1.5, label: 'Margen alto', desc: 'Umbral orientativo' },
    { fs: 1.3, label: 'Margen reducido', desc: 'Umbral orientativo' },
    { fs: 1.0, label: 'Límite', desc: 'Equilibrio precario' }
  ];

  // Unit conversion factors (SI to Imperial)
  T.UNIT_FACTORS = {
    m_to_ft: 3.28084,
    kN_m3_to_pcf: 6.36587,
    kPa_to_psf: 20.8854
  };

  T.IMPERIAL_UNITS = {
    'm': 'ft',
    'kN/m³': 'pcf',
    'kPa': 'psf',
    '°': '°',
    '': ''
  };

  // Bishop convergence parameters
  T.BISHOP_MAX_ITER = 200;
  T.BISHOP_TOLERANCE = 0.001;
  T.BISHOP_RELAXATION = 0.5;
  T.MALPHA_MIN = 0.2;

  // Critical circle search parameters
  T.SEARCH_GRID = {
    xSteps: 15,
    ySteps: 12,
    rSteps: 10,
    xPadding: 0.3,  // fraction of height
    yMin: 1.1,      // multiplier on height for min Y of center
    yMax: 3.0,      // multiplier on height for max Y of center
    rMin: 0.8,      // multiplier on height for min radius
    rMax: 2.5       // multiplier on height for max radius
  };

  // Guide content
  T.GUIDE = {
    fs: {
      title: 'Factor de Seguridad (FS)',
      text: 'Relación entre resistencia disponible y resistencia movilizada para la superficie analizada. FS < 1 indica resistencia insuficiente en este modelo. Los umbrales mostrados son orientativos; el criterio de diseño depende del proyecto.'
    },
    fellenius: {
      title: 'Método de Fellenius',
      text: 'Método Ordinario de Dovelas. Desprecia las fuerzas entre dovelas y no requiere iteración. Compararlo con Bishop no constituye por sí solo una validación.'
    },
    bishop: {
      title: 'Método de Bishop Simplificado',
      text: 'Bishop (1955). Considera fuerzas normales entre dovelas. Más preciso que Fellenius, estándar en la práctica. Requiere iteración (convergencia típica en 5-15 ciclos).'
    },
    slices: {
      title: 'Dovelas',
      text: 'Divisiones verticales de la masa de suelo sobre la superficie de falla circular. Cada dovela tiene peso W, ángulo de base α, presión de poros u. El FS resulta del balance global.'
    },
    interpretation: {
      title: 'Interpretación de resultados',
      text: 'Cálculo preliminar para suelo homogéneo y superficie circular, con tratamiento simplificado del agua y de grietas de tracción. La búsqueda explora una grilla finita: no garantiza el mínimo global. Monte Carlo considera variables independientes y una superficie fija; su intervalo de confianza mide incertidumbre de muestreo, no incertidumbre del modelo físico.'
    },
    colors: {
      title: 'Colores en el diagrama',
      text: '<b>Dovelas:</b> verde = estabilizante, amarillo = neutral, rojo = desestabilizante. La peor dovela tiene borde rojo punteado.<br><b>Círculo de falla:</b> gris punteado = FS ≥ 1.5 (estable), naranja = FS 1.0-1.5 (precaución), rojo sólido = FS < 1.0 (peligro).<br><b>Agua:</b> zona azul semitransparente con línea punteada al nivel freático.'
    }
  };

  // Keyboard shortcuts
  T.SHORTCUTS = {
    'r': { action: 'reset', desc: 'Reiniciar a valores por defecto' },
    'c': { action: 'criticalSearch', desc: 'Buscar círculo crítico' },
    'f': { action: 'toggleMethod', desc: 'Alternar Fellenius/Bishop' },
    's': { action: 'toggleSensitivity', desc: 'Mostrar u ocultar el análisis de sensibilidad' },
    'm': { action: 'toggleComparison', desc: 'Mostrar u ocultar la comparación de métodos' },
    '1': { action: 'scenario:0', desc: 'Caso de Validación' },
    '2': { action: 'scenario:1', desc: 'Corte de Carretera' },
    '3': { action: 'scenario:2', desc: 'Terraplén sobre Arcilla' },
    '4': { action: 'scenario:3', desc: 'Excavación Urbana' },
    '5': { action: 'scenario:4', desc: 'Ladera Tropical' },
    '6': { action: 'scenario:5', desc: 'El Talud que Falla' }
  };

})(typeof window !== 'undefined' ? window : global);
