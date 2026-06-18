# SOCIAREM · PoC Web — Perfiles de Vulnerabilidad Energética

Demo web estática del evaluador de perfiles de vulnerabilidad energética del Piloto Messina.
Migrada desde Python/Tkinter a HTML + CSS + JavaScript vanilla.

---

## Cómo ejecutar

### Opción 1 — servidor local (recomendado)
```bash
cd web-poc
python -m http.server 8765
```
Abrir: **http://localhost:8765**

### Opción 2 — directo en navegador
Abrir `index.html` directamente. Todos los scripts son `<script src>`, sin módulos ES.
Funciona en Chrome, Firefox y Edge modernos.

---

## Estructura de archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura HTML: login, topbar, sidebar, área principal |
| `styles.css` | Diseño visual, layout, tarjetas, botones, sliders, tooltip |
| `data.js` | Hogares, perfiles, indicadores, umbrales, funciones de cálculo |
| `app.js` | Estado, renderizado, eventos, optimización, exportación |

---

## Flujo de la demo

### Login
Pantalla inicial con campo de nombre de evaluador (sin contraseña). El nombre se guarda en `localStorage` y se muestra en la topbar. El botón «Cambiar» vuelve al login.

### Fase 1 — Etiquetado experto ordinal
El experto evalúa cada hogar para el perfil activo.

- Selector de perfil (P1–P6) en la barra superior.
- Listado de 10 hogares sintéticos en el sidebar.
- Tarjetas de indicadores **neutrales** (sin rojo/verde para no sesgar al experto).
- **5 botones ordinales**: `0 · No | 1 · Baja | 2 · Media | 3 · Alta | 4 · Muy alta`
- Auto-avance al siguiente hogar al asignar etiqueta nueva.
- Botón **Auto-demo** para animación paso a paso.
- Botón **Asignar todo** para rellenar instantáneamente.
- Con ≥ 3 etiquetas aparece el botón **Optimizar pesos**.

### Fase 2 — Scores, pesos y métricas (layout 2 columnas)

**Columna izquierda:**
- Banner de score compacto con nivel ordinal predicho vs. etiqueta experto.
- Métricas ordinales: MAE, RMSE, exactitud exacta, precisión ±1.
- Sliders de pesos (actualizan todo en tiempo real).
- Panel de versiones de pesos: guardar / cargar / eliminar / exportar por nombre.
- Botones de exportación JSON / CSV.

**Columna derecha:**
- Tabla compacta de los 10 hogares con: Hogar · Score · Nivel · Experto · Error ordinal.

---

## Perfiles disponibles

| Perfil | Nombre | Indicadores clave |
|---|---|---|
| P1 | Vulnerabilidad económica estructural | I1, I2, I3, I4, I11, I12, I21, I25 |
| P2 | Condiciones de la vivienda | I9, I10, I5, I6, I7, I20 |
| P3 | Pobreza energética oculta | I8, I5, I6, I1, I3, I4, I9, I10 |
| P4 | Fragilidad / dependencia eléctrica | I15, I16, I17, I5, I6, I9, I10 |
| P5 | Territorial y acceso | I18, I19, I22, I23 |
| P6 | Socio-comunitaria | I22, I23, I24, I1, I3, I18 |

Cada perfil mantiene estado independiente: etiquetas experto, pesos optimizados y fase actual.

---

## Escala ordinal de vulnerabilidad

| Nivel | Etiqueta | Color |
|---|---|---|
| 0 | No vulnerable | Verde |
| 1 | Vulnerabilidad baja | Lima |
| 2 | Vulnerabilidad media | Naranja |
| 3 | Vulnerabilidad alta | Rojo |
| 4 | Muy vulnerable | Violeta |

---

## Fórmula de score

Cada indicador se normaliza a `[0, 1]` (0 = sin vulnerabilidad, 1 = máxima).

```
score(hogar, perfil) = Σ(w_i × norm_i(hogar)) / Σ(w_i)
```

El nivel predicho se obtiene con `scoreToLevel(score)` usando umbrales:

```
[0.20, 0.40, 0.60, 0.80] → niveles 0, 1, 2, 3, 4
```

---

## Optimización de pesos (MSE ordinal)

Descenso de gradiente con regularización L2 hacia los pesos iniciales:

```
target  = etiqueta_experto / 4          # normaliza 0-4 → 0-1
loss    = MSE(score, target) + λ × Σ(w_i − w_i_init)²
```

- λ = 15 (mantiene pesos cerca del conocimiento experto previo)
- Solo usa hogares con etiqueta asignada por el experto
- No usa etiquetas de referencia como fallback silencioso

---

## Métricas ordinales (Fase 2)

| Métrica | Descripción |
|---|---|
| MAE | Error absoluto medio entre nivel predicho y nivel experto |
| RMSE | Raíz del error cuadrático medio |
| Exactas | % de predicciones con nivel idéntico al experto |
| ±1 | % de predicciones dentro de 1 nivel del experto |
| Matriz 5×5 | Distribución de predicciones vs. etiquetas experto |

---

## Versiones de pesos

Los pesos optimizados (o modificados manualmente con sliders) pueden guardarse con un nombre libre. Las versiones se almacenan en `localStorage` bajo la clave `sociarem_weight_versions_v1`, organizadas por usuario y perfil. Se pueden cargar, eliminar y exportar a JSON.

---

## Indicadores derivados

- **I2** — Derivado de I1/ISEE. Informativo, sin peso propio en ningún perfil.
- **I8** — Pobreza energética oculta (infraconsumo forzado). Derivado pero ponderado en P3.

---

## Etiquetas de referencia

Las etiquetas de referencia (`gt`, valores 0-4) están ocultas por defecto para no sesgar al experto.
Para verlas, activar el toggle **Mostrar etiquetas de referencia** en la barra superior.

El botón **Auto-demo** / **Asignar todo** copia explícitamente las etiquetas de referencia
a las etiquetas experto, a petición del usuario, para preparar la demo.

---

## Carga de datos XLSX

El botón **Subir XLSX** acepta archivos con columnas:

```
id, nombre, edad, composicion, desc,
I1, I3, I4, I5, I6, I7, I9, I10, I11, I12,
I15, I16, I17, I18, I19, I20, I21, I22, I23, I24, I25,
gt_P1, gt_P2, gt_P3, gt_P4, gt_P5, gt_P6   ← opcionales, valores 0-4
```

Si los valores `gt_P*` son todos 0/1 (formato binario antiguo), se detecta automáticamente
y se reasigna 1 → 4 (Muy vulnerable) con aviso.

El botón **Descargar plantilla** genera un XLSX de ejemplo con hoja `hogares` y hoja `leyenda`.

---

## Exportación

- **JSON**: perfil, umbrales, pesos, métricas, hogares con todos los campos ordinales.
- **CSV**: columnas `expert_label`, `expert_label_text`, `score`, `predicted_level`, `predicted_level_text`, `ordinal_error` + indicadores.
- Las etiquetas de referencia no se incluyen por defecto (checkbox «Incluir ref.»).

---

## Limitaciones del PoC

- Dataset sintético de 10 hogares — no representativo estadísticamente.
- La optimización JS (descenso de gradiente) no replica scipy SLSQP; divergencia en pesos esperada.
- El login es solo por nombre (sin contraseña ni backend).
- Las versiones de pesos se guardan en `localStorage`; se pierden si se limpia el navegador.
- Los indicadores cualitativos (I7, I9, I10…) usan escalas ordinales simplificadas.
