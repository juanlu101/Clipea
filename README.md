# Clipea — editor de vídeo para el aula

**Autor:** Juan Luis Torralbo Muñoz (2026). Uso educativo.

El nombre y el autor están en `js/config.js`.

Clipea es un editor de vídeo que funciona entero en el navegador, al estilo de Clipchamp o CapCut, pensado para alumnado de 1.º de Bachillerato. No necesita servidor ni base de datos: los vídeos **no se suben a internet**, todo se procesa y se guarda en el ordenador de cada estudiante.

## Qué incluye

**Novedades de esta versión:** plantillas, biblioteca de música propia y de material libre, texto a voz, efectos de voz, música que baja sola al hablar, 20 efectos de vídeo, quitar fondo con IA, pantalla dividida, subtítulos karaoke, invertir clips, reemplazar clips y selección múltiple.


- **Multimedia:** importar vídeo, audio e imágenes (arrastrar y soltar), miniaturas y forma de onda.
- **Línea de tiempo:** varias pistas de vídeo/audio, arrastrar, recortar bordes, dividir (S), duplicar, copiar/pegar, imán, zoom, bloquear/ocultar/silenciar pistas, deshacer/rehacer.
- **Vista previa:** mover, escalar y girar elementos directamente sobre el vídeo, con guías de centrado.
- **Texto:** 12 estilos (título, rótulo inferior, cómic, neón, máquina de escribir…), 24 fuentes, contorno, sombra, fondo.
- **Subtítulos:** pista propia con estilo común, importar/exportar SRT, **subtítulos automáticos a partir del audio de un clip** y dictado con la voz.
- **Animaciones:** entrada, salida y continuas (zoom lento, latido, flotar…) y **fotogramas clave** de posición, escala, rotación y opacidad.
- **Transiciones** entre clips (15 tipos) y **filtros** (16 + ajustes de brillo, contraste, temperatura, viñeta…).
- **Máscaras** (círculo, óvalo, esquinas redondeadas, corazón, estrella) con borde y sombra, y botón «Burbuja de cámara».
- **Croma** (fondo verde/azul) con detección automática del color, cuentagotas, velocidad (0,1×–8×), congelar fotograma, recortar bordes, voltear, modos de fusión.
- **Audio:** volumen hasta 200 %, fundidos, separar el audio del vídeo y 13 efectos de sonido propios (sin derechos).
- **Plantillas (7):** presentación de fotos, noticiario, tutorial, vídeo vertical, entrevista, tráiler y experimento científico. Traen huecos «Arrastra aquí» y su propia música.
- **Biblioteca:** 12 estilos de música original generada en el propio ordenador (sin derechos y sin conexión, cada versión distinta) y buscador de vídeos, fotos, música y sonidos libres de **Wikimedia Commons**, con autor, licencia y créditos automáticos.
- **Texto a voz:** voces básicas sin conexión (castellano, catalán, euskera, inglés, francés…) y voces naturales que se descargan una vez (unos 60 MB cada una) y luego funcionan sin conexión.
- **Audio avanzado:** efectos de voz (mejorar voz, eco, cueva, radio, megáfono, robot, alienígena, bajo el agua), música que se atenúa sola cuando alguien habla y volumen con fotogramas clave.
- **Efectos de vídeo (20):** glitch, VHS, cine antiguo, terremoto, zoom al ritmo, RGB, pixelado, espejo, confeti, nieve, corazones, lluvia, destellos, bandas de cine…
- **IA y composición:** quitar el fondo de personas sin pantalla verde, pantalla dividida en un clic, máscaras con borde y sombra, subtítulos estilo karaoke.
- **Edición:** selección múltiple (Mayús/Ctrl + clic, recuadro, Ctrl + A), invertir clips (al revés), reemplazar un clip por otro archivo.
- **Grabar:** pantalla, cámara, pantalla + cámara (en círculo) y voz en off sobre el vídeo.
- **Formatos:** 16:9, 9:16, 1:1, 4:3 y 4:5, con fondo de color o desenfocado.
- **Exportar** a MP4 (H.264) de 480p a 1080p con aceleración por hardware, además de WAV, PNG y SRT.
- **Guardado:** se guarda solo en el navegador y se puede descargar un archivo `.vproj` para continuar en otro ordenador.

## Requisitos

- **Google Chrome o Microsoft Edge** actualizados (para exportar se usan WebCodecs; Firefox y Safari no sirven para exportar).
- Ordenador con 8 GB de RAM o más (un i3 de 12.ª generación con 16 GB va sobrado para 1080p).
- La página tiene que abrirse desde una dirección web (`https://…`). **No funciona** si se abre `index.html` con doble clic.

## Publicarlo (elige una opción)

### Opción A: Netlify (la más sencilla, unos 3 minutos)

1. Crea una cuenta gratuita en <https://app.netlify.com/signup> (con Google o GitHub).
2. Entra en <https://app.netlify.com/drop>.
3. Descomprime el ZIP y **arrastra la carpeta `editor-video`** (la que contiene `index.html`) a la página.
4. En unos segundos tendrás una dirección del tipo `https://nombre-raro-123.netlify.app`. En *Site configuration → Change site name* puedes cambiarla por algo como `https://editor-1bach.netlify.app`.
5. Ese es el enlace para tus estudiantes.

