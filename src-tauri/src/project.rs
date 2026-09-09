use crate::persistence::{
    is_persisted_node_type, nodes_table_sql, project_resource_definition, resource_id_from_content,
    schema_matches_registry, validate_project_resource, CURRENT_NODAL_SCHEMA_VERSION, LINKS_SCHEMA,
    NODAL_SCHEMA_VERSION_KEY, PROJECT_META_SCHEMA,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const PROJECT_ICON: &[u8] = include_bytes!("../icons/his-file.ico");
const PROJECT_ICON_NAME: &str = "his-file.ico";

pub const MANIFEST_FILE: &str = "hisfuture.project.json";
pub const DATABASE_FILE: &str = "lore.sqlite";
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub folder_path: String,
    pub database_path: String,
    pub last_edited: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProjectManifest {
    format: String,
    version: u32,
    name: String,
    created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeRecord {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub parent_id: Option<String>,
    pub order: i64,
    pub content: String,
}

pub struct OpenProject {
    pub info: ProjectInfo,
    pub db: Connection,
    archive_path: Option<PathBuf>,
    working_folder: PathBuf,
    archive_dirty: bool,
}

pub type ProjectState = Mutex<Option<OpenProject>>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkspaceTimings {
    pub resource_scan_ms: f64,
    pub sqlite_ms: f64,
    pub resource_cleanup_ms: f64,
    pub total_ms: f64,
    pub changed_rows: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseProjectTimings {
    pub sqlite_checkpoint_ms: f64,
    pub archive_packaging_ms: f64,
    pub working_directory_cleanup_ms: f64,
    pub total_ms: f64,
    pub packaged: bool,
}

fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    secs.to_string()
}

pub fn sanitize_folder_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("El nombre del proyecto no puede estar vacío.".into());
    }
    let cleaned: String = trimmed
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim_matches([' ', '.']).to_string();
    if cleaned.is_empty() {
        return Err("El nombre del proyecto no es válido para una carpeta.".into());
    }
    Ok(cleaned)
}

fn manifest_path(folder: &Path) -> PathBuf {
    folder.join(MANIFEST_FILE)
}

fn database_path(folder: &Path) -> PathBuf {
    folder.join(DATABASE_FILE)
}

fn write_manifest(folder: &Path, name: &str) -> Result<(), String> {
    let manifest = ProjectManifest {
        format: "hisfuture-project".into(),
        version: 1,
        name: name.to_string(),
        created_at: now_iso(),
    };
    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|err| format!("No se pudo serializar el manifiesto: {err}"))?;
    fs::write(manifest_path(folder), json)
        .map_err(|err| format!("No se pudo escribir el manifiesto: {err}"))
}

fn read_manifest_name(folder: &Path) -> Option<String> {
    let raw = fs::read_to_string(manifest_path(folder)).ok()?;
    serde_json::from_str::<ProjectManifest>(&raw)
        .ok()
        .map(|manifest| manifest.name)
}

fn repair_links_foreign_key(db: &mut Connection) -> Result<(), String> {
    let links_schema: Option<String> = db
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'links'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| format!("No se pudo comprobar el esquema de enlaces: {err}"))?;
    if !links_schema
        .as_deref()
        .is_some_and(|schema| schema.to_ascii_lowercase().contains("nodes_legacy"))
    {
        return Ok(());
    }

    db.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|err| format!("No se pudo preparar la reparación de enlaces: {err}"))?;
    let result = (|| {
        let tx = db
            .transaction()
            .map_err(|err| format!("No se pudo iniciar la reparación de enlaces: {err}"))?;
        tx.execute_batch(
            "CREATE TABLE links_repaired (
               from_node_id TEXT NOT NULL,
               to_node_id TEXT NOT NULL,
               PRIMARY KEY (from_node_id, to_node_id),
               FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
               FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
             );
             INSERT INTO links_repaired (from_node_id, to_node_id)
               SELECT from_node_id, to_node_id FROM links;
             DROP TABLE links;
             ALTER TABLE links_repaired RENAME TO links;",
        )
        .map_err(|err| format!("No se pudo reconstruir el esquema de enlaces: {err}"))?;
        tx.commit()
            .map_err(|err| format!("No se pudo confirmar la reparación de enlaces: {err}"))
    })();
    db.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|err| format!("No se pudo reactivar la integridad de enlaces: {err}"))?;
    result
}

fn init_database(path: &Path) -> Result<(Connection, bool), String> {
    let mut db = Connection::open(path).map_err(|err| format!("No se pudo abrir SQLite: {err}"))?;
    let changes_before = db.total_changes();
    let has_meta: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'project_meta')",
            [],
            |row| row.get(0),
        )
        .map_err(|err| format!("No se pudo comprobar la versión: {err}"))?;
    if has_meta {
        let version: Option<String> = db
            .query_row(
                "SELECT value FROM project_meta WHERE key = ?1",
                [NODAL_SCHEMA_VERSION_KEY],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| format!("No se pudo leer la versión Nodal: {err}"))?;
        if version
            .as_deref()
            .is_some_and(|version| version != CURRENT_NODAL_SCHEMA_VERSION)
        {
            return Err(
                "La versión Nodal del proyecto no es compatible; no se modificó su esquema.".into(),
            );
        }
    }
    db.execute_batch(PROJECT_META_SCHEMA)
        .map_err(|err| format!("No se pudo inicializar la metadata: {err}"))?;
    db.execute_batch(&nodes_table_sql("nodes", true))
        .map_err(|err| format!("No se pudo inicializar el registro de nodos: {err}"))?;
    db.execute_batch(LINKS_SCHEMA)
        .map_err(|err| format!("No se pudo inicializar el esquema de enlaces: {err}"))?;
    let schema: String = db
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'nodes'",
            [],
            |row| row.get(0),
        )
        .map_err(|err| format!("No se pudo comprobar el esquema de nodos: {err}"))?;
    if !schema_matches_registry(&schema) {
        let migration = format!(
            "PRAGMA foreign_keys = OFF;
             BEGIN;
             {}
             INSERT INTO nodes_new (id, name, type, parent_id, sort_order, content)
                 SELECT id, name, type, parent_id, sort_order, content FROM nodes;
             DROP TABLE nodes;
             ALTER TABLE nodes_new RENAME TO nodes;
             COMMIT;
             PRAGMA foreign_keys = ON;",
            nodes_table_sql("nodes_new", false)
        );
        db.execute_batch(&migration)
            .map_err(|err| format!("No se pudo actualizar el esquema de nodos: {err}"))?;
    }
    repair_links_foreign_key(&mut db)?;
    let broken: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_foreign_key_check)",
            [],
            |row| row.get(0),
        )
        .map_err(|err| format!("No se pudo comprobar la integridad: {err}"))?;
    if broken {
        return Err(
            "El proyecto contiene referencias SQLite inválidas; no se puede abrir para editar."
                .into(),
        );
    }
    db.execute(
        "INSERT INTO project_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value
         WHERE project_meta.value IS NOT excluded.value",
        [NODAL_SCHEMA_VERSION_KEY, CURRENT_NODAL_SCHEMA_VERSION],
    )
    .map_err(|err| format!("No se pudo registrar la versión Nodal: {err}"))?;
    let changed = db.total_changes() > changes_before;
    Ok((db, changed))
}

fn project_info(name: String, folder: &Path) -> ProjectInfo {
    let last_edited = fs::metadata(database_path(folder))
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    ProjectInfo {
        name,
        folder_path: folder.to_string_lossy().into_owned(),
        database_path: database_path(folder).to_string_lossy().into_owned(),
        last_edited,
    }
}

fn archive_project_info(name: String, archive_path: &Path, working_folder: &Path) -> ProjectInfo {
    let mut info = project_info(name, working_folder);
    info.folder_path = archive_path.to_string_lossy().into_owned();
    info.database_path = archive_path.to_string_lossy().into_owned();
    info
}

fn temporary_project_folder() -> Result<PathBuf, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT_FOLDER: AtomicU64 = AtomicU64::new(0);
    loop {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let sequence = NEXT_FOLDER.fetch_add(1, Ordering::Relaxed);
        let folder = std::env::temp_dir().join(format!(
            "hisfuture-project-{}-{suffix}-{sequence}",
            std::process::id()
        ));
        // Never reuse an existing extraction directory, even across processes.
        match fs::create_dir(&folder) {
            Ok(()) => return Ok(folder),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "No se pudo crear el espacio temporal del proyecto: {error}"
                ))
            }
        }
    }
}

