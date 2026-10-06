use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Manager;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    sync::Mutex as AsyncMutex,
    time::{sleep, timeout},
};

const STDERR_TAIL_LINES: usize = 40;
const SHUTDOWN_GRACE: Duration = Duration::from_secs(4);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAIRuntimeConfig {
    pub base_url: String,
    pub executable_path: String,
    pub model_path: String,
    pub startup_timeout_ms: u64,
    pub polling_interval_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAIRuntimeSnapshot {
    state: &'static str,
    ownership: Option<&'static str>,
    pid: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAIRuntimeError {
    pub code: &'static str,
    pub message: String,
    pub detail: Option<String>,
}

impl LocalAIRuntimeError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    fn with_detail(mut self, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        if !detail.trim().is_empty() {
            self.detail = Some(detail);
        }
        self
    }
}

#[derive(Clone, Copy, Debug)]
enum Ownership {
    External,
    His,
}

#[derive(Debug)]
enum RuntimePhase {
    Stopped,
    Starting,
    Ready(Ownership),
    Stopping,
    Error,
}

struct RuntimeInner {
    phase: RuntimePhase,
    child: Option<Child>,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
}

impl Default for RuntimeInner {
    fn default() -> Self {
        Self {
            phase: RuntimePhase::Stopped,
            child: None,
            stderr_tail: Arc::new(Mutex::new(VecDeque::with_capacity(STDERR_TAIL_LINES))),
        }
    }
}

pub struct LocalAIRuntimeManager {
    inner: AsyncMutex<RuntimeInner>,
    http: reqwest::Client,
}

impl LocalAIRuntimeManager {
    pub fn new() -> Self {
        Self {
            inner: AsyncMutex::new(RuntimeInner::default()),
            http: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(2))
                .timeout(Duration::from_secs(3))
                .build()
                .expect("valid local AI HTTP client"),
        }
    }

    pub async fn ensure(
        &self,
        app: &tauri::AppHandle,
        config: LocalAIRuntimeConfig,
    ) -> Result<LocalAIRuntimeSnapshot, LocalAIRuntimeError> {
        self.ensure_internal(Some(app), config).await
    }

    async fn ensure_internal(
        &self,
        app: Option<&tauri::AppHandle>,
        config: LocalAIRuntimeConfig,
    ) -> Result<LocalAIRuntimeSnapshot, LocalAIRuntimeError> {
        let endpoint = validate_config(&config)?;
        let mut inner = self.inner.lock().await;

        if let Some(child) = inner.child.as_mut() {
            if let Some(status) = child.try_wait().map_err(|error| {
                LocalAIRuntimeError::new(
                    "process_status_failed",
                    "No se pudo comprobar el estado de llama-server.",
                )
                .with_detail(error.to_string())
            })? {
                inner.child = None;
                inner.phase = RuntimePhase::Error;
                eprintln!("[local-ai] llama-server administrado terminó: {status}");
            }
        }

        match self.probe(&endpoint).await {
            ProbeResult::Ready => {
                let ownership = if inner.child.is_some() {
                    Ownership::His
                } else {
                    Ownership::External
                };
                inner.phase = RuntimePhase::Ready(ownership);
                return Ok(snapshot(&inner));
            }
            ProbeResult::Loading if inner.child.is_none() => {
                inner.phase = RuntimePhase::Starting;
                return self
                    .wait_until_ready(&mut inner, &endpoint, &config, Ownership::External)
                    .await;
            }
            ProbeResult::Occupied(detail) if inner.child.is_none() => {
                inner.phase = RuntimePhase::Error;
                return Err(LocalAIRuntimeError::new(
                    "port_occupied",
                    format!(
                        "El puerto {} está ocupado por un servicio que no parece ser llama-server.",
                        endpoint.port
                    ),
                )
                .with_detail(detail));
            }
            ProbeResult::Loading | ProbeResult::Unavailable | ProbeResult::Occupied(_) => {}
        }

        if inner.child.is_some() {
            inner.phase = RuntimePhase::Starting;
            return self
                .wait_until_ready(&mut inner, &endpoint, &config, Ownership::His)
                .await;
        }

        let executable = resolve_existing_path(app, &config.executable_path).ok_or_else(|| {
            LocalAIRuntimeError::new(
                "executable_missing",
                "No se encontró el ejecutable configurado de llama-server.",
            )
            .with_detail(config.executable_path.clone())
        })?;
        let model = resolve_existing_path(app, &config.model_path).ok_or_else(|| {
            LocalAIRuntimeError::new(
                "model_missing",
                "No se encontró el modelo GGUF configurado.",
            )
            .with_detail(config.model_path.clone())
        })?;

        inner.stderr_tail = Arc::new(Mutex::new(VecDeque::with_capacity(STDERR_TAIL_LINES)));
        inner.phase = RuntimePhase::Starting;
        let mut command = Command::new(&executable);
        command
            .arg("--model")
            .arg(&model)
            .arg("--host")
            .arg(&endpoint.host)
            .arg("--port")
            .arg(endpoint.port.to_string())
            .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command.spawn().map_err(|error| {
            inner.phase = RuntimePhase::Error;
            LocalAIRuntimeError::new("launch_failed", "No se pudo iniciar llama-server.")
                .with_detail(error.to_string())
        })?;
        if let Some(stderr) = child.stderr.take() {
            capture_stderr(stderr, Arc::clone(&inner.stderr_tail));
        }
        eprintln!(
            "[local-ai] llama-server iniciado por H.I.S. pid={:?} model={}",
            child.id(),
            model.display()
        );
        inner.child = Some(child);

        self.wait_until_ready(&mut inner, &endpoint, &config, Ownership::His)
            .await
    }

    pub async fn shutdown(&self) -> Result<(), LocalAIRuntimeError> {
        let mut inner = self.inner.lock().await;
        if inner.child.is_none() {
            inner.phase = RuntimePhase::Stopped;
            return Ok(());
        }
        inner.phase = RuntimePhase::Stopping;
        let mut child = inner.child.take().expect("checked managed child");
        let pid = child.id();

        if let Some(pid) = pid {
            request_graceful_termination(pid).await;
        }

        match timeout(SHUTDOWN_GRACE, child.wait()).await {
            Ok(Ok(status)) => {
                eprintln!("[local-ai] llama-server terminó durante el cierre: {status}");
            }
            Ok(Err(error)) => {
                let _ = child.kill().await;
                inner.phase = RuntimePhase::Stopped;
                return Err(LocalAIRuntimeError::new(
                    "shutdown_failed",
                    "No se pudo confirmar el cierre de llama-server.",
                )
                .with_detail(error.to_string()));
            }
            Err(_) => {
                eprintln!("[local-ai] llama-server no terminó a tiempo; aplicando cierre forzado");
                child.kill().await.map_err(|error| {
                    LocalAIRuntimeError::new(
                        "shutdown_failed",
                        "No se pudo forzar el cierre de llama-server.",
                    )
                    .with_detail(error.to_string())
                })?;
                let _ = child.wait().await;
            }
        }
        inner.phase = RuntimePhase::Stopped;
        Ok(())
    }

    async fn wait_until_ready(
        &self,
        inner: &mut RuntimeInner,
        endpoint: &ValidatedEndpoint,
        config: &LocalAIRuntimeConfig,
        ownership: Ownership,
    ) -> Result<LocalAIRuntimeSnapshot, LocalAIRuntimeError> {
        let deadline = Instant::now() + Duration::from_millis(config.startup_timeout_ms);
        let poll_interval = Duration::from_millis(config.polling_interval_ms);

        loop {
            if let Some(child) = inner.child.as_mut() {
                if let Some(status) = child.try_wait().map_err(|error| {
                    LocalAIRuntimeError::new(
                        "process_status_failed",
                        "No se pudo comprobar el estado de llama-server.",
                    )
                    .with_detail(error.to_string())
                })? {
                    inner.child = None;
                    inner.phase = RuntimePhase::Error;
                    let detail = stderr_tail(&inner.stderr_tail);
                    return Err(LocalAIRuntimeError::new(
                        "process_exited",
                        format!("llama-server terminó durante el arranque ({status})."),
                    )
                    .with_detail(detail));
                }
            }

            match self.probe(endpoint).await {
                ProbeResult::Ready => {
                    inner.phase = RuntimePhase::Ready(ownership);
                    return Ok(snapshot(inner));
                }
                ProbeResult::Occupied(detail) => {
                    if inner.child.is_some() {
                        stop_managed_child(inner).await;
                    }
                    inner.phase = RuntimePhase::Error;
                    return Err(LocalAIRuntimeError::new(
                        "port_occupied",
                        "El endpoint local respondió, pero no se identificó como llama-server.",
                    )
                    .with_detail(detail));
                }
                ProbeResult::Loading | ProbeResult::Unavailable => {}
            }

            if Instant::now() >= deadline {
                if inner.child.is_some() {
                    stop_managed_child(inner).await;
                }
                inner.phase = RuntimePhase::Error;
                return Err(LocalAIRuntimeError::new(
                    "readiness_timeout",
                    "llama-server no alcanzó el estado listo dentro del tiempo permitido.",
                )
                .with_detail(stderr_tail(&inner.stderr_tail)));
            }
            sleep(poll_interval).await;
        }
    }

    async fn probe(&self, endpoint: &ValidatedEndpoint) -> ProbeResult {
        let response = match self.http.get(&endpoint.health_url).send().await {
            Ok(response) => response,
            Err(error) if error.is_connect() => return ProbeResult::Unavailable,
            Err(error) => return ProbeResult::Occupied(error.to_string()),
        };
        let status_code = response.status();
        let body = match response.text().await {
            Ok(body) => body,
            Err(error) => return ProbeResult::Occupied(error.to_string()),
        };
        let parsed = serde_json::from_str::<serde_json::Value>(&body).ok();
        let status = parsed.as_ref().and_then(|value| {
            value
                .get("status")
                .and_then(serde_json::Value::as_str)
                .or_else(|| {
                    value
                        .get("error")
                        .and_then(|error| error.get("message"))
                        .and_then(serde_json::Value::as_str)
                })
                .map(str::to_owned)
        });

        match status.as_deref() {
            Some("ok") if status_code.is_success() => {
                let props = match self.http.get(&endpoint.props_url).send().await {
                    Ok(response) if response.status().is_success() => {
                        match response.json::<serde_json::Value>().await {
                            Ok(props) => props,
                            Err(error) => return ProbeResult::Occupied(error.to_string()),
                        }
                    }
                    Ok(response) => {
                        return ProbeResult::Occupied(format!(
                            "El endpoint /props respondió con HTTP {}.",
                            response.status()
                        ))
                    }
                    Err(error) => return ProbeResult::Occupied(error.to_string()),
                };
                let is_llama_server = props.get("build_info").is_some()
                    && props.get("model_path").is_some()
                    && props.get("total_slots").is_some();
                if is_llama_server {
                    ProbeResult::Ready
                } else {
                    ProbeResult::Occupied(
                        "El endpoint /health parece válido, pero /props no tiene la firma de llama-server."
                            .to_owned(),
                    )
                }
            }
            Some(value) if value.to_ascii_lowercase().contains("load") => ProbeResult::Loading,
            _ => ProbeResult::Occupied(format!(
                "HTTP {}: {}",
                status_code,
                body.chars().take(300).collect::<String>()
            )),
        }
    }
}

