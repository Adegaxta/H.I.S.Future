# Distribution V0: updater Windows

La versión `0.1.1` es la primera versión de H.I.S. Future capaz de actualizarse. La instalación `0.1.0` existente no puede buscar actualizaciones, por lo que el salto inicial se hace ejecutando manualmente el instalador NSIS de `0.1.1` sobre la instalación actual. Se conserva `com.terce.hisfuture`, así que no debe crearse una instalación paralela ni hace falta desinstalar primero.

## Firma y build

La clave pública está incorporada en `src-tauri/tauri.conf.json`. La clave privada local está fuera del repositorio, en `$env:USERPROFILE\.tauri\hisfuture-updater.key`, y no debe copiarse al proyecto, compartirse ni imprimirse. Está protegida con una contraseña aleatoria. La contraseña se conserva cifrada para el usuario actual de Windows mediante DPAPI en `$env:USERPROFILE\.tauri\hisfuture-updater-password.clixml`; tampoco debe compartirse ni versionarse.

En PowerShell, cada build firmado se genera así:

```powershell
$signingKeyPath = Join-Path $env:USERPROFILE '.tauri\hisfuture-updater.key'
$signingPasswordPath = Join-Path $env:USERPROFILE '.tauri\hisfuture-updater-password.clixml'
$env:TAURI_SIGNING_PRIVATE_KEY = $signingKeyPath
$secureSigningPassword = Import-Clixml -LiteralPath $signingPasswordPath
$signingPasswordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSigningPassword)
try {
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($signingPasswordPtr)
  npm run tauri build
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($signingPasswordPtr)
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}
```

En CI, ambas variables deben proceder de secretos del proveedor. No se deben guardar en `.env`: `TAURI_SIGNING_PRIVATE_KEY` contiene la clave o una ruta disponible en el runner y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` contiene la contraseña.

Los artefactos Windows quedan en `src-tauri/target/release/bundle/nsis/`. Con `bundle.createUpdaterArtifacts = true`, Tauri v2 produce el instalador `.exe` y su `.exe.sig`. El updater consulta `https://github.com/Adegaxta/H.I.S.Future/releases/latest/download/latest.json` y usa instalación Windows `passive`.

## Crear `latest.json`

El manifiesto estático de Tauri v2 requiere `version`, y para `platforms.windows-x86_64`, `url` y el contenido real de `signature`. `notes` y `pub_date` RFC 3339 son opcionales y el generador los incluye. No se mantiene un manifiesto con firma ficticia en Git.

Después de compilar la versión que se publicará, por ejemplo `0.1.2`, se genera al lado del instalador:

```powershell
.\scripts\generate-latest.ps1 `
  -Version 0.1.2 `
  -ArtifactPath '.\src-tauri\target\release\bundle\nsis\hisfuture_0.1.2_x64-setup.exe' `
  -Tag v0.1.2 `
  -Notes 'Primera actualización de prueba mediante H.I.S. Future.'
```

El script lee la firma real de `hisfuture_0.1.2_x64-setup.exe.sig` y crea `src-tauri/target/release/bundle/nsis/latest.json` con este formato:

```json
{
  "version": "0.1.2",
  "notes": "Primera actualización de prueba mediante H.I.S. Future.",
  "pub_date": "<fecha UTC RFC 3339 generada>",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contenido real del archivo .sig>",
      "url": "https://github.com/Adegaxta/H.I.S.Future/releases/download/v0.1.2/hisfuture_0.1.2_x64-setup.exe"
    }
  }
}
```

## Release manual en GitHub

1. Cambiar la versión de `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json` al mismo SemVer.
2. Definir `TAURI_SIGNING_PRIVATE_KEY` y, si corresponde, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. Ejecutar `npm run tauri build`.
4. Confirmar que existen el `setup.exe` y su `.sig` en la carpeta NSIS.
5. Ejecutar `scripts/generate-latest.ps1` con la versión, el artefacto y el tag exactos.
6. Crear manualmente el GitHub Release con ese tag, por ejemplo `v0.1.2`.
7. Adjuntar el `setup.exe`, el `.sig` como evidencia útil y `latest.json`.
8. Publicar únicamente después de revisión humana.
9. Abrir `https://github.com/Adegaxta/H.I.S.Future/releases/latest/download/latest.json` y comprobar HTTP 200, JSON válido, URL descargable y firma idéntica al `.sig`.

## Prueba de actualización

Para `0.1.0 → 0.1.1`, cerrar H.I.S. Future, ejecutar `hisfuture_0.1.1_x64-setup.exe` y abrir la app. No desinstalar `0.1.0`. Confirmar que H.I.S. Future abre y que un `.his` externo existente sigue abriendo en la misma instalación.

Para `0.1.1 → 0.1.2`:

1. Instalar `0.1.1` manualmente sobre `0.1.0`.
2. Crear un `.his` de prueba fuera de la carpeta de instalación y guardar su hash SHA-256.
3. Cerrarlo, volver a abrirlo y confirmar su integridad.
4. Preparar y firmar la build `0.1.2`.
5. Crear el Release y su `latest.json` siguiendo el proceso anterior, con autorización humana.
6. Abrir `0.1.1` sin ningún proyecto abierto.
7. Esperar “Nueva versión disponible: 0.1.2”.
8. Pulsar **Actualizar**; **Más tarde** debe cerrar el aviso sin instalar.
9. Dejar terminar el instalador `passive` y abrir `0.1.2`.
10. Abrir el `.his` de prueba y comparar otra vez su hash SHA-256.

Si GitHub no responde, el aviso puede reintentarse o cerrarse y la app continúa funcionando. Si la descarga, firma o instalación falla, cerrar el aviso, conservar la versión instalada y ejecutar manualmente el instalador firmado de la release. Si fuera necesario volver a la versión anterior, ejecutar su instalador manual conservado; no borrar los proyectos.

El updater y el instalador gestionan únicamente los binarios y la asociación de archivo de H.I.S. Future. Nunca deben buscar, modificar, migrar ni eliminar archivos `.his` externos del usuario durante instalación, actualización o desinstalación.