fn zip_directory(folder: &Path, archive_path: &Path) -> Result<(), String> {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = archive_path.with_extension(format!("his-{suffix}.tmp"));
    let result = (|| {
        let file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|err| format!("No se pudo preparar el archivo .his: {err}"))?;
        write_archive(folder, file)?;
        fs::rename(&temporary, archive_path)
            .map_err(|err| format!("No se pudo reemplazar el .his; se conserva el original: {err}"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn write_archive(folder: &Path, file: fs::File) -> Result<(), String> {
    let mut writer = ZipWriter::new(file);
    let mut written_entries = HashSet::new();
    let mut entries = vec![folder.to_path_buf()];
    while let Some(current) = entries.pop() {
        for entry in fs::read_dir(&current)
            .map_err(|err| format!("No se pudo leer el proyecto para empaquetarlo: {err}"))?
        {
            let entry =
                entry.map_err(|err| format!("No se pudo leer un archivo del proyecto: {err}"))?;
            let path = entry.path();
            if path.is_dir() {
                entries.push(path);
                continue;
            }
            let relative = path
                .strip_prefix(folder)
                .map_err(|err| format!("Ruta de proyecto inválida: {err}"))?;
            let name = relative.to_string_lossy().replace('\\', "/");
            if !written_entries.insert(name.clone()) {
                continue;
            }
            let already_compressed = path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    matches!(
                        extension.to_ascii_lowercase().as_str(),
                        "pdf" | "png" | "jpg" | "jpeg" | "webp" | "gif" | "mp4" | "webm"
                    )
                });
            let options = SimpleFileOptions::default()
                .compression_method(if already_compressed {
                    CompressionMethod::Stored
                } else {
                    CompressionMethod::Deflated
                })
                .unix_permissions(0o644);
            writer
                .start_file(name, options)
                .map_err(|err| format!("No se pudo añadir el archivo al .his: {err}"))?;
            let mut input = fs::File::open(&path)
                .map_err(|err| format!("No se pudo abrir un archivo del proyecto: {err}"))?;
            std::io::copy(&mut input, &mut writer)
                .map_err(|err| format!("No se pudo escribir el archivo .his: {err}"))?;
        }
    }
    if !folder.join(PROJECT_ICON_NAME).is_file() && !written_entries.contains(PROJECT_ICON_NAME) {
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .unix_permissions(0o644);
        writer
            .start_file(PROJECT_ICON_NAME, options)
            .map_err(|err| format!("No se pudo añadir el icono al .his: {err}"))?;
        writer
            .write_all(PROJECT_ICON)
            .map_err(|err| format!("No se pudo escribir el icono del .his: {err}"))?;
    }
    writer
        .finish()
        .map_err(|err| format!("No se pudo cerrar el archivo .his: {err}"))?
        .sync_all()
        .map_err(|err| format!("No se pudo sincronizar el .his: {err}"))?;
    Ok(())
}

fn validate_project_folder(folder: &Path) -> Result<String, String> {
    if !folder.is_dir() {
        return Err("Selecciona una carpeta de proyecto válida.".into());
    }
    let manifest = manifest_path(folder);
    let database = database_path(folder);
    let mut missing = Vec::new();
    if !manifest.is_file() {
        missing.push(MANIFEST_FILE);
    }
    if !database.is_file() {
        missing.push(DATABASE_FILE);
    }
    if !missing.is_empty() {
        return Err(format!(
            "La carpeta no es un proyecto H.I.S. Future válido. Falta: {}.",
            missing.join(", ")
        ));
    }
    let manifest_data = fs::read_to_string(&manifest)
        .map_err(|err| format!("No se pudo leer {MANIFEST_FILE}: {err}"))?;
    let parsed = serde_json::from_str::<ProjectManifest>(&manifest_data)
        .map_err(|_| format!("{MANIFEST_FILE} no contiene un manifiesto H.I.S. Future válido."))?;
    if parsed.format != "hisfuture-project" || parsed.version != 1 {
        return Err(format!(
            "{MANIFEST_FILE} no corresponde a una versión compatible de H.I.S. Future."
        ));
    }
    let db = Connection::open_with_flags(&database, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|err| format!("No se pudo validar {DATABASE_FILE}: {err}"))?;
    for table in ["project_meta", "nodes", "links"] {
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                [table],
                |row| row.get(0),
            )
            .map_err(|err| format!("No se pudo validar la tabla {table}: {err}"))?;
        if !exists {
            return Err(format!(
                "El proyecto no es compatible: falta la tabla SQLite {table}."
            ));
        }
    }
    Ok(parsed.name)
}

pub fn convert_project_folder(
    source_folder: String,
    archive_path: String,
) -> Result<String, String> {
    let source = PathBuf::from(source_folder.trim());
    let project_name = validate_project_folder(&source)?;
    if fs::metadata(source.join(format!("{DATABASE_FILE}-wal"))).is_ok_and(|meta| meta.len() > 0) {
        return Err(
            "Cierra la conexión SQLite del proyecto antes de convertirlo: hay cambios en WAL."
                .into(),
        );
    }
    let requested_archive = PathBuf::from(archive_path.trim());
    if !requested_archive.parent().is_some_and(Path::is_dir) {
        return Err("La ubicación elegida no es una carpeta válida.".into());
    }
    let stem = requested_archive
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(&project_name);
    let stem = stem
        .strip_suffix(".his")
        .or_else(|| stem.strip_suffix(".HIS"))
        .unwrap_or(stem);
    let archive = requested_archive.with_file_name(format!("{stem}.his"));
    if archive.starts_with(&source) {
        return Err("El archivo .his debe guardarse fuera de la carpeta original.".into());
    }
    if archive.exists() {
        return Err(format!(
            "Ya existe un archivo llamado \"{}\".",
            archive.display()
        ));
    }
    zip_directory(&source, &archive)?;
    Ok(archive.to_string_lossy().into_owned())
}

fn extract_archive(archive_path: &Path) -> Result<PathBuf, String> {
    let file = fs::File::open(archive_path)
        .map_err(|err| format!("No se pudo abrir el proyecto .his: {err}"))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|err| format!("El archivo .his no es un contenedor válido: {err}"))?;
    let folder = temporary_project_folder()?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|err| format!("No se pudo leer el contenido del .his: {err}"))?;
        let relative = entry
            .enclosed_name()
            .ok_or("El proyecto .his contiene una ruta insegura.")?;
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| component == std::path::Component::ParentDir)
        {
            return Err("El proyecto .his contiene una ruta insegura.".into());
        }
        let output = folder.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&output)
                .map_err(|err| format!("No se pudo extraer el proyecto .his: {err}"))?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("No se pudo preparar la extracción del .his: {err}"))?;
        }
        let mut target = fs::File::create(&output)
            .map_err(|err| format!("No se pudo crear un archivo extraído del .his: {err}"))?;
        std::io::copy(&mut entry, &mut target)
            .map_err(|err| format!("No se pudo extraer un archivo del .his: {err}"))?;
    }
    Ok(folder)
}

fn remove_temporary_folder(folder: &Path) {
    let _ = fs::remove_dir_all(folder);
}

fn resolve_project_folder(path: &Path) -> Result<PathBuf, String> {
    if path.is_dir() {
        return Ok(path.to_path_buf());
    }
    if path.is_file() {
        if let Some(parent) = path.parent() {
            return Ok(parent.to_path_buf());
        }
    }
    Err("Selecciona la carpeta del proyecto o un archivo dentro de ella.".into())
}

fn open_folder(folder: &Path) -> Result<OpenProject, String> {
    if !folder.is_dir() {
        return Err("La ruta seleccionada no es una carpeta de proyecto.".into());
    }
    let db_path = database_path(folder);
    if !db_path.exists() {
        return Err(format!(
            "No se encontró {DATABASE_FILE} en esa carpeta. Elige un proyecto de H.I.S. Future."
        ));
    }
    if manifest_path(folder).exists() {
        validate_project_folder(folder)?;
    }
    let name = read_manifest_name(folder).unwrap_or_else(|| {
        folder
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Proyecto".into())
    });
    let (db, archive_dirty) = init_database(&db_path)?;
    Ok(OpenProject {
        info: project_info(name, folder),
        db,
        archive_path: None,
        working_folder: folder.to_path_buf(),
        archive_dirty,
    })
}