> Importante: sin iniciar sesión, Netlify borra el sitio al cabo de una hora. Con la cuenta creada, se queda publicado.

Para actualizarlo más adelante: *Deploys* → arrastra de nuevo la carpeta.

### Opción B: GitHub Pages

1. Crea un repositorio público en GitHub (por ejemplo `editor-video`).
2. Pulsa *Add file → Upload files* y sube **el contenido** de la carpeta (`index.html`, `css/`, `js/`, `lib/`, `.nojekyll`).
3. Ve a *Settings → Pages*, en *Source* elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`. Guarda.
4. Al cabo de un minuto estará en `https://TU-USUARIO.github.io/editor-video/`.

### Probarlo en tu ordenador sin publicarlo

Con Python instalado, abre una terminal dentro de la carpeta y ejecuta `python -m http.server 8000`. Después abre <http://localhost:8000>.

## Notas para el profesorado

- **Dónde se guardan los proyectos:** en el almacenamiento del navegador de cada ordenador y usuario. Si en el centro se borran los perfiles al cerrar sesión, pide al alumnado que pulse **«Guardar archivo»** al acabar cada sesión y que guarde el `.vproj` en su nube o pendrive. Desde la pantalla de inicio lo abren con **«Abrir archivo de proyecto»**.
- **Conexión a internet:** casi todo funciona sin conexión. Solo necesitan internet la búsqueda en Wikimedia Commons (`commons.wikimedia.org` y `upload.wikimedia.org`), la primera descarga de cada voz natural (`huggingface.co`), los subtítulos automáticos y las fuentes de Google. Si la red del centro filtra webs, pide que permitan esos dominios.
- **Contenido de la biblioteca:** Wikimedia Commons es una enciclopedia multimedia abierta. El editor filtra palabras inapropiadas y descarta resultados sospechosos, pero ningún filtro es perfecto: conviene recordárselo al alumnado. Todo el material es libre (dominio público o Creative Commons); las licencias CC BY y CC BY-SA exigen citar al autor, y el botón «Añadir créditos al final del vídeo» lo hace automáticamente.
- **Privacidad:** los vídeos no salen del ordenador. La única excepción son los **subtítulos automáticos** (desde un clip o dictados): Chrome envía ese audio al servicio de voz de Google para transcribirlo, solo mientras se usa esa función y con conexión a internet. Si el navegador tiene el reconocimiento instalado en el propio equipo, el editor lo usa y el audio no sale del ordenador.
- **Formatos recomendados:** MP4 (H.264), MP3/WAV/M4A, JPG/PNG. Los vídeos de móvil (incluidos los verticales) funcionan. Algunos `.mov` de iPhone en HEVC pueden no abrirse en ordenadores sin soporte de HEVC: en ese caso, que graben en «Más compatible» (Ajustes → Cámara → Formatos).
- **Velocidad de exportación:** los MP4 normales (de móvil o cámara) se decodifican y codifican con aceleración por hardware, así que la exportación suele ir más rápida que el propio vídeo. Las grabaciones hechas dentro del editor y algunos formatos raros usan un método más lento. El MP4 se guarda en la carpeta Descargas.
- **Música:** recuérdales que usen música libre de derechos (por ejemplo, la biblioteca de audio de YouTube) si van a publicar los vídeos.

## Cómo usar el croma (fondo verde)

1. Pon el fondo nuevo (una foto o un vídeo) en la pista de abajo.
2. Pon el vídeo grabado delante de la tela verde en una pista **por encima**, a la misma altura de tiempo.
3. Selecciónalo y, en el panel derecho, abre la pestaña **Croma** y activa **«Quitar color de fondo»**. El color se detecta solo (también puedes usar «Detectar», el cuentagotas o los botones Verde y Azul).
4. Ajusta la **Tolerancia**: súbela si quedan restos verdes y bájala si se borra parte de la persona. Usa «Suavizado de bordes» para que el contorno no se vea recortado y «Quitar reflejo verde» si la piel o el pelo tienen un tono verdoso.

Para grabar: tela lisa sin arrugas, bien iluminada y sin sombras, la persona separada un metro del fondo y nada de ropa verde.

## Estructura

```
index.html        Página principal
css/styles.css    Estilos
js/               Código del editor (módulos ES, sin compilación)
lib/              Bibliotecas incluidas (funcionan sin conexión):
  mp4-muxer.mjs     MP4 (MIT)
  mp4box/           lectura de MP4 (BSD-3)
  mediapipe/        quitar fondo con IA, MediaPipe Selfie Segmentation (Apache-2.0)
  espeak/           voces básicas, eSpeak NG (GPL-3.0, código fuente en github.com/espeak-ng/espeak-ng)
  piper/            voces naturales: fonemas de Piper (MIT) y ONNX Runtime Web (MIT)
```

Iconos: Lucide (ISC). Fuentes: Google Fonts (OFL). Las voces naturales son modelos de la comunidad Piper; cada una tiene su propia licencia, adecuada para uso educativo.

El tamaño total es de unos 60 MB. Ningún archivo pasa de 25 MB, así que también se puede subir desde la web de GitHub.
