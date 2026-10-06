mod archive_sync;
mod ai_conversation;
mod discord_presence;
mod image_migration;
mod local_ai_runtime;
mod persistence;
mod project;
mod spelling;
#[cfg(windows)]
mod windows_print;

use archive_sync::{ArchiveSyncManager, ArchiveSyncStatus};
use ai_conversation::{ConversationRecord, MessageRecord, NewMessage};
use discord_presence::{DiscordPresenceManager, PresenceActivity};
use local_ai_runtime::{LocalAIRuntimeConfig, LocalAIRuntimeManager, LocalAIRuntimeSnapshot};
use project::{
    CloseProjectTimings, EditorImageLayout, NodeContentChange, NodeRecord, ProjectInfo,
    ProjectState, SaveWorkspaceTimings, TagRecord, WorkspaceSnapshot,
};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

const AI_DIAGNOSTIC_PREFIX: &str = "__HIS_AI_EVENT__";

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AIDiagnosticEvent {
    timestamp: String,
    category: String,
    request_id: Option<String>,
    message: String,
    level: String,
    metadata: Option<serde_json::Value>,
    detail: Option<String>,
}

#[tauri::command]
fn emit_ai_diagnostic(event: AIDiagnosticEvent) -> Result<(), String> {
    const CATEGORIES: [&str; 31] = [
        "his",
        "lexicon",
        "scope",
        "memory",
        "resolve",
        "plan",
        "retrieval",
        "graph",
        "expand",
        "evidence",
        "context",
        "act",
        "route",
        "answer_spec",
        "draft",
        "validate",
        "repair",
        "nlg",
        "final",
        "model",
        "llama",
        "warn",
        "error",
        "chat",
        "semantic",
        "reference",
        "conversation_state",
        "memory_write",
        "memory_retrieve",
        "summary",
        "context_assembly",
    ];
    if !CATEGORIES.contains(&event.category.as_str()) {
        return Err("Categoría de diagnóstico de IA no válida.".into());
    }
    if !matches!(event.level.as_str(), "normal" | "debug") {
        return Err("Nivel de diagnóstico de IA no válido.".into());
    }
    if event.message.len() > 200 || event.request_id.as_ref().is_some_and(|id| id.len() > 12) {
        return Err("Evento de diagnóstico de IA demasiado largo.".into());
    }
    if event.detail.as_ref().is_some_and(|detail| detail.len() > 16_000) {
        return Err("Detalle de diagnóstico de IA demasiado largo.".into());
    }
    let serialized = serde_json::to_string(&event)
        .map_err(|error| format!("No se pudo serializar el diagnóstico de IA: {error}"))?;
    eprintln!("{AI_DIAGNOSTIC_PREFIX}{serialized}");
    Ok(())
}

struct LaunchProjectPath(Mutex<Option<String>>);

fn initial_his_path<I>(arguments: I) -> Option<String>
where
    I: IntoIterator<Item = std::ffi::OsString>,
{
    arguments.into_iter().find_map(|argument| {
        let path = std::path::PathBuf::from(argument);
        let is_his = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("his"));
        is_his.then(|| path.to_string_lossy().into_owned())
    })
}

fn launch_project_path() -> Option<String> {
    initial_his_path(std::env::args_os().skip(1))
}

#[tauri::command]
fn take_launch_project_path(state: tauri::State<LaunchProjectPath>) -> Option<String> {
    state.0.lock().ok()?.take()
}

#[cfg(windows)]
const PROJECT_FILE_ICON: &[u8] = include_bytes!("../icons/his-file.ico");

