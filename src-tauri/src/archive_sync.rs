use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct ArchiveSyncJob {
    pub archive_path: PathBuf,
    pub working_folder: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ArchiveSyncPhase {
    Pending,
    Syncing,
    Clean,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSyncStatus {
    pub archive_path: String,
    pub phase: ArchiveSyncPhase,
    pub error: Option<String>,
}

#[derive(Debug, Default)]
struct QueueState {
    pending: HashMap<PathBuf, ArchiveSyncJob>,
    order: VecDeque<PathBuf>,
    running: Option<PathBuf>,
    statuses: HashMap<PathBuf, ArchiveSyncStatus>,
}

struct Shared {
    state: Mutex<QueueState>,
    changed: Condvar,
}

type Packager = dyn Fn(&ArchiveSyncJob) -> Result<(), String> + Send + Sync + 'static;
type StatusListener = dyn Fn(ArchiveSyncStatus) + Send + Sync + 'static;

/// A process-owned, globally serial archive packager. Jobs are coalesced per Vault.
/// Working folders remain durable and are never deleted by this queue.
pub struct ArchiveSyncManager {
    shared: Arc<Shared>,
    listener: Arc<StatusListener>,
}

impl ArchiveSyncManager {
    pub fn new(packager: Arc<Packager>, listener: Arc<StatusListener>) -> Self {
        let shared = Arc::new(Shared {
            state: Mutex::new(QueueState::default()),
            changed: Condvar::new(),
        });
        let worker_shared = Arc::clone(&shared);
        let worker_listener = Arc::clone(&listener);
        thread::Builder::new()
            .name("his-archive-sync".into())
            .spawn(move || worker_loop(worker_shared, packager, worker_listener))
            .expect("archive sync worker");
        Self { shared, listener }
    }

    pub fn enqueue(&self, job: ArchiveSyncJob) -> Result<(), String> {
        let key = normalize_key(&job.archive_path);
        let status = ArchiveSyncStatus {
            archive_path: job.archive_path.to_string_lossy().into_owned(),
            phase: ArchiveSyncPhase::Pending,
            error: None,
        };
        {
            let mut state = self
                .shared
                .state
                .lock()
                .map_err(|_| "No se pudo bloquear la cola de archivos .his.".to_string())?;
            state.pending.insert(key.clone(), job);
            if state.running.as_ref() != Some(&key) && !state.order.contains(&key) {
                state.order.push_back(key.clone());
            }
            state.statuses.insert(key, status.clone());
        }
        emit_status(&status);
        (self.listener)(status);
        self.shared.changed.notify_all();
        Ok(())
    }

    /// Waits only for the requested Vault. A failed sync is returned as state,
    /// allowing callers to reopen its newer durable working copy and retry later.
    pub fn wait_for_vault(
        &self,
        archive_path: &std::path::Path,
    ) -> Result<Option<ArchiveSyncStatus>, String> {
        let key = normalize_key(archive_path);
        let mut state = self
            .shared
            .state
            .lock()
            .map_err(|_| "No se pudo bloquear la cola de archivos .his.".to_string())?;
        while state.running.as_ref() == Some(&key)
            || state.pending.contains_key(&key)
            || state.order.contains(&key)
        {
            state = self
                .shared
                .changed
                .wait(state)
                .map_err(|_| "No se pudo esperar la sincronización del Vault.".to_string())?;
        }
        Ok(state.statuses.get(&key).cloned())
    }

    /// Exit barrier: all queued/running jobs finish. Any failure keeps Exit open.
    pub fn drain(&self) -> Result<(), String> {
        let mut state = self
            .shared
            .state
            .lock()
            .map_err(|_| "No se pudo bloquear la cola de archivos .his.".to_string())?;
        while state.running.is_some() || !state.pending.is_empty() || !state.order.is_empty() {
            state = self
                .shared
                .changed
                .wait(state)
                .map_err(|_| "No se pudo esperar la cola de archivos .his.".to_string())?;
        }
        let failures = state
            .statuses
            .values()
            .filter(|status| status.phase == ArchiveSyncPhase::Failed)
            .map(|status| {
                format!(
                    "{}: {}",
                    status.archive_path,
                    status.error.as_deref().unwrap_or("error desconocido")
                )
            })
            .collect::<Vec<_>>();
        if failures.is_empty() {
            Ok(())
        } else {
            Err(format!(
                "No se pudieron sincronizar todos los archivos .his. El estado de trabajo sigue seguro. {}",
                failures.join(" | ")
            ))
        }
    }

    pub fn statuses(&self) -> Result<Vec<ArchiveSyncStatus>, String> {
        let state = self
            .shared
            .state
            .lock()
            .map_err(|_| "No se pudo bloquear la cola de archivos .his.".to_string())?;
        Ok(state.statuses.values().cloned().collect())
    }
}

fn normalize_key(path: &std::path::Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn emit_status(status: &ArchiveSyncStatus) {
    eprintln!(
        "[lifecycle] archive.sync status={:?} path={}{}",
        status.phase,
        status.archive_path,
        status
            .error
            .as_deref()
            .map(|error| format!(" error={error}"))
            .unwrap_or_default()
    );
}

fn worker_loop(shared: Arc<Shared>, packager: Arc<Packager>, listener: Arc<StatusListener>) {
    loop {
        let (key, job) = {
            let mut state = shared.state.lock().expect("archive queue state");
            while state.order.is_empty() {
                state = shared.changed.wait(state).expect("archive queue wait");
            }
            let key = state.order.pop_front().expect("queued archive key");
            let Some(job) = state.pending.remove(&key) else {
                continue;
            };
            state.running = Some(key.clone());
            let status = ArchiveSyncStatus {
                archive_path: job.archive_path.to_string_lossy().into_owned(),
                phase: ArchiveSyncPhase::Syncing,
                error: None,
            };
            state.statuses.insert(key.clone(), status.clone());
            emit_status(&status);
            listener(status);
            (key, job)
        };

        let started = Instant::now();
        let result = packager(&job);
        let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        let mut state = shared.state.lock().expect("archive queue state");
        state.running = None;
        if state.pending.contains_key(&key) {
            if !state.order.contains(&key) {
                state.order.push_back(key.clone());
            }
            let status = ArchiveSyncStatus {
                archive_path: job.archive_path.to_string_lossy().into_owned(),
                phase: ArchiveSyncPhase::Pending,
                error: None,
            };
            state.statuses.insert(key, status.clone());
            emit_status(&status);
            listener(status);
        } else {
            let (phase, error) = match result {
                Ok(()) => (ArchiveSyncPhase::Clean, None),
                Err(error) => (ArchiveSyncPhase::Failed, Some(error)),
            };
            let status = ArchiveSyncStatus {
                archive_path: job.archive_path.to_string_lossy().into_owned(),
                phase,
                error,
            };
            eprintln!(
                "[lifecycle] archive.sync package_complete={elapsed_ms:.2}ms path={}",
                status.archive_path
            );
            state.statuses.insert(key, status.clone());
            emit_status(&status);
            listener(status);
        }
        shared.changed.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    fn job(name: &str) -> ArchiveSyncJob {
        ArchiveSyncJob {
            archive_path: PathBuf::from(name),
            working_folder: PathBuf::from(format!("{name}-working")),
        }
    }

    #[test]
    fn coalesces_per_vault_and_global_concurrency_is_one() {
        let active = Arc::new(AtomicUsize::new(0));
        let maximum = Arc::new(AtomicUsize::new(0));
        let calls = Arc::new(Mutex::new(Vec::new()));
        let packager = {
            let active = Arc::clone(&active);
            let maximum = Arc::clone(&maximum);
            let calls = Arc::clone(&calls);
            Arc::new(move |job: &ArchiveSyncJob| {
                let now = active.fetch_add(1, Ordering::SeqCst) + 1;
                maximum.fetch_max(now, Ordering::SeqCst);
                calls.lock().unwrap().push(job.working_folder.clone());
                thread::sleep(Duration::from_millis(20));
                active.fetch_sub(1, Ordering::SeqCst);
                Ok(())
            })
        };
        let queue = ArchiveSyncManager::new(packager, Arc::new(|_| {}));
        queue.enqueue(job("A.his")).unwrap();
        queue
            .enqueue(ArchiveSyncJob {
                working_folder: "A-latest".into(),
                ..job("A.his")
            })
            .unwrap();
        queue.enqueue(job("B.his")).unwrap();
        queue.drain().unwrap();
        assert_eq!(maximum.load(Ordering::SeqCst), 1);
        let calls = calls.lock().unwrap();
        assert!(calls.contains(&PathBuf::from("A-latest")));
        assert!(calls.contains(&PathBuf::from("B.his-working")));
    }

    #[test]
    fn failure_stays_failed_and_retry_can_clean_it() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let packager = {
            let attempts = Arc::clone(&attempts);
            Arc::new(move |_: &ArchiveSyncJob| {
                if attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                    Err("disk full".into())
                } else {
                    Ok(())
                }
            })
        };
        let queue = ArchiveSyncManager::new(packager, Arc::new(|_| {}));
        queue.enqueue(job("retry.his")).unwrap();
        assert!(queue.drain().is_err());
        assert_eq!(queue.statuses().unwrap()[0].phase, ArchiveSyncPhase::Failed);
        queue.enqueue(job("retry.his")).unwrap();
        queue.drain().unwrap();
        assert_eq!(queue.statuses().unwrap()[0].phase, ArchiveSyncPhase::Clean);
    }

    #[test]
    fn same_vault_waits_for_its_job_without_blocking_other_vaults() {
        use std::sync::mpsc;
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let release_rx = Arc::new(Mutex::new(release_rx));
        let queue = Arc::new(ArchiveSyncManager::new(
            Arc::new(move |_| {
                started_tx.send(()).unwrap();
                release_rx.lock().unwrap().recv().unwrap();
                Ok(())
            }),
            Arc::new(|_| {}),
        ));
        queue.enqueue(job("A.his")).unwrap();
        started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(queue
            .wait_for_vault(std::path::Path::new("B.his"))
            .unwrap()
            .is_none());

        let (finished_tx, finished_rx) = mpsc::channel();
        let waiter = Arc::clone(&queue);
        thread::spawn(move || {
            waiter
                .wait_for_vault(std::path::Path::new("A.his"))
                .unwrap();
            finished_tx.send(()).unwrap();
        });
        assert!(finished_rx.recv_timeout(Duration::from_millis(30)).is_err());
        release_tx.send(()).unwrap();
        finished_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        queue.drain().unwrap();
    }
}