struct ValidatedEndpoint {
    health_url: String,
    props_url: String,
    host: String,
    port: u16,
}

enum ProbeResult {
    Ready,
    Loading,
    Unavailable,
    Occupied(String),
}

fn validate_config(
    config: &LocalAIRuntimeConfig,
) -> Result<ValidatedEndpoint, LocalAIRuntimeError> {
    if config.startup_timeout_ms < 1_000 || config.polling_interval_ms < 100 {
        return Err(LocalAIRuntimeError::new(
            "invalid_config",
            "La configuración de espera de la IA local no es válida.",
        ));
    }
    let url = reqwest::Url::parse(&config.base_url).map_err(|error| {
        LocalAIRuntimeError::new("invalid_config", "La URL de la IA local no es válida.")
            .with_detail(error.to_string())
    })?;
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "http" || !matches!(host, "127.0.0.1" | "localhost") {
        return Err(LocalAIRuntimeError::new(
            "invalid_config",
            "La IA local debe escuchar mediante HTTP únicamente en localhost.",
        ));
    }
    let port = url.port_or_known_default().ok_or_else(|| {
        LocalAIRuntimeError::new(
            "invalid_config",
            "La URL de la IA local no define un puerto.",
        )
    })?;
    Ok(ValidatedEndpoint {
        health_url: format!("{}/health", config.base_url.trim_end_matches('/')),
        props_url: format!("{}/props", config.base_url.trim_end_matches('/')),
        host: host.to_owned(),
        port,
    })
}

