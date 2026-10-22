# Justo horarios bot

## Reglas vigentes

Zona America/Lima, lunes a sabado:
- 07:00: marcar los 63 productos de referencia de manana; desmarcar los demas.
- 17:00: marcar todos excepto Fanta.
- Fin de manana 11:30 y fin de tarde 23:30: no cambiar productos.
- Fuera de turno y domingo: conservar estado.

Se opera sobre la primera casilla (Justo). El usuario confirma que Todos se sincroniza automaticamente. El inventario validado contiene 93 filas, incluidos adicionales.

El aviso Control operativo se pospone automaticamente pulsando Omitir por 5 minutos al entrar y si reaparece durante las acciones. Se espera su cierre y se continua con Disponibilidad; tambien se controla al recargar para verificar los cambios. Si el aviso redirige a una pantalla completa, se vuelve a abrir la URL de productos despues de omitirlo. Cada omision se registra en el log.

## Ejecucion automatica instalada

PM2 administra el proceso justo-bot con ecosystem.config.cjs. La lista se guardo con pm2 save. La tarea exclusiva JustoHorariosBot fue eliminada. Se reutiliza el inicio automatico de PM2 existente en Windows (entrada PM2 del registro de inicio del usuario con pm2-windows-startup y pm2 resurrect). Despues de reiniciar hay que iniciar sesion en Windows. No requiere consola abierta. PM2 reinicia el scheduler si falla.

Cron derivados de config.json:
- `0 7 * * 1,2,3,4,5,6`
- `0 17 * * 1,2,3,4,5,6`

La recuperacion corre al iniciar y cada 5 minutos. Solo aplica el turno actual si no consta como completado ese dia. No repite turnos exitosos ni aplica turnos vencidos. Cada cambio se verifica tras recargar. Un fallo puede dejar cambios parciales: se reintenta dentro del turno. Fuera de turno no se corrigen estados.

El equipo debe estar encendido, con conexion y sin suspension para ejecutar a la hora. Si vuelve durante un turno pendiente, recupera ese turno; si vuelve fuera de turno, conserva el estado.

## Archivos persistentes

- config.json: productos, dias y horarios.
- .env: URL exacta de Disponibilidad y modo de navegador para operaciones manuales.
- session.json: cookies, localStorage e IndexedDB (al guardar nuevas sesiones). Se carga en cada ejecucion y actualiza tras verificar cambios. No garantiza que Justo mantenga la sesion indefinidamente.
- reports/scheduler-state.json: ultimo turno completado y resultado del intento.
- reports/status.json: resultado de la ultima operacion.
- reports/pm2-out-*.log y reports/pm2-error-*.log: salida y errores del proceso PM2.
- reports/scheduler.lock: evita dos schedulers simultaneos.

No subir .env, session.json ni reports a Git. El navegador automatico funciona headless aunque HEADLESS=false para las pruebas manuales.

## Operacion

```powershell
npm run service:status
npm run service:logs
Get-Content reports/scheduler-state.json
```

Detener y reiniciar tras editar configuracion:

```powershell
pm2 restart justo-bot --update-env
pm2 save
```

Si vence la sesion, ejecutar `pm2 stop justo-bot`, luego `npm run login`, entrar a Suspender productos, pulsar ENTER en la consola y ejecutar `pm2 restart justo-bot --update-env` y `pm2 save`. La ruta debe coincidir con JUSTO_PORTAL_URL en .env. No ejecutar login a la vez que un cambio automatico.

## Pruebas manuales

```powershell
npm test
npm run inventory
npm run plan
npm run apply
```

inventory es de solo lectura: espera que entres a Suspender productos y pulses ENTER. Si falla, guarda reports/inventory-debug.json e inventory-error.png y conserva el navegador hasta confirmar. plan simula el turno actual sin modificar productos. apply ejecuta el turno actual; fuera de turno no hace cambios.

Para registrar o actualizar el proceso en PM2: `npm run service:install`. Para ejecutar cron manualmente: `npm start`; no hacerlo mientras PM2 este ejecutando justo-bot. El instalador utiliza el inicio de PM2 ya existente en esta laptop; en otro equipo hay que configurar tambien su restauracion al iniciar Windows.
