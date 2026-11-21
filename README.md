Lee `.agents/runner.json` y arma el comando para correr cada herramienta con Bun o Node

Una librería sin dependencias para las herramientas de `@ramon-sg` que se corren con `bunx --bun` o `npx --yes`: guarda en el repo qué runner usar y qué versión de cada herramienta, y construye el comando exacto.

## El archivo

`.agents/runner.json` en la raíz del repo:

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@ramon-sg/runner@1.0.0/runner.schema.json",
  "runner": "bun",
  "tools": {
    "@ramon-sg/issue-flow": "0.6.0",
    "@ramon-sg/github-rest": "0.7.0",
    "@ramon-sg/skills-manager": "1.5.0",
    "agent-cloud-kit": "1.0.0",
    "@ramon-sg/claude-repo-guard": "0.8.0"
  }
}
```

## La API

- `RUNNER_FILE`: la ruta del archivo, `.agents/runner.json`.
- `Runner`: el tipo `"bun" | "node"`.
- `RunnerConfig`: la forma del archivo (`runner` y `tools`).
- `RunnerFileError`: el error cuando el archivo no se puede leer o no es válido.
- `readRunnerConfig(root)`: lee el archivo del repo; devuelve `undefined` si no existe.
- `writeRunnerConfig(root, config)`: escribe el archivo con formato estable.
- `effectiveRunner(config)`: el runner que se usa, con el valor por defecto si falta.
- `runnerAvailable(runner)`: si ese runner está instalado en la máquina.
- `chooseRunner({ ask })`: elige el runner, preguntando con `ask` cuando hay más de una opción.
- `setTool(config, pkg, version, { ifMissing, allowLower })`: fija la versión de una herramienta, sin bajarla salvo que se pida.
- `toolCommand(runner, pkg, version, args)`: el comando como lista de argumentos.
- `toolCommandText(runner, pkg, version, args)`: el mismo comando como texto para mostrar o poner en un script.
- `writeScripts(root, runner, scripts, owned)`: escribe los scripts de `package.json` que le pertenecen a la herramienta.
- `checkRunner(root)`: revisa que el runner del archivo esté disponible.
- `checkToolPins(root, pkg, texts)`: revisa que los textos del repo usen la versión fijada.
- `Check`: el resultado de una revisión.
- `VERSION`: la versión de esta librería.

## Compatibilidad

El formato del archivo es estable en la 1.x: solo se agregan campos, y todos los campos nuevos son opcionales. Un archivo válido hoy lo seguirá siendo. Los campos desconocidos se conservan al escribir.

## Desarrollo

```sh
npm install
npm test
```

`npm test` compila con `tsc` y corre los tests con `node --test`.

Bun corre los mismos tests de `node:test` sin cambios (probado con Bun 1.4.4, fijado en `.tool-versions`), así que no hace falta un smoke test aparte. Con `dist/` ya compilado:

```sh
npx tsc && bun test test/
```

CI corre los dos: el job `node` con `npm test` y el job `bun` con ese comando (`.github/workflows/test.yml`).

## Publicar una versión

Una versión es una release `vX.Y.Z` en GitHub, con el mismo número que `package.json`. Al publicarla, GitHub Actions corre los tests y publica en npm con procedencia (`.github/workflows/publish.yml`).

La primera versión va a mano, porque npm solo deja configurar la publicación desde GitHub en un paquete que ya existe:

1. `npm login` y, desde `main`, `npm publish --provenance=false`.
2. En npmjs.com, en el paquete, Settings → Trusted publishing: GitHub Actions, repo `ramon-sg/runner`, workflow `publish.yml`.
3. Pushear la tag de esa versión sin crear una release: una release volvería a publicar la misma versión y fallaría.

## Licencia

MIT