#[cfg(windows)]
fn register_his_file_association(app: &tauri::AppHandle) -> Result<(), String> {
    use std::fs;
    use std::ptr::null;
    use tauri::Manager;
    use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let icon_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("No se pudo localizar los datos de la aplicación: {error}"))?
        .join("his-file.ico");
    if let Some(parent) = icon_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("No se pudo preparar el icono de .his: {error}"))?;
    }
    fs::write(&icon_path, PROJECT_FILE_ICON)
        .map_err(|error| format!("No se pudo instalar el icono de .his: {error}"))?;
    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let (extension, _) = current_user
        .create_subkey("Software\\Classes\\.his")
        .map_err(|error| format!("No se pudo registrar la extensión .his: {error}"))?;
    extension
        .set_value("", &"HISFuture.Project")
        .map_err(|error| format!("No se pudo registrar la asociación .his: {error}"))?;

    let (project_class, _) = current_user
        .create_subkey("Software\\Classes\\HISFuture.Project")
        .map_err(|error| format!("No se pudo registrar el tipo de proyecto .his: {error}"))?;
    project_class
        .set_value("", &"H.I.S. Future Project")
        .map_err(|error| format!("No se pudo registrar el nombre del proyecto .his: {error}"))?;
    let (default_icon, _) = project_class
        .create_subkey("DefaultIcon")
        .map_err(|error| format!("No se pudo registrar el icono .his: {error}"))?;
    default_icon
        .set_value("", &format!("\"{}\",0", icon_path.display()))
        .map_err(|error| format!("No se pudo guardar el icono .his: {error}"))?;

    unsafe {
        SHChangeNotify(SHCNE_ASSOCCHANGED as i32, SHCNF_IDLIST, null(), null());
    }
    Ok(())
}

#[tauri::command]
fn set_discord_presence(
    activity: PresenceActivity,
    presence: tauri::State<DiscordPresenceManager>,
) {
    presence.set(activity);
}

#[tauri::command]
fn clear_discord_presence(presence: tauri::State<DiscordPresenceManager>) {
    presence.clear();
}

#[tauri::command]
fn create_project(
    parent_dir: String,
    name: String,
    state: tauri::State<ProjectState>,
) -> Result<ProjectInfo, String> {
    let opened = project::create_project(parent_dir, name)?;
    project::set_open_project(&state, opened)
}

#[tauri::command]
fn create_project_file(
    archive_path: String,
    name: String,
    state: tauri::State<ProjectState>,
) -> Result<ProjectInfo, String> {
    let created = project::create_project_file(archive_path, name)?;
    project::set_open_project(&state, created)
}

#[tauri::command]
fn create_dev_project(state: tauri::State<ProjectState>) -> Result<ProjectInfo, String> {
    #[cfg(not(debug_assertions))]
    {
        let _ = state;
        return Err(
            "Inicio Rápido DEV solo está disponible en compilaciones de desarrollo.".into(),
        );
    }

    #[cfg(debug_assertions)]
    {
        let parent = std::env::temp_dir().join(format!("hisfuture-dev-{}", std::process::id()));
        std::fs::create_dir_all(&parent)
            .map_err(|error| format!("No se pudo preparar el baúl DEV: {error}"))?;
        let folder = parent.join("DEV");
        let opened = if folder.exists() {
            project::open_project_from_path(folder.to_string_lossy().into_owned())?
        } else {
            project::create_project(parent.to_string_lossy().into_owned(), "DEV".into())?
        };
        project::set_open_project(&state, opened)
    }
}

#[tauri::command]
fn convert_project_folder(source_folder: String, archive_path: String) -> Result<String, String> {
    project::convert_project_folder(source_folder, archive_path)
}

#[tauri::command]
fn open_project(
    path: String,
    state: tauri::State<ProjectState>,
    archive_sync: tauri::State<ArchiveSyncManager>,
) -> Result<ProjectInfo, String> {
    let selected = std::path::PathBuf::from(path.trim());
    if selected
        .extension()
        .and_then(|extension| extension.to_str())
        == Some("his")
    {
        archive_sync.wait_for_vault(&selected)?;
    }
    let opened = project::open_project_from_path(path)?;
    project::set_open_project(&state, opened)
}

#[tauri::command]
fn close_project(
    trace_id: Option<String>,
    state: tauri::State<ProjectState>,
    archive_sync: tauri::State<ArchiveSyncManager>,
) -> Result<CloseProjectTimings, String> {
    project::close_project_background_traced(&state, &archive_sync, trace_id.as_deref())
}

