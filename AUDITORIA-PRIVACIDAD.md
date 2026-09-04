# Revisión técnica de privacidad y seguridad

Fecha de revisión: 4 de septiembre de 2026.

Este documento describe la arquitectura observada en esta versión del código.
No constituye una certificación de la AEPD, de la Comunidad de Madrid ni una
garantía de riesgo cero.

## Resultado técnico

- Aplicación estática, sin servidor propio, cuentas de usuario, analítica,
  publicidad ni base de datos remota.
- No se han encontrado llamadas destinadas a enviar el contenido de los
  registros por `fetch`, XMLHttpRequest, WebSocket o balizas de analítica.
- Los registros y documentos se almacenan en IndexedDB; las preferencias y el
  hash del PIN se almacenan en localStorage.
- Las únicas solicitudes de red del código revisado descargan desde el mismo
  origen los archivos estáticos necesarios para ejecutar y actualizar la PWA.
- Las exportaciones se crean en el navegador y solo salen del dispositivo por
  una acción deliberada de guardar o compartir.
- No se cargan librerías, fuentes, imágenes ni scripts de terceros.
- Se ha añadido una política de seguridad de contenidos y una política de no
  envío de referencia para reducir la superficie de exposición web.

## Datos que no abandonan automáticamente el dispositivo

El contenido de registros, códigos pseudónimos, documentos locales, preferencias
y PIN no se envía automáticamente por el código revisado. No obstante, no puede
afirmarse que “todo metadato” permanezca local: GitHub Pages registra la IP de
las visitas y puede tratar fecha, hora, páginas solicitadas y otros datos
técnicos conforme a su política. Esos datos técnicos no incluyen el contenido
de los registros.

La arquitectura minimiza identificadores directos y facilita la
seudonimización, pero no garantiza anonimización. La posible identificación debe
valorarse considerando también el contexto, los textos libres y la información
adicional disponible para la persona usuaria o el centro.

## Riesgos residuales

- IndexedDB no está cifrada por la aplicación. El PIN solo protege la interfaz.
- Alguien con acceso al dispositivo, al perfil del navegador o a sus herramientas
  de desarrollo podría acceder al almacenamiento.
- Una copia de seguridad o sincronización del sistema operativo o navegador
  podría incluir datos locales según la configuración del dispositivo.
- Los archivos exportados no están cifrados.
- Los códigos pseudónimos siguen siendo datos personales si pueden vincularse a
  una persona mediante información adicional.
- El texto libre puede introducir accidentalmente datos identificativos o datos
  especialmente protegidos.
- Como toda PWA, una versión futura servida legítimamente desde el mismo origen
  podría técnicamente acceder al almacenamiento de ese origen. Debe protegerse
  la cuenta que publica el sitio y revisarse cada actualización.
- No se ha realizado una auditoría independiente, prueba de penetración ni
  certificación conforme al Esquema Nacional de Seguridad.

## Condición de uso educativo en Madrid

La Delegación de Protección de Datos de la Consejería de Educación indica que
los centros públicos deben emplear herramientas corporativas y que no se
autorizarán aplicaciones externas para valoración de conductas, procedimientos
disciplinarios, pruebas psicopedagógicas u otros trámites confidenciales
corporativos. Por ello, esta aplicación no puede presentarse como homologada ni
como automáticamente autorizada para registrar datos reales del alumnado en
centros públicos madrileños.

Fuente oficial:
https://dpd.educa2.madrid.org/inicio/-/visor/03-03-2022-%C2%BFque-aplicaciones-y-plataformas-pueden-usar-los-centros-educativos-publicos-

## Propiedad intelectual

El repositorio revisado es autocontenido: HTML, CSS, JavaScript, manifiesto,
service worker y un icono SVG simple. No se han detectado dependencias,
bibliotecas, imágenes, tipografías o recursos externos que impongan licencias
adicionales. Esta comprobación técnica no puede garantizar que nunca exista una
reclamación ni sustituye una revisión jurídica de procedencia del código.

Creative Commons desaconseja aplicar sus licencias a software. Se mantiene la
CC BY-NC-SA 4.0 por coherencia con la elección expresada en la propia aplicación,
pero antes de una distribución institucional amplia conviene valorar una
licencia específica de software o una licencia propia revisada jurídicamente.
