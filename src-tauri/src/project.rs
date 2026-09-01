use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const PROJECT_ICON: &[u8] = include_bytes!("../icons/HISProject.ico");
const PROJECT_ICON_NAME: &str = "HISProject.ico";

pub const MANIFEST_FILE: &str = "hisfuture.project.json";
pub const DATABASE_FILE: &str = "lore.sqlite";
pub const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('categoria', 'pagina', 'imagen', 'calendario', 'tempo')),
  parent_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '<p><br></p>',
  FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS links (
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  PRIMARY KEY (from_node_id, to_node_id),
  FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
"#;

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
}

pub type ProjectState = Mutex<Option<OpenProject>>;

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

fn init_database(path: &Path) -> Result<Connection, String> {
    let mut db = Connection::open(path).map_err(|err| format!("No se pudo abrir SQLite: {err}"))?;
    db.execute_batch(SCHEMA)
        .map_err(|err| format!("No se pudo inicializar el esquema: {err}"))?;
    let schema: String = db
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'nodes'",
            [],
            |row| row.get(0),
        )
        .map_err(|err| format!("No se pudo comprobar el esquema de nodos: {err}"))?;
    if !schema.contains("'calendario'") || !schema.contains("'tempo'") {
        db.execute_batch(
            "PRAGMA foreign_keys = OFF;
                         BEGIN;
                         CREATE TABLE nodes_new (
               id TEXT PRIMARY KEY,
               name TEXT NOT NULL,
               type TEXT NOT NULL CHECK(type IN ('categoria', 'pagina', 'imagen', 'calendario', 'tempo')),
               parent_id TEXT,
               sort_order INTEGER NOT NULL DEFAULT 0,
               content TEXT NOT NULL DEFAULT '<p><br></p>',
               FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
             );
                         INSERT INTO nodes_new (id, name, type, parent_id, sort_order, content)
                             SELECT id, name, type, parent_id, sort_order, content FROM nodes;
                         DROP TABLE nodes;
                         ALTER TABLE nodes_new RENAME TO nodes;
                         COMMIT;
                         PRAGMA foreign_keys = ON;",
        )
        .map_err(|err| format!("No se pudo actualizar el esquema de nodos: {err}"))?;
    }
        repair_links_foreign_key(&mut db)?;
    Ok(db)
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
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let folder = std::env::temp_dir().join(format!("hisfuture-project-{suffix}"));
    fs::create_dir_all(&folder)
        .map_err(|err| format!("No se pudo crear el espacio temporal del proyecto: {err}"))?;
    Ok(folder)
}

