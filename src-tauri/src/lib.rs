mod persistence;
mod project;

use project::{NodeRecord, ProjectInfo, ProjectState};
use std::sync::Mutex;

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
fn set_discord_presence(details: String, state: String) -> Result<(), String> {
    println!("[Discord RPC] details={details} state={state}");
    Ok(())
}

#[tauri::command]
fn clear_discord_presence() -> Result<(), String> {
    println!("[Discord RPC] cleared");
    Ok(())
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
fn convert_project_folder(source_folder: String, archive_path: String) -> Result<String, String> {
    project::convert_project_folder(source_folder, archive_path)
}

#[tauri::command]
fn open_project(path: String, state: tauri::State<ProjectState>) -> Result<ProjectInfo, String> {
    let opened = project::open_project_from_path(path)?;
    project::set_open_project(&state, opened)
}

#[tauri::command]
fn close_project(state: tauri::State<ProjectState>) -> Result<(), String> {
    project::close_project(&state)
}

#[tauri::command]
fn list_nodes(state: tauri::State<ProjectState>) -> Result<Vec<NodeRecord>, String> {
    project::list_nodes(&state)
}

#[tauri::command]
fn save_nodes(
    nodes: Vec<NodeRecord>,
    hidden_ids: Option<Vec<String>>,
    deleted_nodes: Option<String>,
    state: tauri::State<ProjectState>,
) -> Result<(), String> {
    project::save_workspace(&state, nodes, hidden_ids, deleted_nodes)
}

#[tauri::command]
fn store_project_resource(
    kind: String,
    resource_id: String,
    data: Vec<u8>,
    state: tauri::State<ProjectState>,
) -> Result<(), String> {
    project::store_project_resource(&state, kind, resource_id, data)
}

#[tauri::command]
fn read_project_resource(
    kind: String,
    resource_id: String,
    state: tauri::State<ProjectState>,
) -> Result<Vec<u8>, String> {
    project::read_project_resource(&state, kind, resource_id)
}

#[tauri::command]
fn delete_project_resource(
    kind: String,
    resource_id: String,
    state: tauri::State<ProjectState>,
) -> Result<(), String> {
    project::delete_project_resource(&state, kind, resource_id)
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
fn save_image_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, data).map_err(|error| format!("No se pudo guardar la imagen: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(windows)]
            {
                use tauri::Manager;
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
            Ok(())
        })
        .manage(Mutex::<Option<project::OpenProject>>::new(None))
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            set_discord_presence,
            clear_discord_presence,
            create_project,
            create_project_file,
            convert_project_folder,
            open_project,
            close_project,
            list_nodes,
            save_nodes,
            store_project_resource,
            read_project_resource,
            delete_project_resource,
            get_project_setting,
            set_project_setting,
            save_image_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
