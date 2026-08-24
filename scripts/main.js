/**
 * Punto de entrada. Solo arranca la aplicación y registra un último recurso
 * para los errores no capturados: el usuario nunca debe quedarse mirando una
 * pantalla de carga que no avanza sin saber por qué.
 *
 * @module main
 */

import { start } from './ui/app.js';
import { failLoader } from './ui/loader.js';

window.addEventListener('unhandledrejection', (event) => {
  console.error('[main] promesa rechazada sin capturar', event.reason);
});

start().catch((error) => {
  console.error('[main] fallo irrecuperable al iniciar', error);
  failLoader('Ocurrió un error inesperado al iniciar el catálogo. Recarga la página.');
});
