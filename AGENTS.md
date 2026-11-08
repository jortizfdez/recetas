# Instrucciones del proyecto

## Seguridad del repositorio público

Este repositorio es público. Es obligatorio, sin excepciones, impedir que se incorporen o publiquen secretos o información sensible: archivos de entorno con valores reales, contraseñas, claves API, tokens, credenciales, claves privadas y otros datos que no deban ser públicos.

Antes de añadir archivos o crear un commit, revisar los archivos y el diff, incluidos los recursos generados y los cambios previos, para detectar información sensible. No confiar solo en `.gitignore`: Git puede seguir archivos ya versionados o añadidos de forma forzada. Usar variables de entorno o mecanismos de gestión de secretos fuera del repositorio; los ejemplos, si se necesitan, deben contener únicamente valores ficticios.

Si se detecta un secreto expuesto, no reproducir su valor en informes ni mensajes. Retirarlo del contenido actual y avisar de que es necesario revocarlo o rotarlo. Comprobar también el historial y las referencias publicadas: eliminarlo de la versión actual no lo borra del historial. No reescribir el historial ni hacer push sin autorización explícita.