pub fn create_project(parent_dir: String, name: String) -> Result<OpenProject, String> {
    let folder_name = sanitize_folder_name(&name)?;
    let parent = PathBuf::from(parent_dir.trim());
    if !parent.is_dir() {
        return Err("La ubicación elegida no es una carpeta válida.".into());
    }
    let folder = parent.join(&folder_name);
    if folder.exists() {
        return Err(format!(
            "Ya existe una carpeta llamada \"{folder_name}\" en esa ubicación."
        ));
    }
    fs::create_dir_all(&folder).map_err(|err| format!("No se pudo crear la carpeta: {err}"))?;
    write_manifest(&folder, name.trim())?;
    let db_path = database_path(&folder);
    let (db, _) = init_database(&db_path)?;
    db.execute(
        "INSERT OR REPLACE INTO project_meta (key, value) VALUES ('name', ?1)",
        params![name.trim()],
    )
    .map_err(|err| format!("No se pudo guardar el nombre en SQLite: {err}"))?;
    Ok(OpenProject {
        info: project_info(name.trim().to_string(), &folder),
        db,
        archive_path: None,
        working_folder: folder,
        archive_dirty: false,
    })
}

pub fn create_project_file(archive_path: String, name: String) -> Result<OpenProject, String> {
    let archive = PathBuf::from(archive_path.trim());
    if !archive.parent().is_some_and(Path::is_dir) {
        return Err("La ubicación elegida no es una carpeta válida.".into());
    }
    let project_name = sanitize_folder_name(&name)?;
    let selected_name = archive
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(&project_name)
        .to_string();
    let clean_name = selected_name
        .trim_end_matches(|character: char| character == '.' || character.is_whitespace())
        .strip_suffix(".his")
        .or_else(|| selected_name.strip_suffix(".HIS"))
        .unwrap_or(&selected_name);
    let archive = archive.with_file_name(format!("{clean_name}.his"));
    if archive.exists() {
        return Err(format!(
            "Ya existe un proyecto llamado \"{}\".",
            archive.display()
        ));
    }
    let temporary_root = temporary_project_folder()?;
    let created = match create_project(
        temporary_root.to_string_lossy().into_owned(),
        project_name.clone(),
    ) {
        Ok(project) => project,
        Err(error) => {
            remove_temporary_folder(&temporary_root);
            return Err(error);
        }
    };
    let source_folder = created.working_folder.clone();
    if let Err(error) = zip_directory(&source_folder, &archive) {
        remove_temporary_folder(&temporary_root);
        return Err(error);
    }
    drop(created);
    remove_temporary_folder(&temporary_root);
    let working_folder = extract_archive(&archive)?;
    let (db, archive_dirty) = init_database(&working_folder.join(DATABASE_FILE))?;
    Ok(OpenProject {
        info: archive_project_info(project_name, &archive, &working_folder),
        db,
        archive_path: Some(archive),
        working_folder,
        archive_dirty,
    })
}

pub fn open_project_from_path(path: String) -> Result<OpenProject, String> {
    let total_started = Instant::now();
    let selected = PathBuf::from(path.trim());
    if !selected.exists() {
        return Err("La ruta seleccionada no existe.".into());
    }
    if selected.is_file()
        && selected
            .extension()
            .and_then(|extension| extension.to_str())
            == Some("his")
    {
        let extraction_started = Instant::now();
        let extracted_root = extract_archive(&selected)?;
        let extraction_ms = extraction_started.elapsed().as_secs_f64() * 1000.0;
        let sqlite_started = Instant::now();
        let opened = open_folder(&extracted_root)?;
        let sqlite_ms = sqlite_started.elapsed().as_secs_f64() * 1000.0;
        let name = opened.info.name.clone();
        eprintln!(
            "[lifecycle] project.open archive_extract={extraction_ms:.2}ms sqlite_init={sqlite_ms:.2}ms total={:.2}ms",
            total_started.elapsed().as_secs_f64() * 1000.0
        );
        return Ok(OpenProject {
            info: archive_project_info(name, &selected, &extracted_root),
            db: opened.db,
            archive_path: Some(selected),
            working_folder: extracted_root,
            archive_dirty: opened.archive_dirty,
        });
    }
    let folder = resolve_project_folder(&selected)?;
    open_folder(&folder)
}

pub fn set_open_project(state: &ProjectState, project: OpenProject) -> Result<ProjectInfo, String> {
    let info = project.info.clone();
    let mut guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    if guard.is_some() {
        return Err("Cierra el proyecto actual antes de abrir otro.".into());
    }
    *guard = Some(project);
    Ok(info)
}

pub fn close_project_traced(
    state: &ProjectState,
    trace_id: Option<&str>,
) -> Result<CloseProjectTimings, String> {
    let total_started = Instant::now();
    let mut checkpoint_ms = 0.0;
    let mut archive_ms = 0.0;
    let mut cleanup_ms = 0.0;
    let mut packaged = false;
    let mut guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    if let Some(project) = guard.as_ref() {
        if project.archive_dirty {
            if let Some(archive_path) = project.archive_path.as_ref() {
                let checkpoint_started = Instant::now();
                let (busy, _, _): (i64, i64, i64) = project
                    .db
                    .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
                        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                    })
                    .map_err(|err| format!("No se pudo preparar SQLite para empaquetar: {err}"))?;
                if busy != 0 {
                    return Err("SQLite está ocupado; el proyecto sigue abierto.".into());
                }
                checkpoint_ms = checkpoint_started.elapsed().as_secs_f64() * 1000.0;
                let archive_started = Instant::now();
                zip_directory(&project.working_folder, archive_path).map_err(|err| {
                    format!(
                        "{err} Copia de trabajo conservada en {}",
                        project.working_folder.display()
                    )
                })?;
                archive_ms = archive_started.elapsed().as_secs_f64() * 1000.0;
                packaged = true;
            }
        }
    }
    if let Some(project) = guard.take() {
        let temporary = project
            .archive_path
            .is_some()
            .then(|| project.working_folder.clone());
        drop(project);
        if let Some(folder) = temporary {
            let cleanup_started = Instant::now();
            remove_temporary_folder(&folder);
            cleanup_ms = cleanup_started.elapsed().as_secs_f64() * 1000.0;
        }
    }
    let total_ms = total_started.elapsed().as_secs_f64() * 1000.0;
    eprintln!(
        "[lifecycle][{}] project.close checkpoint={checkpoint_ms:.2}ms archive={archive_ms:.2}ms working_directory_cleanup={cleanup_ms:.2}ms packaged={packaged} total={total_ms:.2}ms",
        trace_id.unwrap_or("no-trace")
    );
    Ok(CloseProjectTimings {
        sqlite_checkpoint_ms: checkpoint_ms,
        archive_packaging_ms: archive_ms,
        working_directory_cleanup_ms: cleanup_ms,
        total_ms,
        packaged,
    })
}

#[cfg(test)]
pub fn close_project(state: &ProjectState) -> Result<(), String> {
    close_project_traced(state, None).map(|_| ())
}

pub fn list_nodes(state: &ProjectState) -> Result<Vec<NodeRecord>, String> {
    let guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    let project = guard.as_ref().ok_or("No hay un proyecto abierto.")?;
    let mut stmt = project
        .db
        .prepare(
            "SELECT id, name, type, parent_id, sort_order, content FROM nodes ORDER BY sort_order, name",
        )
        .map_err(|err| format!("No se pudieron leer los nodos: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(NodeRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                node_type: row.get(2)?,
                parent_id: row.get(3)?,
                order: row.get(4)?,
                content: row.get(5)?,
            })
        })
        .map_err(|err| format!("No se pudieron leer los nodos: {err}"))?;
    let mut nodes = Vec::new();
    for row in rows {
        nodes.push(row.map_err(|err| format!("Nodo ilegible: {err}"))?);
    }
    Ok(nodes)
}