fn resolve_existing_path(app: Option<&tauri::AppHandle>, configured: &str) -> Option<PathBuf> {
    let configured = PathBuf::from(configured);
    if configured.is_absolute() {
        return configured.is_file().then_some(configured);
    }

    let mut candidates = Vec::new();
    if let Ok(current) = std::env::current_dir() {
        candidates.push(current.join(&configured));
    }
    #[cfg(debug_assertions)]
    {
        if let Some(project_root) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
            candidates.push(project_root.join(&configured));
        }
    }
    if let Some(app) = app {
        if let Ok(resource_dir) = app.path().resource_dir() {
            candidates.push(resource_dir.join(&configured));
        }
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(directory) = executable.parent() {
            candidates.push(directory.join(&configured));
        }
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn capture_stderr(stderr: tokio::process::ChildStderr, tail: Arc<Mutex<VecDeque<String>>>) {
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            #[cfg(debug_assertions)]
            eprintln!("[llama-server] {line}");
            if let Ok(mut tail) = tail.lock() {
                if tail.len() == STDERR_TAIL_LINES {
                    tail.pop_front();
                }
                tail.push_back(line);
            }
        }
    });
}

fn stderr_tail(tail: &Arc<Mutex<VecDeque<String>>>) -> String {
    tail.lock()
        .map(|lines| lines.iter().cloned().collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}

fn snapshot(inner: &RuntimeInner) -> LocalAIRuntimeSnapshot {
    match inner.phase {
        RuntimePhase::Stopped => LocalAIRuntimeSnapshot {
            state: "stopped",
            ownership: None,
            pid: None,
        },
        RuntimePhase::Starting => LocalAIRuntimeSnapshot {
            state: "starting",
            ownership: None,
            pid: inner.child.as_ref().and_then(Child::id),
        },
        RuntimePhase::Ready(ownership) => LocalAIRuntimeSnapshot {
            state: "ready",
            ownership: Some(match ownership {
                Ownership::External => "external",
                Ownership::His => "his",
            }),
            pid: inner.child.as_ref().and_then(Child::id),
        },
        RuntimePhase::Stopping => LocalAIRuntimeSnapshot {
            state: "stopping",
            ownership: Some("his"),
            pid: inner.child.as_ref().and_then(Child::id),
        },
        RuntimePhase::Error => LocalAIRuntimeSnapshot {
            state: "error",
            ownership: None,
            pid: None,
        },
    }
}

async fn stop_managed_child(inner: &mut RuntimeInner) {
    if let Some(mut child) = inner.child.take() {
        if let Some(pid) = child.id() {
            request_graceful_termination(pid).await;
        }
        if timeout(SHUTDOWN_GRACE, child.wait()).await.is_err() {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
    }
}

#[cfg(windows)]
async fn request_graceful_termination(pid: u32) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new("taskkill.exe");
    command
        .arg("/PID")
        .arg(pid.to_string())
        .arg("/T")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    let _ = timeout(Duration::from_secs(2), command.status()).await;
}

#[cfg(not(windows))]
async fn request_graceful_termination(pid: u32) {
    let _ = timeout(
        Duration::from_secs(2),
        Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status(),
    )
    .await;
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener, sync::Arc};

    fn repo_path(relative: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri parent")
            .join(relative)
    }

    fn free_port() -> u16 {
        TcpListener::bind(("127.0.0.1", 0))
            .expect("bind ephemeral port")
            .local_addr()
            .expect("ephemeral address")
            .port()
    }

    fn config(port: u16, executable: &Path, model: &Path) -> LocalAIRuntimeConfig {
        LocalAIRuntimeConfig {
            base_url: format!("http://127.0.0.1:{port}"),
            executable_path: executable.to_string_lossy().into_owned(),
            model_path: model.to_string_lossy().into_owned(),
            startup_timeout_ms: 30_000,
            polling_interval_ms: 200,
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn lifecycle_scenarios_are_owned_and_classified_safely() {
        let executable = repo_path("local_ai/runtime/llama/llama-server.exe");
        let model = repo_path("local_ai/models/gemma-3-1b-it-Q4_K_M.gguf");
        assert!(executable.is_file(), "test llama-server is available");
        assert!(model.is_file(), "test GGUF is available");

        let missing_manager = LocalAIRuntimeManager::new();
        let missing = missing_manager
            .ensure_internal(
                None,
                config(
                    free_port(),
                    &executable,
                    &repo_path("local_ai/models/does-not-exist.gguf"),
                ),
            )
            .await
            .expect_err("missing model must fail");
        assert_eq!(missing.code, "model_missing");

        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind occupied port");
        let occupied_port = listener.local_addr().unwrap().port();
        let occupied_thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept health probe");
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}")
                .expect("write fake health response");
        });
        let occupied = LocalAIRuntimeManager::new()
            .ensure_internal(None, config(occupied_port, &executable, &model))
            .await
            .expect_err("unrelated service must not be reused");
        assert_eq!(occupied.code, "port_occupied");
        occupied_thread.join().expect("fake service thread");

        let exited = LocalAIRuntimeManager::new()
            .ensure_internal(
                None,
                config(
                    free_port(),
                    Path::new(r"C:\Windows\System32\where.exe"),
                    &model,
                ),
            )
            .await
            .expect_err("early process exit must fail");
        assert_eq!(exited.code, "process_exited");

        let managed_port = free_port();
        let managed_config = config(managed_port, &executable, &model);
        let manager = Arc::new(LocalAIRuntimeManager::new());
        let first_manager = Arc::clone(&manager);
        let second_manager = Arc::clone(&manager);
        let first_config = managed_config.clone();
        let second_config = managed_config.clone();
        let (first, second) = tokio::join!(
            async move { first_manager.ensure_internal(None, first_config).await },
            async move { second_manager.ensure_internal(None, second_config).await }
        );
        let first = first.expect("first concurrent ensure");
        let second = second.expect("second concurrent ensure");
        assert_eq!(first.ownership, Some("his"));
        assert_eq!(first.pid, second.pid, "both calls share one child process");
        manager.shutdown().await.expect("managed shutdown");

        let external_port = free_port();
        let external_config = config(external_port, &executable, &model);
        let mut external = Command::new(&executable);
        external
            .arg("--model")
            .arg(&model)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(external_port.to_string())
            .current_dir(executable.parent().unwrap())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let mut external = external.spawn().expect("start external llama-server");
        let external_manager = LocalAIRuntimeManager::new();
        let external_snapshot = external_manager
            .ensure_internal(None, external_config)
            .await
            .expect("reuse external llama-server");
        assert_eq!(external_snapshot.ownership, Some("external"));
        assert_eq!(external_snapshot.pid, None);
        external_manager
            .shutdown()
            .await
            .expect("external no-op shutdown");
        assert!(
            external
                .try_wait()
                .expect("external process status")
                .is_none(),
            "shutdown must not terminate an external server"
        );
        external.kill().await.expect("test cleanup external server");
        let _ = external.wait().await;
    }
}
