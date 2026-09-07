# Automatización de releases

H.I.S. Future publica únicamente cuando GitHub recibe un tag con formato exacto `vX.Y.Z`. Un push normal de una rama no ejecuta el workflow de release. Las notas se generan, editan y aprueban localmente antes del tag. El job se ejecuta en Windows x64, valida el proyecto y esas notas, compara las fuentes de versión, compila el instalador NSIS firmado, genera y valida `latest.json`, sube los tres activos a un borrador y lo hace público solo después de verificarlo.

## Configuración única en GitHub

En **Settings > Secrets and variables > Actions**, crear estos dos repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: contenido completo de la clave privada de Tauri, no su ruta local.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: contraseña de esa clave.

La clave no necesita una conversión criptográfica ni Base64 adicional. Tauri acepta en la variable el contenido UTF-8 completo del archivo de clave. Desde PowerShell y con GitHub CLI autenticado se puede cargar por entrada estándar, sin poner el valor en la línea de comandos:

```powershell
$signingKeyPath = Join-Path $env:USERPROFILE '.tauri\hisfuture-updater.key'
Get-Content -LiteralPath $signingKeyPath -Raw |
  gh secret set TAURI_SIGNING_PRIVATE_KEY --repo Adegaxta/H.I.S.Future
```

La contraseña local actual está protegida con DPAPI. Se puede transferir directamente al secret sin imprimirla:

```powershell
$passwordPath = Join-Path $env:USERPROFILE '.tauri\hisfuture-updater-password.clixml'
$securePassword = Import-Clixml -LiteralPath $passwordPath
$credential = [pscredential]::new('tauri', $securePassword)
$credential.GetNetworkCredential().Password |
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo Adegaxta/H.I.S.Future
$credential = $null
$securePassword = $null
```

Comprobar solo los nombres, nunca los valores:

```powershell
gh secret list --repo Adegaxta/H.I.S.Future
```

El workflow usa el `GITHUB_TOKEN` integrado con permiso `contents: write`; no necesita un PAT. La clave privada y su contraseña solo se exponen como variables de entorno en los pasos que comprueban su presencia y construyen Tauri. No se guardan en archivos del repositorio ni se imprimen.

## Publicar una versión

Partir de la rama que debe recibir el commit de versión y de un árbol de trabajo limpio. El script acepta cualquier incremento `X.Y.Z`, incluidos saltos de versión, pero rechaza una versión igual o inferior a la actual.

```powershell
.\scripts\release.ps1 0.1.3
```

El script:

1. comprueba que npm, Cargo, sus lockfiles y Tauri tienen la misma versión actual;
2. actualiza los tags locales desde `origin` y, si todavía no existe, genera `.release-notes/X.Y.Z.md` con los asuntos de commits reales desde el último tag semántico alcanzable hasta `HEAD`;
3. separa el borrador en Features, Improvements, Fixes, Documentation, Maintenance y Changes, incluyendo únicamente las categorías que tengan contenido;
4. abre el archivo en Visual Studio Code con espera o, si no está disponible, en Notepad, para editarlo sin pasar Markdown como argumento;
5. exige que el primer renglón con contenido sea `## H.I.S. X.Y.Z`, que exista contenido adicional y que el archivo sea UTF-8 sin BOM;
6. actualiza `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` y `src-tauri/tauri.conf.json`;
7. ejecuta el build web, las pruebas Nodal, `cargo check --locked`, `cargo fmt --check` y controles de Git;
8. muestra nuevamente versión actual, versión objetivo y el contenido completo y exacto de las notas;
9. pide exactamente `This will trigger a public H.I.S. release. Continue? [y/N]`;
10. solo ante una `y` minúscula incluye las notas en el commit `chore: release vX.Y.Z`, crea el tag anotado y envía ambos de forma atómica a `origin`.

Si el archivo ya existe —por ejemplo, tras cancelar un intento— el script conserva su contenido y lo vuelve a abrir en lugar de regenerarlo. Para revisar sin abrir automáticamente un editor se puede usar `-SkipEditor`; la confirmación y la impresión completa de las notas siguen siendo obligatorias:

```powershell
.\scripts\release.ps1 0.1.3 -SkipEditor
```

El push atómico evita que solo una de las dos referencias llegue al remoto. El push de rama no dispara releases; el evento que las dispara es únicamente el tag. En GitHub, revisar el job en **Actions > Release**. Si todo pasa, aparecerá una release titulada `H.I.S. X.Y.Z` con:

- `hisfuture_X.Y.Z_x64-setup.exe`;
- `hisfuture_X.Y.Z_x64-setup.exe.sig`;
- `latest.json`.

GitHub Actions lee `.release-notes/X.Y.Z.md` desde el commit del tag y lo pasa directamente con `--notes-file`. No genera, resume ni complementa el texto. Antes de publicar también compara el body guardado por GitHub con el archivo local y falla si no son idénticos. El mismo contenido aprobado se incluye en `latest.json`.

## Abortar

Antes de confirmar, responder Enter, `n` o cualquier texto distinto de `y`. No se crea commit, tag ni push. El script restaura automáticamente los cinco archivos de versión a su estado anterior y conserva únicamente `.release-notes/X.Y.Z.md`, con las ediciones realizadas, para continuar más tarde.

Una nueva ejecución para la misma versión acepta ese archivo como el único cambio pendiente, lo abre de nuevo y repite todas las validaciones:

```powershell
.\scripts\release.ps1 0.1.3
```

Si también se desea descartar el borrador nuevo, eliminar manualmente solo `.release-notes/X.Y.Z.md`. Si era un archivo ya versionado que se editó, usar `git restore -- .release-notes/X.Y.Z.md` únicamente después de decidir que esas ediciones no deben conservarse.

Después de confirmar, el commit y el tag se crean localmente y se envían juntos. Si el push falla, no llega ninguna de las dos referencias a GitHub; corregir la causa y reintentar el push atómico mostrado por el error. Si el tag ya llegó a GitHub, el workflow ya está activado: para detenerlo antes de publicar, cancelar inmediatamente el job desde **Actions**. Si el fallo ocurrió durante la carga, puede quedar un borrador privado que debe revisarse o eliminarse manualmente; nunca se convierte en release pública salvo que la verificación final pase.

## Diagnosticar fallos

Abrir **Actions > Release**, seleccionar la ejecución del tag y localizar el primer paso rojo:

- **Validate tag**: el tag no era exactamente `vX.Y.Z`.
- **Validate approved release notes**: falta `.release-notes/X.Y.Z.md`, está vacío, no es UTF-8 sin BOM, su encabezado no coincide con el tag o no tiene cuerpo.
- **Install / Build frontend / Nodal / Rust / formatting**: reproducir localmente los mismos comandos que ejecuta `release.ps1` y corregir el código antes de preparar un tag nuevo.
- **Verify all source versions**: una de las tres fuentes o un lockfile no coincide con la versión sin `v`.
- **Verify signing secrets**: falta uno de los dos secrets o la contraseña está vacía. No intentar mostrar su valor en logs; volver a cargarlo.
- **Build signed Tauri installer**: revisar primero que la clave y contraseña correspondan a la public key configurada y que el archivo secreto se haya copiado completo.
- **Locate artifacts**: Tauri no produjo el nombre NSIS esperado para esa versión y arquitectura.
- **Generate / Validate latest.json**: revisar versión, nombre del repositorio/tag, URL, UTF-8 sin BOM, firma y que sus notas sean idénticas al archivo aprobado.
- **Create / Verify draft release**: comprobar `contents: write`, límites de GitHub, que no exista ya una release para ese tag y que GitHub haya conservado exactamente el body aprobado.
- **Publish release**: el borrador validado permanece privado; se puede inspeccionar en GitHub y reintentar o eliminar manualmente.

No reutilizar ni mover un tag que ya activó un intento de release. Corregir el problema, aumentar la versión y publicar un tag nuevo mantiene una trazabilidad inequívoca.

Los directorios `target/`, `dist/` y los artefactos generados están ignorados por Git y nunca deben añadirse al commit de release.