#[tauri::command]
fn current_project(state: tauri::State<ProjectState>) -> Result<Option<ProjectInfo>, String> {
    project::current_project(&state)
}

#[tauri::command]
async fn exit_application(
    app: tauri::AppHandle,
    state: tauri::State<'_, ProjectState>,
    archive_sync: tauri::State<'_, ArchiveSyncManager>,
    presence: tauri::State<'_, DiscordPresenceManager>,
    local_ai: tauri::State<'_, LocalAIRuntimeManager>,
) -> Result<(), String> {
    let reopen = project::current_project(&state)?;
    project::close_project_background_traced(&state, &archive_sync, Some("application-exit"))?;
    let drain_started = std::time::Instant::now();
    if let Err(error) = archive_sync.drain() {
        if let Some(info) = reopen {
            if let Ok(opened) = project::open_project_from_path(info.folder_path) {
                let _ = project::set_open_project(&state, opened);
            }
        }
        return Err(error);
    }
    eprintln!(
        "[lifecycle] application.exit archive_queue_drain={:.2}ms exit_ready=true",
        drain_started.elapsed().as_secs_f64() * 1000.0
    );
    if let Err(error) = local_ai.shutdown().await {
        eprintln!(
            "[local-ai] fallo durante el cierre administrado: {} {}",
            error.message,
            error.detail.unwrap_or_default()
        );
    }
    presence.shutdown();
    app.remove_tray_by_id("main-tray");
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn ensure_local_ai_server(
    app: tauri::AppHandle,
    config: LocalAIRuntimeConfig,
    runtime: tauri::State<'_, LocalAIRuntimeManager>,
) -> Result<LocalAIRuntimeSnapshot, local_ai_runtime::LocalAIRuntimeError> {
    runtime.ensure(&app, config).await
}

#[tauri::command]
fn archive_sync_status(
    archive_sync: tauri::State<ArchiveSyncManager>,
) -> Result<Vec<ArchiveSyncStatus>, String> {
    archive_sync.statuses()
}

#[tauri::command]
fn list_nodes(
    default_node_type: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<Vec<NodeRecord>, String> {
    match default_node_type.as_deref() {
        Some(node_type) => project::list_nodes_with_default(&state, Some(node_type)),
        None => project::list_nodes(&state),
    }
}

#[tauri::command]
fn load_workspace_snapshot(
    default_node_type: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<WorkspaceSnapshot, String> {
    project::load_workspace_snapshot(&state, default_node_type.as_deref())
}

#[tauri::command]
fn save_nodes(
    nodes: Vec<NodeRecord>,
    node_tags: Option<(String, Vec<String>)>,
    hidden_ids: Option<Vec<String>>,
    deleted_nodes: Option<String>,
    trace_id: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<SaveWorkspaceTimings, String> {
    project::save_workspace_traced(
        &state,
        nodes,
        hidden_ids,
        deleted_nodes,
        trace_id.as_deref(),
        node_tags,
    )
}

#[tauri::command]
fn save_node_contents(
    changes: Vec<NodeContentChange>,
    trace_id: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<SaveWorkspaceTimings, String> {
    project::save_node_contents_traced(&state, changes, trace_id.as_deref())
}

#[tauri::command]
fn list_editor_image_layouts(
    node_id: String,
    state: tauri::State<ProjectState>,
) -> Result<Vec<EditorImageLayout>, String> {
    project::list_editor_image_layouts(&state, &node_id)
}

#[tauri::command]
fn save_editor_image_layout(
    node_id: String,
    block_id: String,
    width: f64,
    state: tauri::State<ProjectState>,
) -> Result<(), String> {
    project::save_editor_image_layout(
        &state,
        EditorImageLayout {
            node_id,
            block_id,
            width,
        },
    )
}

#[tauri::command]
fn list_tags(state: tauri::State<ProjectState>) -> Result<Vec<TagRecord>, String> {
    project::list_tags(&state)
}

#[tauri::command]
fn list_node_tags(
    node_id: String,
    state: tauri::State<ProjectState>,
) -> Result<Vec<TagRecord>, String> {
    project::list_node_tags(&state, &node_id)
}

#[tauri::command]
fn create_tag(
    id: String,
    name: String,
    color: String,
    state: tauri::State<ProjectState>,
) -> Result<TagRecord, String> {
    project::create_tag(&state, id, name, color)
}

#[tauri::command]
fn update_tag(
    id: String,
    name: String,
    color: String,
    state: tauri::State<ProjectState>,
) -> Result<TagRecord, String> {
    project::update_tag(&state, id, name, color)
}

#[tauri::command]
fn delete_tag(id: String, state: tauri::State<ProjectState>) -> Result<(), String> {
    project::delete_tag(&state, id)
}

#[tauri::command]
fn set_node_tag(
    node_id: String,
    tag_id: String,
    assigned: bool,
    state: tauri::State<ProjectState>,
) -> Result<(), String> {
    project::set_node_tag(&state, node_id, tag_id, assigned)
}

#[tauri::command]
fn reorder_tags(ids: Vec<String>, state: tauri::State<ProjectState>) -> Result<(), String> {
    project::reorder_tags(&state, ids)
}

#[tauri::command]
fn store_project_resource(
    kind: String,
    resource_id: String,
    data: Vec<u8>,
    extension: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<project::StoredProjectResource, String> {
    project::store_project_resource_with_extension(&state, kind, resource_id, data, extension)
}

#[tauri::command]
fn read_project_resource(
    kind: String,
    resource_id: String,
    extension: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<tauri::ipc::Response, String> {
    project::read_project_resource_with_extension(&state, kind, resource_id, extension).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn delete_project_resource(
    kind: String,
    resource_id: String,
    extension: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<(), String> {
    project::delete_project_resource_with_extension(&state, kind, resource_id, extension)
}

#[tauri::command]
fn project_resource_exists(
    kind: String,
    resource_id: String,
    extension: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<bool, String> {
    project::project_resource_exists(&state, kind, resource_id, extension)
}

#[tauri::command]
fn analyze_legacy_image_migration(
    state: tauri::State<ProjectState>,
) -> Result<image_migration::ImageMigrationPlan, String> {
    image_migration::analyze(&state)
}

#[tauri::command]
fn migrate_legacy_images(
    plan: image_migration::ImageMigrationPlan,
    app: tauri::AppHandle,
    state: tauri::State<ProjectState>,
    cancellation: tauri::State<image_migration::MigrationCancellation>,
) -> Result<image_migration::ImageMigrationResult, String> {
    cancellation.reset();
    image_migration::execute(&state, plan, |progress| {
        let _ = app.emit("image-migration-progress", progress);
    }, || cancellation.requested())
}

#[tauri::command]
fn cancel_legacy_image_migration(
    cancellation: tauri::State<image_migration::MigrationCancellation>,
) {
    cancellation.cancel();
}

#[tauri::command]
fn get_project_setting(
    key: String,
    state: tauri::State<ProjectState>,
) -> Result<Option<String>, String> {
    project::get_project_setting(&state, key)
}

#[tauri::command]
fn set_project_setting(
    key: String,
    value: String,
    state: tauri::State<ProjectState>,
) -> Result<(), String> {
    project::set_project_setting(&state, key, value)
}

#[tauri::command]
fn list_ai_conversations(include_archived: bool, limit: u32, state: tauri::State<ProjectState>) -> Result<Vec<ConversationRecord>, String> {
    ai_conversation::list_conversations(&state, include_archived, limit)
}

#[tauri::command]
fn create_ai_conversation(id: String, project_id: Option<String>, vault_id: Option<String>, title: String, now: String, state: tauri::State<ProjectState>) -> Result<ConversationRecord, String> {
    ai_conversation::create_conversation(&state, id, project_id, vault_id, title, now)
}

#[tauri::command]
fn rename_ai_conversation(id: String, title: String, now: String, state: tauri::State<ProjectState>) -> Result<(), String> {
    ai_conversation::rename_conversation(&state, id, title, now)
}

#[tauri::command]
fn archive_ai_conversation(id: String, archived: bool, now: String, state: tauri::State<ProjectState>) -> Result<(), String> {
    ai_conversation::archive_conversation(&state, id, archived, now)
}

#[tauri::command]
fn delete_ai_conversation(id: String, state: tauri::State<ProjectState>) -> Result<(), String> {
    ai_conversation::delete_conversation(&state, id)
}

#[tauri::command]
fn append_ai_message(message: NewMessage, state: tauri::State<ProjectState>) -> Result<MessageRecord, String> {
    ai_conversation::append_message(&state, message)
}

#[tauri::command]
fn list_ai_messages(conversation_id: String, before_sequence: Option<i64>, limit: u32, state: tauri::State<ProjectState>) -> Result<Vec<MessageRecord>, String> {
    ai_conversation::list_messages(&state, conversation_id, before_sequence, limit)
}

#[tauri::command]
fn list_ai_message_range(conversation_id: String, start: i64, end: i64, limit: u32, state: tauri::State<ProjectState>) -> Result<Vec<MessageRecord>, String> {
    ai_conversation::list_message_range(&state, conversation_id, start, end, limit)
}

#[tauri::command]
fn ai_messages_around(conversation_id: String, message_id: String, radius: u32, state: tauri::State<ProjectState>) -> Result<Vec<MessageRecord>, String> {
    ai_conversation::messages_around(&state, conversation_id, message_id, radius)
}

#[tauri::command]
fn search_ai_messages(conversation_id: String, query: String, limit: u32, state: tauri::State<ProjectState>) -> Result<Vec<MessageRecord>, String> {
    ai_conversation::search_messages(&state, conversation_id, query, limit)
}

#[tauri::command]
fn save_ai_conversation_state(conversation_id: String, state_json: serde_json::Value, now: String, state: tauri::State<ProjectState>) -> Result<(), String> {
    ai_conversation::save_conversation_state(&state, conversation_id, state_json, now)
}

#[tauri::command]
fn load_ai_conversation_state(conversation_id: String, state: tauri::State<ProjectState>) -> Result<Option<serde_json::Value>, String> {
    ai_conversation::load_conversation_state(&state, conversation_id)
}

#[tauri::command]
fn save_ai_semantic_mentions(mentions: Vec<serde_json::Value>, state: tauri::State<ProjectState>) -> Result<(), String> {
    ai_conversation::save_semantic_mentions(&state, mentions)
}

#[tauri::command]
fn save_ai_memory_records(records: Vec<serde_json::Value>, state: tauri::State<ProjectState>) -> Result<(), String> {
    ai_conversation::save_memory_records(&state, records)
}

#[tauri::command]
fn list_ai_memory_records(conversation_id: String, now: String, limit: u32, state: tauri::State<ProjectState>) -> Result<Vec<serde_json::Value>, String> {
    ai_conversation::list_memory_records(&state, conversation_id, now, limit)
}

#[tauri::command]
fn save_ai_conversation_summary(summary: serde_json::Value, state: tauri::State<ProjectState>) -> Result<(), String> {
    ai_conversation::save_summary(&state, summary)
}

#[tauri::command]
fn load_ai_conversation_summary(conversation_id: String, state: tauri::State<ProjectState>) -> Result<Option<serde_json::Value>, String> {
    ai_conversation::load_latest_summary(&state, conversation_id)
}

#[tauri::command]
fn save_image_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, data).map_err(|error| format!("No se pudo guardar la imagen: {error}"))
}

#[tauri::command]
#[cfg(windows)]
async fn print_webview_to_pdf(
    window: tauri::WebviewWindow,
    settings: windows_print::PdfPrintSettings,
) -> Result<Vec<u8>, String> {
    windows_print::print_webview_to_pdf(window, settings).await
}

#[cfg(not(windows))]
#[tauri::command]
fn print_webview_to_pdf() -> Result<Vec<u8>, String> {
    Err("La exportacion PDF HTML/CSS esta implementada actualmente solo para Windows.".to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::{
                menu::{Menu, MenuItem},
                tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
            };

            let open = MenuItem::with_id(app, "open", "Abrir H.I.S. Future", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &exit])?;
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().expect("application icon").clone())
                .tooltip("H.I.S. Future")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "exit" => {
                        if let Err(error) = app.emit("app-exit-requested", ()) {
                            eprintln!("No se pudo solicitar la salida segura: {error}");
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            #[cfg(windows)]
            {
                use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;

                const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
                const DWMWCP_DONOTROUND: u32 = 1;

                if let Some(window) = app.get_webview_window("main") {
                    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
                    let preference = DWMWCP_DONOTROUND;
                    let result = unsafe {
                        DwmSetWindowAttribute(
                            hwnd.0 as _,
                            DWMWA_WINDOW_CORNER_PREFERENCE,
                            &preference as *const u32 as _,
                            std::mem::size_of::<u32>() as u32,
                        )
                    };
                    if result != 0 {
                        return Err(format!(
                            "No se pudo desactivar el redondeo de la ventana: {result}"
                        )
                        .into());
                    }
                }
                register_his_file_association(app.handle())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            let event_app = app.handle().clone();
            app.manage(ArchiveSyncManager::new(
                Arc::new(|job| project::zip_directory(&job.working_folder, &job.archive_path)),
                Arc::new(move |status| {
                    let _ = event_app.emit("archive-sync-status", status);
                }),
            ));
            Ok(())
        })
        .manage(Mutex::<Option<project::OpenProject>>::new(None))
        .manage(LaunchProjectPath(Mutex::new(launch_project_path())))
        .manage(image_migration::MigrationCancellation::default())
        .manage(LocalAIRuntimeManager::new())
        .manage(DiscordPresenceManager::new())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            spelling::get_spelling_suggestions,
            spelling::add_spelling_word,
            set_discord_presence,
            clear_discord_presence,
            take_launch_project_path,
            create_project,
            create_project_file,
            create_dev_project,
            convert_project_folder,
            open_project,
            close_project,
            current_project,
            exit_application,
            ensure_local_ai_server,
            emit_ai_diagnostic,
            list_ai_conversations,
            create_ai_conversation,
            rename_ai_conversation,
            archive_ai_conversation,
            delete_ai_conversation,
            append_ai_message,
            list_ai_messages,
            list_ai_message_range,
            ai_messages_around,
            search_ai_messages,
            save_ai_conversation_state,
            load_ai_conversation_state,
            save_ai_semantic_mentions,
            save_ai_memory_records,
            list_ai_memory_records,
            save_ai_conversation_summary,
            load_ai_conversation_summary,
            archive_sync_status,
            list_nodes,
            load_workspace_snapshot,
            save_nodes,
            save_node_contents,
            list_editor_image_layouts,
            save_editor_image_layout,
            list_tags,
            list_node_tags,
            create_tag,
            update_tag,
            delete_tag,
            set_node_tag,
            reorder_tags,
            store_project_resource,
            read_project_resource,
            delete_project_resource,
            project_resource_exists,
            analyze_legacy_image_migration,
            migrate_legacy_images,
            cancel_legacy_image_migration,
            get_project_setting,
            set_project_setting,
            save_image_file,
            print_webview_to_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::initial_his_path;
    use std::ffi::OsString;

    #[test]
    fn selects_a_his_argument_case_insensitively() {
        let arguments = ["--some-flag", r"C:\Vaults\MiVault.HIS", "notes.txt"]
            .into_iter()
            .map(OsString::from);

        assert_eq!(
            initial_his_path(arguments),
            Some(r"C:\Vaults\MiVault.HIS".to_owned())
        );
    }
}