#[cfg(test)]
pub fn save_nodes(state: &ProjectState, nodes: Vec<NodeRecord>) -> Result<(), String> {
    save_workspace(state, nodes, None, None)
}

// One transaction owns active entities, Lore membership and trash.
pub fn save_workspace_traced(
    state: &ProjectState,
    nodes: Vec<NodeRecord>,
    hidden_ids: Option<Vec<String>>,
    deleted_nodes: Option<String>,
    trace_id: Option<&str>,
) -> Result<SaveWorkspaceTimings, String> {
    let total_started = Instant::now();
    let has_complete_trash_snapshot = deleted_nodes.is_some();
    if let Some(node) = nodes
        .iter()
        .find(|node| !is_persisted_node_type(&node.node_type))
    {
        return Err(format!(
            "El tipo de nodo '{}' no está registrado para persistencia.",
            node.node_type
        ));
    }
    let ids: HashSet<&str> = nodes.iter().map(|node| node.id.as_str()).collect();
    if ids.len() != nodes.len() || ids.contains("") {
        return Err("El proyecto contiene identidades vacías o duplicadas.".into());
    }
    if let Some(ref hidden) = hidden_ids {
        if hidden.iter().any(|id| !ids.contains(id.as_str())) {
            return Err("Lore contiene un ID inexistente.".into());
        }
    }
    let trash = deleted_nodes
        .as_deref()
        .map(serde_json::from_str::<Vec<NodeRecord>>)
        .transpose()
        .map_err(|err| format!("Papelera inválida: {err}"))?;
    if let Some(ref trash) = trash {
        if let Some(node) = trash
            .iter()
            .find(|node| !is_persisted_node_type(&node.node_type))
        {
            return Err(format!(
                "La papelera contiene el tipo de nodo '{}' sin registrar.",
                node.node_type
            ));
        }
        let mut trash_ids = HashSet::new();
        if trash.iter().any(|node| {
            node.id.is_empty() || ids.contains(node.id.as_str()) || !trash_ids.insert(&node.id)
        }) {
            return Err("La papelera contiene identidades duplicadas o activas.".into());
        }
    }
    // Hierarchy validation deliberately does not reinterpret semantic references.
    let by_id: std::collections::HashMap<_, _> =
        nodes.iter().map(|node| (node.id.as_str(), node)).collect();
    for node in &nodes {
        let mut seen = HashSet::new();
        let mut current = Some(node.id.as_str());
        while let Some(id) = current {
            if !seen.insert(id) {
                return Err("La jerarquía contiene un ciclo.".into());
            }
            current = by_id
                .get(id)
                .ok_or("La jerarquía contiene un padre inexistente.")?
                .parent_id
                .as_deref();
        }
    }
    let mut guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    let project = guard.as_mut().ok_or("No hay un proyecto abierto.")?;
    let resources_started = Instant::now();
    let previous_resources = persisted_resource_references(project)?;
    let mut current_resources = resource_references(
        nodes
            .iter()
            .chain(trash.as_deref().unwrap_or_default().iter()),
    );
    if !has_complete_trash_snapshot {
        // Legacy/internal callers that omit Trash do not authorize resource collection.
        current_resources.extend(previous_resources.iter().cloned());
    }
    let resources_ms = resources_started.elapsed().as_secs_f64() * 1000.0;
    let sqlite_started = Instant::now();
    let tx = project
        .db
        .transaction()
        .map_err(|err| format!("No se pudo iniciar la transacción: {err}"))?;
    tx.execute_batch("PRAGMA defer_foreign_keys = ON;")
        .map_err(|err| err.to_string())?;
    let previous: Vec<String> = {
        let mut statement = tx
            .prepare("SELECT id FROM nodes")
            .map_err(|err| err.to_string())?;
        let rows = statement
            .query_map([], |row| row.get(0))
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<_, _>>()
            .map_err(|err| err.to_string())?
    };
    let mut changed_rows = 0usize;
    for node in &nodes {
        changed_rows += tx.execute("INSERT INTO nodes (id, name, type, parent_id, sort_order, content) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, parent_id=excluded.parent_id, sort_order=excluded.sort_order, content=excluded.content
            WHERE nodes.name IS NOT excluded.name OR nodes.type IS NOT excluded.type OR nodes.parent_id IS NOT excluded.parent_id OR nodes.sort_order IS NOT excluded.sort_order OR nodes.content IS NOT excluded.content",
            params![node.id, node.name, node.node_type, node.parent_id, node.order, node.content])
            .map_err(|err| format!("No se pudo guardar el nodo {}: {err}", node.id))?;
    }
    for id in previous {
        if !ids.contains(id.as_str()) {
            changed_rows += tx
                .execute("DELETE FROM nodes WHERE id = ?1", [id])
                .map_err(|err| err.to_string())?;
        }
    }
    for (key, value) in [
        (
            "loreHiddenIds",
            hidden_ids.map(|ids| serde_json::to_string(&ids).expect("string IDs")),
        ),
        ("deletedNodes", deleted_nodes),
    ] {
        if let Some(value) = value {
            changed_rows += tx.execute("INSERT INTO project_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE project_meta.value IS NOT excluded.value", params![key, value])
                .map_err(|err| format!("No se pudo guardar {key}: {err}"))?;
        }
    }
    tx.commit()
        .map_err(|err| format!("No se pudo confirmar el guardado: {err}"))?;
    let sqlite_ms = sqlite_started.elapsed().as_secs_f64() * 1000.0;
    let cleanup_started = Instant::now();
    let removed_resources =
        cleanup_removed_resources(project, &previous_resources, &current_resources);
    let cleanup_ms = cleanup_started.elapsed().as_secs_f64() * 1000.0;
    if changed_rows > 0 || removed_resources {
        project.archive_dirty = true;
    }
    let total_ms = total_started.elapsed().as_secs_f64() * 1000.0;
    eprintln!(
        "[lifecycle][{}] project.save resources={resources_ms:.2}ms sqlite={sqlite_ms:.2}ms cleanup={cleanup_ms:.2}ms changed_rows={changed_rows} total={total_ms:.2}ms",
        trace_id.unwrap_or("no-trace")
    );
    Ok(SaveWorkspaceTimings {
        resource_scan_ms: resources_ms,
        sqlite_ms,
        resource_cleanup_ms: cleanup_ms,
        total_ms,
        changed_rows,
    })
}

#[cfg(test)]
pub fn save_workspace(
    state: &ProjectState,
    nodes: Vec<NodeRecord>,
    hidden_ids: Option<Vec<String>>,
    deleted_nodes: Option<String>,
) -> Result<(), String> {
    save_workspace_traced(state, nodes, hidden_ids, deleted_nodes, None).map(|_| ())
}

type ResourceIdentity = (String, String);

fn resource_references<'a>(
    nodes: impl Iterator<Item = &'a NodeRecord>,
) -> HashSet<ResourceIdentity> {
    nodes
        .filter_map(|node| resource_id_from_content(&node.node_type, &node.content))
        .filter(|(_, resource_id)| validate_resource_identity(resource_id).is_ok())
        .map(|(kind, resource_id)| (kind.to_string(), resource_id))
        .collect()
}

fn persisted_resource_references(
    project: &OpenProject,
) -> Result<HashSet<ResourceIdentity>, String> {
    let mut statement = project
        .db
        .prepare("SELECT id, name, type, parent_id, sort_order, content FROM nodes")
        .map_err(|error| format!("No se pudieron revisar los recursos activos: {error}"))?;
    let active = statement
        .query_map([], |row| {
            Ok(NodeRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                node_type: row.get(2)?,
                parent_id: row.get(3)?,
                order: row.get(4)?,
                content: row.get(5)?,
            })
        })
        .map_err(|error| format!("No se pudieron revisar los recursos activos: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No se pudieron revisar los recursos activos: {error}"))?;
    let deleted: Option<String> = project
        .db
        .query_row(
            "SELECT value FROM project_meta WHERE key = 'deletedNodes'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("No se pudieron revisar los recursos de Papelera: {error}"))?;
    let trash = deleted
        .as_deref()
        .and_then(|value| serde_json::from_str::<Vec<NodeRecord>>(value).ok())
        .unwrap_or_default();
    Ok(resource_references(active.iter().chain(trash.iter())))
}

