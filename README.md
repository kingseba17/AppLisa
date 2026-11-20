# Lisa 🐾

Diario de cuidados de Lisa: peso, comidas, paseos, vacunas, remedios, visitas al veterinario, gastos, notas y fotos.

PWA hecha con HTML, CSS y JavaScript (sin frameworks; Chart.js para los gráficos). Funciona sin internet y se instala en el iPhone.

## Privacidad
Los datos se guardan **solo en el teléfono** (IndexedDB). Este repositorio tiene únicamente el código; nunca datos ni respaldos.

## Instalar en el iPhone
1. Abre la página de GitHub Pages en **Safari**.
2. Toca **Compartir** → **Agregar a pantalla de inicio**.
3. Usa siempre la app desde el ícono.

## Publicar cambios
```powershell
.\publicar.ps1 "describe tu cambio"
```
Cambia la versión, hace commit y push. GitHub Pages publica en 1-2 minutos y el iPhone se actualiza solo al abrir la app, sin tocar los datos.

## Estructura
| Archivo | Para qué sirve |
|---|---|
| `index.html` | Página principal y metadatos para iPhone |
| `css/styles.css` | Estilos (modo claro/oscuro, notch y barra inferior) |
| `js/app.js` | Pantallas, formularios, gráficos, respaldo |
| `js/db.js` | Base de datos local (IndexedDB) |
| `js/fotos.js` | Compresión de fotos |
| `sw.js` | Service worker: modo sin internet y actualizaciones |
| `manifest.webmanifest` | Nombre, ícono y colores de la app instalada |
| `publicar.ps1` | Publica una versión nueva con un comando |