fn zip_directory(folder: &Path, archive_path: &Path) -> Result<(), String> {
    let file = fs::File::create(archive_path)
        .map_err(|err| format!("No se pudo crear el archivo .his: {err}"))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
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
            writer
                .start_file(name, options)
                .map_err(|err| format!("No se pudo añadir el archivo al .his: {err}"))?;
            let mut input = fs::File::open(&path)
                .map_err(|err| format!("No se pudo abrir un archivo del proyecto: {err}"))?;
            let mut buffer = Vec::new();
            input
                .read_to_end(&mut buffer)
                .map_err(|err| format!("No se pudo leer un archivo del proyecto: {err}"))?;
            writer
                .write_all(&buffer)
                .map_err(|err| format!("No se pudo escribir el archivo .his: {err}"))?;
        }
    }
    if !folder.join(PROJECT_ICON_NAME).is_file()
        && !written_entries.contains(PROJECT_ICON_NAME)
    {
        writer
            .start_file(PROJECT_ICON_NAME, options)
            .map_err(|err| format!("No se pudo añadir el icono al .his: {err}"))?;
        writer
            .write_all(PROJECT_ICON)
            .map_err(|err| format!("No se pudo escribir el icono del .his: {err}"))?;
    }
    writer
        .finish()
        .map_err(|err| format!("No se pudo cerrar el archivo .his: {err}"))?;
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
        let relative = Path::new(entry.name());
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| component == std::path::Component::ParentDir)
        {
            return Err("El proyecto .his contiene una ruta insegura.".into());
        }
        let output = folder.join(relative);
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
            "No se encontró {DATABASE_FILE} en esa carpeta. Elige un proyecto de HIS Future."
        ));
    }
    let name = read_manifest_name(folder).unwrap_or_else(|| {
        folder
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Proyecto".into())
    });
    let db = init_database(&db_path)?;
    Ok(OpenProject {
        info: project_info(name, folder),
        db,
        archive_path: None,
        working_folder: folder.to_path_buf(),
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
    let db = init_database(&db_path)?;
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
    let db = init_database(&working_folder.join(DATABASE_FILE))?;
    Ok(OpenProject {
        info: archive_project_info(project_name, &archive, &working_folder),
        db,
        archive_path: Some(archive),
        working_folder,
    })
}

pub fn open_project_from_path(path: String) -> Result<OpenProject, String> {
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
        let extracted_root = extract_archive(&selected)?;
        let opened = open_folder(&extracted_root)?;
        let name = opened.info.name.clone();
        return Ok(OpenProject {
            info: archive_project_info(name, &selected, &extracted_root),
            db: opened.db,
            archive_path: Some(selected),
            working_folder: extracted_root,
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
    *guard = Some(project);
    Ok(info)
}

pub fn close_project(state: &ProjectState) -> Result<(), String> {
    let mut guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    if let Some(project) = guard.as_ref() {
        if let Some(archive_path) = project.archive_path.as_ref() {
            zip_directory(&project.working_folder, archive_path)?;
        }
    }
    if let Some(project) = guard.take() {
        if project.archive_path.is_some() {
            remove_temporary_folder(&project.working_folder);
        }
    }
    Ok(())
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

pub fn save_nodes(state: &ProjectState, nodes: Vec<NodeRecord>) -> Result<(), String> {
    let mut guard = state
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del proyecto.".to_string())?;
    let project = guard.as_mut().ok_or("No hay un proyecto abierto.")?;
    let tx = project
        .db
        .transaction()
        .map_err(|err| format!("No se pudo iniciar la transacción: {err}"))?;
    tx.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|err| format!("No se pudieron desactivar las claves foráneas: {err}"))?;
    tx.execute("DELETE FROM links", [])
        .map_err(|err| format!("No se pudieron limpiar los enlaces: {err}"))?;
    tx.execute("DELETE FROM nodes", [])
        .map_err(|err| format!("No se pudieron limpiar los nodos: {err}"))?;
    {
        let mut insert = tx
            .prepare(
                "INSERT INTO nodes (id, name, type, parent_id, sort_order, content)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|err| format!("No se pudo preparar el guardado: {err}"))?;
        for node in nodes {
            if !["categoria", "pagina", "imagen", "calendario", "tempo"]
                .contains(&node.node_type.as_str())
            {
                return Err(format!("Tipo de nodo no válido: {}", node.node_type));
            }
            insert
                .execute(params![
                    node.id,
                    node.name,
                    node.node_type,
                    node.parent_id,
                    node.order,
                    node.content,
                ])
                .map_err(|err| format!("No se pudo guardar el nodo {}: {err}", node.id))?;
        }
    }
    tx.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|err| format!("No se pudieron reactivar las claves foráneas: {err}"))?;
    tx.commit()
        .map_err(|err| format!("No se pudo confirmar el guardado: {err}"))?;
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
        close_project(&reopened_state).expect("close reopened project");
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
        assert!(archive.by_name(PROJECT_ICON_NAME).is_ok());

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
        assert_eq!(list_nodes(&reopened_state).expect("read saved content"), expected);
        close_project(&reopened_state).expect("close reopened archive");
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

        let repaired = init_database(&database).expect("repair database");
        let target: String = repaired
            .query_row(
                "SELECT \"table\" FROM pragma_foreign_key_list('links') WHERE \"from\" = 'from_node_id'",
                [],
                |row| row.get(0),
            )
            .expect("links foreign key");
        assert_eq!(target, "nodes");
        let count: i64 = repaired
            .query_row("SELECT COUNT(*) FROM links WHERE from_node_id = 'a' AND to_node_id = 'b'", [], |row| row.get(0))
            .expect("preserved relationship");
        assert_eq!(count, 1);
        let node_count: i64 = repaired
            .query_row("SELECT COUNT(*) FROM nodes WHERE id IN ('a', 'b')", [], |row| row.get(0))
            .expect("preserved nodes");
        assert_eq!(node_count, 2);
        drop(repaired);

        let reopened = init_database(&database).expect("already repaired database");
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
}
