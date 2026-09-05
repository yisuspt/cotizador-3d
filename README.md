# Cotizador de Impresión 3D

App de escritorio/web para cotizar trabajos de impresión 3D: impresoras, materiales,
piezas múltiples, acabados y generación de PDF para el cliente.

## Antes de empezar

Necesitas tener instalado [Node.js](https://nodejs.org) (versión 18 o superior).

## Correrlo en tu computadora

```bash
npm install
npm run dev
```

Esto abre la app en `http://localhost:5173`. Los cambios se ven al instante.

## Publicarlo en GitHub Pages (gratis)

1. **Crea un repositorio nuevo en GitHub** (público, para que Pages sea gratis) y sube este código:

   ```bash
   git init
   git add .
   git commit -m "Primera versión del cotizador"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/NOMBRE-DE-TU-REPO.git
   git push -u origin main
   ```

2. **Edita `vite.config.js`** y cambia `base: "/cotizador-3d/"` por
   `base: "/NOMBRE-DE-TU-REPO/"` (el nombre exacto de tu repositorio).
   - Si tu repositorio se llama exactamente `TU-USUARIO.github.io`, usa `base: "/"` en su lugar.
   - Vuelve a subir el cambio (`git add`, `git commit`, `git push`).

3. **Activa GitHub Pages** en tu repositorio:
   - Ve a `Settings` → `Pages`.
   - En "Build and deployment", elige **Source: GitHub Actions**.

4. Cada vez que hagas `git push` a `main`, el workflow en
   `.github/workflows/deploy.yml` compila la app automáticamente y la publica.
   Tu sitio quedará en `https://TU-USUARIO.github.io/NOMBRE-DE-TU-REPO/`.

   La primera vez puede tardar 1-2 minutos — puedes ver el progreso en la
   pestaña **Actions** de tu repositorio.

## Sobre dónde se guardan tus datos

Esta versión guarda tus tarifas, impresoras, materiales e historial de
cotizaciones en el **almacenamiento local del navegador** (`localStorage`),
es decir: quedan guardados en ESA computadora y ESE navegador únicamente.
Si usas la app desde otra computadora, empezará con los valores por defecto.

Si más adelante quieres que tus datos se sincronicen entre varias
computadoras (o agregar cuentas de usuario), el archivo `src/storage.js`
es el único que habría que cambiar por un backend real
(por ejemplo Supabase o Firebase) — el resto de la app no necesita tocarse.

## Generar el PDF

El botón "Descargar PDF para el cliente" genera un archivo `.pdf` real
(usando las librerías `jspdf` y `html2canvas`, ya incluidas), sin depender
del diálogo de impresión del navegador. El PDF no incluye tu desglose de
costos ni tu margen de ganancia — solo el precio final por pieza y el total.