fn cleanup_removed_resources(
    project: &OpenProject,
    previous: &HashSet<ResourceIdentity>,
    current: &HashSet<ResourceIdentity>,
) -> bool {
    let mut removed = false;
    for (kind, resource_id) in previous.difference(current) {
        match resource_path(project, kind, resource_id) {
            Ok(path) if path.exists() => {
                if let Err(error) = fs::remove_file(&path) {
                    eprintln!("No se pudo limpiar el recurso {}: {error}", path.display());
                } else {
                    removed = true;
                }
            }
            _ => {}
        }
    }
    removed
}

fn validate_resource_identity(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("Identificador de recurso no válido.".into());
    }
    Ok(())
}

fn resource_path(project: &OpenProject, kind: &str, resource_id: &str) -> Result<PathBuf, String> {
    validate_resource_identity(resource_id)?;
    let definition = project_resource_definition(kind)
        .ok_or_else(|| format!("Tipo de recurso no compatible: {kind}"))?;
    Ok(project
        .working_folder
        .join("resources")
        .join(definition.kind)
        .join(format!("{resource_id}.{}", definition.extension)))
}

pub fn store_project_resource(
    state: &ProjectState,
    kind: String,
    resource_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    validate_project_resource(&kind, &data)?;
    let mut guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    let project = guard.as_mut().ok_or("No hay un proyecto abierto.")?;
    let target = resource_path(project, &kind, &resource_id)?;
    let parent = target
        .parent()
        .ok_or("No se pudo resolver la carpeta del recurso.")?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("No se pudo preparar la carpeta de recursos: {error}"))?;
    let temporary = parent.join(format!(".{resource_id}.tmp"));
    fs::write(&temporary, data)
        .map_err(|error| format!("No se pudo escribir el recurso: {error}"))?;
    if target.exists() {
        let _ = fs::remove_file(&temporary);
        return Err("Ya existe un recurso con ese identificador.".into());
    }
    fs::rename(&temporary, &target).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("No se pudo confirmar el recurso importado: {error}")
    })?;
    project.archive_dirty = true;
    Ok(())
}

pub fn read_project_resource(
    state: &ProjectState,
    kind: String,
    resource_id: String,
) -> Result<Vec<u8>, String> {
    let started = Instant::now();
    let path = {
        let guard = state
            .lock()
            .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
        let project = guard.as_ref().ok_or("No hay un proyecto abierto.")?;
        resource_path(project, &kind, &resource_id)?
    };
    let bytes = fs::read(path).map_err(|error| format!("No se pudo leer el recurso: {error}"))?;
    eprintln!(
        "[lifecycle] resource.read kind={kind} bytes={} filesystem={:.2}ms",
        bytes.len(),
        started.elapsed().as_secs_f64() * 1000.0
    );
    Ok(bytes)
}

pub fn delete_project_resource(
    state: &ProjectState,
    kind: String,
    resource_id: String,
) -> Result<(), String> {
    let mut guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    let project = guard.as_mut().ok_or("No hay un proyecto abierto.")?;
    let path = resource_path(project, &kind, &resource_id)?;
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(path).map_err(|error| format!("No se pudo eliminar el recurso: {error}"))?;
    project.archive_dirty = true;
    Ok(())
}

pub fn get_project_setting(state: &ProjectState, key: String) -> Result<Option<String>, String> {
    if key != "locale" && key != "loreHiddenIds" && key != "deletedNodes" {
        return Err("Configuración de proyecto no compatible.".into());
    }
    let guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    let project = guard.as_ref().ok_or("No hay un proyecto abierto.")?;
    project
        .db
        .query_row(
            "SELECT value FROM project_meta WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("No se pudo leer la configuración del proyecto: {error}"))
}

pub fn set_project_setting(state: &ProjectState, key: String, value: String) -> Result<(), String> {
    let valid = match key.as_str() {
        "locale" => ["es", "en"].contains(&value.as_str()),
        "loreHiddenIds" => serde_json::from_str::<Vec<String>>(&value).is_ok(),
        _ => false,
    };
    if !valid {
        return Err("Configuración de proyecto no válida.".into());
    }
    let mut guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    let project = guard.as_mut().ok_or("No hay un proyecto abierto.")?;
    let changed = project
        .db
        .execute(
            "INSERT INTO project_meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value
             WHERE project_meta.value IS NOT excluded.value",
            params![key, value],
        )
        .map_err(|error| format!("No se pudo guardar la configuración del proyecto: {error}"))?;
    if changed > 0 {
        project.archive_dirty = true;
    }
    Ok(())
}

pub fn current_project(state: &ProjectState) -> Result<Option<ProjectInfo>, String> {
    let guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    Ok(guard.as_ref().map(|project| project.info.clone()))
}

#[allow(dead_code)]
pub fn project_name_from_meta(db: &Connection) -> Option<String> {
    db.query_row(
        "SELECT value FROM project_meta WHERE key = 'name'",
        [],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn test_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "hisfuture-{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn test_node(id: &str, kind: &str, parent: Option<&str>) -> NodeRecord {
        NodeRecord {
            id: id.into(),
            name: id.into(),
            node_type: kind.into(),
            parent_id: parent.map(str::to_string),
            order: 0,
            content: format!("<p>{id}</p>"),
        }
    }

    #[test]
    fn concurrent_sessions_reserve_distinct_working_folders() {
        let workers: Vec<_> = (0..32)
            .map(|_| std::thread::spawn(temporary_project_folder))
            .collect();
        let folders: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap().unwrap())
            .collect();
        assert_eq!(folders.iter().collect::<HashSet<_>>().len(), folders.len());
        for folder in folders {
            fs::remove_dir(folder).unwrap();
        }
    }

    #[test]
    fn snapshot_preserves_links_and_rolls_back_partial_failure() {
        let root = test_root("snapshot");
        let state = Mutex::new(Some(
            create_project(root.to_string_lossy().into(), "Test".into()).unwrap(),
        ));
        let nodes = vec![
            test_node("child", "pagina", Some("parent")),
            test_node("parent", "categoria", None),
        ];
        save_workspace(
            &state,
            nodes.clone(),
            Some(vec!["child".into()]),
            Some("[]".into()),
        )
        .unwrap();
        state
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .db
            .execute("INSERT INTO links VALUES ('child','parent')", [])
            .unwrap();
        save_nodes(&state, nodes.clone()).unwrap();
        assert_eq!(
            state
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .db
                .query_row("SELECT COUNT(*) FROM links", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        let before = list_nodes(&state).unwrap();
        let unknown_trash = serde_json::to_string(&vec![test_node("trash", "unknown", None)])
            .expect("serialize invalid trash fixture");
        assert!(save_workspace(&state, nodes.clone(), Some(vec![]), Some(unknown_trash)).is_err());
        assert_eq!(list_nodes(&state).unwrap(), before);
        let mut invalid = nodes.clone();
        invalid[0].name = "must rollback".into();
        invalid[1].node_type = "unknown".into();
        assert!(save_workspace(&state, invalid, Some(vec![]), Some("[]".into())).is_err());
        assert_eq!(list_nodes(&state).unwrap(), before);
        assert_eq!(
            get_project_setting(&state, "loreHiddenIds".into()).unwrap(),
            Some("[\"child\"]".into())
        );
        assert!(save_nodes(&state, vec![nodes[0].clone(), nodes[0].clone()]).is_err());
        let mut cycle = nodes.clone();
        cycle[1].parent_id = Some("child".into());
        assert!(save_nodes(&state, cycle).is_err());
        assert_eq!(list_nodes(&state).unwrap(), before);
        // Moving a child out before deleting its former parent must not cascade into it.
        let mut moved = nodes[0].clone();
        moved.parent_id = None;
        save_nodes(&state, vec![moved.clone()]).unwrap();
        assert_eq!(list_nodes(&state).unwrap(), vec![moved]);
        close_project(&state).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn all_registered_types_trash_and_resources_survive_archive_roundtrip() {
        let root = test_root("roundtrip");
        let path = root.join("All.his");
        let state = Mutex::new(Some(
            create_project_file(path.to_string_lossy().into(), "All".into()).unwrap(),
        ));
        let definitions = [
            include_str!("../../src/nodes/category/definition.ts"),
            include_str!("../../src/nodes/page/definition.ts"),
            include_str!("../../src/nodes/image/definition.ts"),
            include_str!("../../src/nodes/calendar/definition.ts"),
            include_str!("../../src/nodes/tempo/definition.ts"),
            include_str!("../../src/nodes/pdf/definition.ts"),
            include_str!("../../src/nodes/course/definition.ts"),
            include_str!("../../src/nodes/task/definition.ts"),
            include_str!("../../src/nodes/video/definition.ts"),
        ]
        .concat();
        let types = [
            "categoria",
            "pagina",
            "imagen",
            "calendario",
            "tempo",
            "pdf",
            "curso",
            "tarea",
            "video",
        ];
        let mut nodes: Vec<_> = types
            .iter()
            .enumerate()
            .map(|(i, kind)| {
                assert!(definitions.contains(&format!("type: \"{kind}\"")));
                let mut node = test_node(kind, kind, None);
                node.order = i as i64;
                node
            })
            .collect();
        nodes[7].content = "<!--hisfuture-nodal-meta:{\"version\":1,\"relations\":[{\"role\":\"course\",\"targetId\":\"curso\"},{\"role\":\"tempo\",\"targetId\":\"tempo\"}]}--><p>Task</p>".into();
        let pdf = b"%PDF-1.4 archive resource".to_vec();
        store_project_resource(&state, "pdf".into(), "resource".into(), pdf.clone()).unwrap();
        let deleted = nodes.remove(7);
        let trash = serde_json::to_string(&vec![deleted.clone()]).unwrap();
        save_workspace(
            &state,
            nodes.clone(),
            Some(vec!["pdf".into()]),
            Some(trash.clone()),
        )
        .unwrap();
        close_project(&state).unwrap();
        let reopened = Mutex::new(Some(
            open_project_from_path(path.to_string_lossy().into()).unwrap(),
        ));
        assert_eq!(list_nodes(&reopened).unwrap(), nodes);
        assert_eq!(
            get_project_setting(&reopened, "deletedNodes".into()).unwrap(),
            Some(trash)
        );
        assert_eq!(
            read_project_resource(&reopened, "pdf".into(), "resource".into()).unwrap(),
            pdf
        );
        nodes.push(deleted.clone());
        save_workspace(&reopened, nodes, Some(vec![]), Some("[]".into())).unwrap();
        close_project(&reopened).unwrap();
        let restored = Mutex::new(Some(
            open_project_from_path(path.to_string_lossy().into()).unwrap(),
        ));
        assert_eq!(
            list_nodes(&restored)
                .unwrap()
                .into_iter()
                .find(|n| n.id == deleted.id),
            Some(deleted)
        );
        close_project(&restored).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_pack_keeps_original_and_open_session_for_retry() {
        let root = test_root("failed-pack");
        let path = root.join("Safe.his");
        let project = create_project_file(path.to_string_lossy().into(), "Safe".into()).unwrap();
        let folder = project.working_folder.clone();
        let original = fs::read(&path).unwrap();
        let missing = folder.with_extension("missing");
        let state = Mutex::new(Some(project));
        {
            let mut guard = state.lock().unwrap();
            let project = guard.as_mut().unwrap();
            project.archive_dirty = true;
            project.working_folder = missing;
        }
        assert!(close_project(&state).is_err());
        assert!(state.lock().unwrap().is_some());
        assert_eq!(fs::read(&path).unwrap(), original);
        state.lock().unwrap().as_mut().unwrap().working_folder = folder.clone();
        close_project(&state).unwrap();
        assert!(!folder.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn future_schema_is_rejected_without_downgrading_metadata() {
        let root = test_root("future-schema");
        let path = root.join(DATABASE_FILE);
        let (db, _) = init_database(&path).unwrap();
        db.execute(
            "UPDATE project_meta SET value='99' WHERE key='nodal_schema_version'",
            [],
        )
        .unwrap();
        drop(db);
        assert!(init_database(&path).is_err());
        let db = Connection::open(&path).unwrap();
        assert_eq!(
            db.query_row(
                "SELECT value FROM project_meta WHERE key='nodal_schema_version'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "99"
        );
        drop(db);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn deserializes_frontend_node_payload_with_parent_id() {
        let raw = r#"{
            "id": "child-id",
            "name": "Hijo",
            "type": "pagina",
            "parentId": "root-id",
            "order": 12,
            "content": "<p>hola</p>"
        }"#;

        let record: NodeRecord = serde_json::from_str(raw).expect("payload should deserialize");

        assert_eq!(record.id, "child-id");
        assert_eq!(record.node_type, "pagina");
        assert_eq!(record.parent_id, Some("root-id".to_string()));
        assert_eq!(record.order, 12);
        assert_eq!(record.content, "<p>hola</p>");
    }

    #[test]
    fn persists_calendar_and_tempo_nodes_with_temporal_metadata() {
        let root = std::env::temp_dir().join(format!(
            "hisfuture-temporal-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root");
        let project = create_project(root.to_string_lossy().into_owned(), "Temporal".into())
            .expect("create project");
        let project_path = project.info.folder_path.clone();
        let state = Mutex::new(Some(project));
        let expected = vec![
            NodeRecord {
                id: "calendar-1".into(),
                name: "Calendario 1".into(),
                node_type: "calendario".into(),
                parent_id: None,
                order: 0,
                content: "<!--hisfuture-calendar-meta:{\"currentDate\":\"2026-09-01\",\"view\":\"month\"}--><p><br></p>".into(),
            },
            NodeRecord {
                id: "tempo-1".into(),
                name: "Tempo 1".into(),
                node_type: "tempo".into(),
                parent_id: Some("calendar-1".into()),
                order: 0,
                content: "<!--hisfuture-tempo-meta:{\"date\":\"2026-09-01\",\"startTime\":null,\"endTime\":null}--><p>Contenido y referencia normal</p>".into(),
            },
        ];

        save_nodes(&state, expected.clone()).expect("save temporal nodes");
        assert_eq!(list_nodes(&state).expect("list temporal nodes"), expected);
        close_project(&state).expect("close project");
        let reopened = open_project_from_path(project_path).expect("reopen temporal project");
        let reopened_state = Mutex::new(Some(reopened));
        assert_eq!(
            list_nodes(&reopened_state).expect("list reopened temporal nodes"),
            expected
        );
        save_nodes(&reopened_state, vec![expected[0].clone()]).expect("persist tempo deletion");
        close_project(&reopened_state).expect("close reopened project");
        let after_delete =
            open_project_from_path(root.join("Temporal").to_string_lossy().into_owned())
                .expect("reopen project after tempo deletion");
        let after_delete_state = Mutex::new(Some(after_delete));
        assert_eq!(
            list_nodes(&after_delete_state).expect("list nodes after tempo deletion"),
            vec![expected[0].clone()]
        );
        close_project(&after_delete_state).expect("close project after deletion check");
        fs::remove_dir_all(root).expect("test cleanup");
    }

    #[test]
    fn creates_valid_his_archive_from_initial_project() {
        let root = std::env::temp_dir().join(format!(
            "hisfuture-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root");
        let archive_path = root.join("Proyecto.his.his");
        let project = create_project_file(
            archive_path.to_string_lossy().into_owned(),
            "Proyecto".into(),
        )
        .expect("create archive");

        assert_eq!(
            project.info.folder_path,
            root.join("Proyecto.his").to_string_lossy()
        );
        assert!(root.join("Proyecto.his").is_file());
        let file = fs::File::open(root.join("Proyecto.his")).expect("archive file");
        let mut archive = ZipArchive::new(file).expect("zip archive");
        assert!(archive.by_name(MANIFEST_FILE).is_ok());
        assert!(archive.by_name(DATABASE_FILE).is_ok());
        let mut archived_icon = Vec::new();
        archive
            .by_name("his-file.ico")
            .expect("project file icon")
            .read_to_end(&mut archived_icon)
            .expect("read project file icon");
        assert_eq!(archived_icon, PROJECT_ICON);

        let state = Mutex::new(Some(project));
        let expected = vec![NodeRecord {
            id: "page-1".into(),
            name: "Globo persistente".into(),
            node_type: "pagina".into(),
            parent_id: None,
            order: 0,
            content: "<div data-globe=\"true\"><div data-globe-content=\"true\"><p>Contenido guardado</p></div></div>".into(),
        }];
        save_nodes(&state, expected.clone()).expect("save content");
        close_project(&state).expect("close archive project");
        assert!(state.lock().expect("state lock").is_none());
        let reopened =
            open_project_from_path(root.join("Proyecto.his").to_string_lossy().into_owned())
                .expect("reopen archive");
        assert_eq!(reopened.info.name, "Proyecto");
        let reopened_state = Mutex::new(Some(reopened));
        assert_eq!(
            list_nodes(&reopened_state).expect("read saved content"),
            expected
        );
        close_project(&reopened_state).expect("close reopened archive");
        fs::remove_dir_all(root).expect("test cleanup");
    }

    #[test]
    fn persists_pdf_node_and_resource_inside_his_archive() {
        let root = std::env::temp_dir().join(format!(
            "hisfuture-pdf-resource-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root");
        let archive_path = root.join("PDF Project.his");
        let project = create_project_file(
            archive_path.to_string_lossy().into_owned(),
            "PDF Project".into(),
        )
        .expect("create archive project");
        let state = Mutex::new(Some(project));
        let bytes = b"%PDF-1.4\n%%EOF\n".to_vec();
        store_project_resource(&state, "pdf".into(), "resource-1".into(), bytes.clone())
            .expect("store pdf resource");
        let nodes = vec![NodeRecord {
            id: "pdf-1".into(),
            name: "Documento extraño ñ.pdf".into(),
            node_type: "pdf".into(),
            parent_id: None,
            order: 0,
            content: "<!--hisfuture-pdf-resource:{\"resourceId\":\"resource-1\",\"fileName\":\"Documento extraño ñ.pdf\",\"fileSize\":15,\"hash\":\"hash\"}--><p><br></p>".into(),
        }];
        save_nodes(&state, nodes.clone()).expect("save pdf node");
        set_project_setting(&state, "locale".into(), "en".into()).expect("save project locale");
        set_project_setting(&state, "loreHiddenIds".into(), "[\"pdf-1\"]".into())
            .expect("save Lore membership");
        assert!(set_project_setting(&state, "loreHiddenIds".into(), "false".into()).is_err());
        close_project(&state).expect("close and pack project");

        let file = fs::File::open(&archive_path).expect("open archive");
        let mut archive = ZipArchive::new(file).expect("read archive");
        assert!(archive.by_name("resources/pdf/resource-1.pdf").is_ok());
        drop(archive);

        let reopened = open_project_from_path(archive_path.to_string_lossy().into_owned())
            .expect("reopen archive");
        let reopened_state = Mutex::new(Some(reopened));
        assert_eq!(list_nodes(&reopened_state).expect("read pdf node"), nodes);
        assert_eq!(
            get_project_setting(&reopened_state, "loreHiddenIds".into())
                .expect("read Lore membership"),
            Some("[\"pdf-1\"]".into())
        );
        assert_eq!(
            get_project_setting(&reopened_state, "locale".into()).expect("read project locale"),
            Some("en".into())
        );
        assert_eq!(
            read_project_resource(&reopened_state, "pdf".into(), "resource-1".into())
                .expect("read pdf resource"),
            bytes
        );
        assert!(read_project_resource(&reopened_state, "pdf".into(), "../escape".into()).is_err());
        save_workspace(
            &reopened_state,
            vec![],
            Some(vec![]),
            Some(serde_json::to_string(&nodes).expect("serialize PDF Trash snapshot")),
        )
        .expect("move PDF node to Trash");
        assert_eq!(
            read_project_resource(&reopened_state, "pdf".into(), "resource-1".into())
                .expect("Trash preserves PDF resource"),
            bytes
        );
        save_workspace(&reopened_state, vec![], Some(vec![]), Some("[]".into()))
            .expect("permanently delete PDF node");
        assert!(read_project_resource(&reopened_state, "pdf".into(), "resource-1".into()).is_err());
        close_project(&reopened_state).expect("close reopened project");
        fs::remove_dir_all(root).expect("test cleanup");
    }

    #[test]
    fn migrates_existing_node_schema_to_accept_all_current_types() {
        let root = std::env::temp_dir().join(format!(
            "hisfuture-pdf-schema-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root");
        let database = root.join(DATABASE_FILE);
        let legacy = Connection::open(&database).expect("legacy database");
        legacy.execute_batch(
            "CREATE TABLE project_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE nodes (
               id TEXT PRIMARY KEY,
               name TEXT NOT NULL,
               type TEXT NOT NULL CHECK(type IN ('categoria', 'pagina', 'imagen', 'calendario', 'tempo')),
               parent_id TEXT,
               sort_order INTEGER NOT NULL DEFAULT 0,
               content TEXT NOT NULL DEFAULT '<p><br></p>',
               FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
             );
             CREATE TABLE links (
               from_node_id TEXT NOT NULL,
               to_node_id TEXT NOT NULL,
               PRIMARY KEY (from_node_id, to_node_id),
               FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
               FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
             );
             INSERT INTO nodes (id, name, type) VALUES ('page-1', 'Existing', 'pagina');",
        ).expect("create pre-pdf schema");
        drop(legacy);

        let (migrated, _) = init_database(&database).expect("migrate schema");
        for (id, name, node_type) in [
            ("pdf-1", "Document.pdf", "pdf"),
            ("course-1", "Course", "curso"),
            ("task-1", "Task", "tarea"),
            ("video-1", "Video", "video"),
        ] {
            migrated
                .execute(
                    "INSERT INTO nodes (id, name, type) VALUES (?1, ?2, ?3)",
                    params![id, name, node_type],
                )
                .expect("insert type after migration");
        }
        let count: i64 = migrated
            .query_row("SELECT COUNT(*) FROM nodes", [], |row| row.get(0))
            .expect("count nodes");
        assert_eq!(count, 5);
        drop(migrated);
        fs::remove_dir_all(root).expect("test cleanup");
    }

    #[test]
    fn persists_new_nodal_types_and_relations_without_lore_parenting() {
        let root = std::env::temp_dir().join(format!(
            "hisfuture-nodal-types-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root");
        let project = create_project(root.to_string_lossy().into_owned(), "Nodal".into())
            .expect("create project");
        let project_path = project.info.folder_path.clone();
        let state = Mutex::new(Some(project));
        let nodes = vec![
            NodeRecord { id: "course".into(), name: "Course".into(), node_type: "curso".into(), parent_id: None, order: 0, content: "<!--hisfuture-nodal-meta:{\"version\":1,\"relations\":[{\"role\":\"syllabus\",\"targetId\":\"pdf\"}]}--><p><br></p>".into() },
            NodeRecord { id: "task".into(), name: "Task".into(), node_type: "tarea".into(), parent_id: None, order: 1, content: "<!--hisfuture-nodal-meta:{\"version\":1,\"evaluation\":true,\"relations\":[{\"role\":\"course\",\"targetId\":\"course\"},{\"role\":\"tempo\",\"targetId\":\"tempo\"}]}--><p><br></p>".into() },
            NodeRecord { id: "video".into(), name: "Video".into(), node_type: "video".into(), parent_id: None, order: 2, content: "<!--hisfuture-nodal-meta:{\"version\":1,\"url\":\"https://example.com/video.mp4\"}--><p><br></p>".into() },
        ];
        save_nodes(&state, nodes.clone()).expect("save new nodal types");
        assert_eq!(list_nodes(&state).expect("list new nodal types"), nodes);
        close_project(&state).expect("close project");
        let reopened = open_project_from_path(project_path).expect("reopen Nodal project");
        let reopened_state = Mutex::new(Some(reopened));
        assert_eq!(
            list_nodes(&reopened_state).expect("list reopened Nodal types"),
            nodes
        );
        close_project(&reopened_state).expect("close reopened project");
        fs::remove_dir_all(root).expect("test cleanup");
    }

    #[test]
    fn repairs_legacy_links_foreign_key_without_losing_relationships() {
        let root = std::env::temp_dir().join(format!(
            "hisfuture-links-migration-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root");
        write_manifest(&root, "Links migration").expect("manifest");
        let database = root.join(DATABASE_FILE);
        let legacy = Connection::open(&database).expect("legacy database");
        legacy
            .execute_batch(
                "CREATE TABLE project_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE nodes (
                   id TEXT PRIMARY KEY,
                   name TEXT NOT NULL,
                   type TEXT NOT NULL CHECK(type IN ('categoria', 'pagina')),
                   parent_id TEXT,
                   sort_order INTEGER NOT NULL DEFAULT 0,
                   content TEXT NOT NULL DEFAULT '<p><br></p>',
                   FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
                 );
                 CREATE TABLE links (
                   from_node_id TEXT NOT NULL,
                   to_node_id TEXT NOT NULL,
                   PRIMARY KEY (from_node_id, to_node_id),
                   FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
                   FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
                 );
                 INSERT INTO nodes (id, name, type) VALUES ('a', 'A', 'pagina'), ('b', 'B', 'pagina');
                 INSERT INTO links VALUES ('a', 'b');
                 PRAGMA foreign_keys = OFF;
                 ALTER TABLE nodes RENAME TO nodes_legacy;
                 CREATE TABLE nodes (
                   id TEXT PRIMARY KEY,
                   name TEXT NOT NULL,
                   type TEXT NOT NULL CHECK(type IN ('categoria', 'pagina', 'imagen')),
                   parent_id TEXT,
                   sort_order INTEGER NOT NULL DEFAULT 0,
                   content TEXT NOT NULL DEFAULT '<p><br></p>',
                   FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
                 );
                 INSERT INTO nodes SELECT id, name, type, parent_id, sort_order, content FROM nodes_legacy;
                 DROP TABLE nodes_legacy;
                 PRAGMA foreign_keys = ON;",
            )
            .expect("create affected schema");
        drop(legacy);

        let (repaired, _) = init_database(&database).expect("repair database");
        let target: String = repaired
            .query_row(
                "SELECT \"table\" FROM pragma_foreign_key_list('links') WHERE \"from\" = 'from_node_id'",
                [],
                |row| row.get(0),
            )
            .expect("links foreign key");
        assert_eq!(target, "nodes");
        let count: i64 = repaired
            .query_row(
                "SELECT COUNT(*) FROM links WHERE from_node_id = 'a' AND to_node_id = 'b'",
                [],
                |row| row.get(0),
            )
            .expect("preserved relationship");
        assert_eq!(count, 1);
        let node_count: i64 = repaired
            .query_row(
                "SELECT COUNT(*) FROM nodes WHERE id IN ('a', 'b')",
                [],
                |row| row.get(0),
            )
            .expect("preserved nodes");
        assert_eq!(node_count, 2);
        drop(repaired);

        let (reopened, _) = init_database(&database).expect("already repaired database");
        let count: i64 = reopened
            .query_row("SELECT COUNT(*) FROM links", [], |row| row.get(0))
            .expect("relationship after second open");
        assert_eq!(count, 1);
        drop(reopened);
        fs::remove_dir_all(root).expect("test cleanup");
    }

    #[test]
    fn converts_existing_folder_without_modifying_or_opening_it() {
        let root = std::env::temp_dir().join(format!(
            "hisfuture-convert-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root");
        let source = root.join("Legacy Project");
        let created = create_project(root.to_string_lossy().into_owned(), "Legacy Project".into())
            .expect("create source project");
        let source_folder = created.working_folder.clone();
        drop(created);
        fs::write(source_folder.join("assets.txt"), b"original resource").expect("extra asset");
        let manifest_before = fs::read(manifest_path(&source_folder)).expect("manifest before");
        let database_before = fs::read(database_path(&source_folder)).expect("database before");
        let archive_path = root.join("Migrated.his");

        let result = convert_project_folder(
            source.to_string_lossy().into_owned(),
            archive_path.to_string_lossy().into_owned(),
        )
        .expect("convert source project");
        assert_eq!(result, archive_path.to_string_lossy());
        assert_eq!(
            fs::read(manifest_path(&source_folder)).expect("manifest after"),
            manifest_before
        );
        assert_eq!(
            fs::read(database_path(&source_folder)).expect("database after"),
            database_before
        );
        assert_eq!(
            fs::read(source_folder.join("assets.txt")).expect("extra asset after"),
            b"original resource"
        );

        let reopened = open_project_from_path(result).expect("open converted project");
        let state = Mutex::new(Some(reopened));
        let nodes = list_nodes(&state).expect("read converted sqlite");
        assert!(nodes.is_empty());
        close_project(&state).expect("close converted project");
        assert!(source.is_dir());
        fs::remove_dir_all(root).expect("test cleanup");
    }

    #[test]
    fn clean_archive_close_skips_repack_and_real_changes_mark_it_dirty() {
        let root = test_root("archive-dirty");
        let archive = root.join("Lifecycle.his");
        let state = Mutex::new(Some(
            create_project_file(archive.to_string_lossy().into_owned(), "Lifecycle".into())
                .expect("create archive"),
        ));
        assert!(!state.lock().unwrap().as_ref().unwrap().archive_dirty);
        close_project(&state).expect("close pristine archive");

        let reopened =
            open_project_from_path(archive.to_string_lossy().into_owned()).expect("reopen archive");
        let state = Mutex::new(Some(reopened));
        save_workspace(&state, vec![], None, None).expect("no-op snapshot");
        assert!(!state.lock().unwrap().as_ref().unwrap().archive_dirty);

        save_nodes(&state, vec![test_node("changed", "pagina", None)]).expect("small save");
        assert!(state.lock().unwrap().as_ref().unwrap().archive_dirty);
        close_project(&state).expect("package changed archive");
        assert!(archive.is_file());
        fs::remove_dir_all(root).expect("test cleanup");
    }

    #[test]
    #[ignore = "reproducible lifecycle benchmark; run explicitly with --ignored --nocapture"]
    fn lifecycle_benchmark_reports_phases() {
        use std::time::Instant;

        let root = test_root("lifecycle-benchmark");
        let archive = root.join("Benchmark.his");
        let started = Instant::now();
        let state = Mutex::new(Some(
            create_project_file(archive.to_string_lossy().into_owned(), "Benchmark".into())
                .expect("create benchmark archive"),
        ));
        let create_ms = started.elapsed().as_secs_f64() * 1000.0;
        let mut pdf = vec![0_u8; 12 * 1024 * 1024];
        pdf[..8].copy_from_slice(b"%PDF-1.7");
        let mut seed = 0x1234_5678_u32;
        for byte in &mut pdf[8..] {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            *byte = (seed >> 24) as u8;
        }
        store_project_resource(&state, "pdf".into(), "benchmark".into(), pdf)
            .expect("store representative PDF payload");
        close_project(&state).expect("close initial archive");

        let started = Instant::now();
        let opened = open_project_from_path(archive.to_string_lossy().into_owned())
            .expect("open benchmark archive");
        let open_ms = started.elapsed().as_secs_f64() * 1000.0;
        let state = Mutex::new(Some(opened));

        let started = Instant::now();
        save_workspace(&state, vec![], None, None).expect("save unchanged");
        let save_unchanged_ms = started.elapsed().as_secs_f64() * 1000.0;

        let started = Instant::now();
        save_nodes(&state, vec![test_node("page", "pagina", None)]).expect("save one change");
        let save_small_ms = started.elapsed().as_secs_f64() * 1000.0;

        let started = Instant::now();
        close_project(&state).expect("close dirty project");
        let close_dirty_ms = started.elapsed().as_secs_f64() * 1000.0;

        let opened = open_project_from_path(archive.to_string_lossy().into_owned())
            .expect("open for clean close");
        let state = Mutex::new(Some(opened));
        let started = Instant::now();
        close_project(&state).expect("close clean project");
        let close_clean_ms = started.elapsed().as_secs_f64() * 1000.0;

        println!(
            "LIFECYCLE_BENCHMARK_MS create={create_ms:.2} open={open_ms:.2} save_unchanged={save_unchanged_ms:.2} save_small={save_small_ms:.2} close_dirty={close_dirty_ms:.2} close_clean={close_clean_ms:.2}"
        );
        fs::remove_dir_all(root).expect("test cleanup");
    }
}
