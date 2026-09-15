use discord_rich_presence::{
    activity::{Activity, Assets, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde::Deserialize;
use std::{
    sync::{
        mpsc::{self, Receiver, RecvTimeoutError, Sender},
        Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const DISCORD_APPLICATION_ID: &str = "1548208254247764078";
const CONNECTION_PROBE_INTERVAL: Duration = Duration::from_secs(15);

// Discord's Public Key verifies incoming HTTP interactions. Local RPC over IPC
// authenticates its handshake with the Application ID, so no Public Key is used.

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PresenceActivity {
    details: String,
    state: String,
    large_image: String,
    large_text: String,
    small_image: Option<String>,
    small_text: Option<String>,
}

impl PresenceActivity {
    fn default_activity() -> Self {
        Self {
            details: "Working in H.I.S. Future".to_owned(),
            state: "H.I.S. Future".to_owned(),
            large_image: "hisfuture_icon".to_owned(),
            large_text: "H.I.S. Future".to_owned(),
            small_image: None,
            small_text: None,
        }
    }
}

enum PresenceCommand {
    Set(PresenceActivity),
    Clear,
    Shutdown,
}

pub struct DiscordPresenceManager {
    sender: Sender<PresenceCommand>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl DiscordPresenceManager {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("discord-presence".to_owned())
            .spawn(move || run_presence_worker(receiver))
            .map_err(|error| {
                #[cfg(debug_assertions)]
                eprintln!("[discord-presence] worker unavailable: {error}");
                error
            })
            .ok();
        Self {
            sender,
            worker: Mutex::new(worker),
        }
    }

    pub fn set(&self, activity: PresenceActivity) {
        let _ = self.sender.send(PresenceCommand::Set(activity));
    }

    pub fn clear(&self) {
        let _ = self.sender.send(PresenceCommand::Clear);
    }

    pub fn shutdown(&self) {
        let _ = self.sender.send(PresenceCommand::Shutdown);
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(handle) = worker.take() {
                let _ = handle.join();
            }
        }
    }
}

impl Drop for DiscordPresenceManager {
    fn drop(&mut self) {
        let _ = self.sender.send(PresenceCommand::Shutdown);
        if let Ok(worker) = self.worker.get_mut() {
            if let Some(handle) = worker.take() {
                let _ = handle.join();
            }
        }
    }
}

fn run_presence_worker(receiver: Receiver<PresenceCommand>) {
    let session_started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let mut desired = Some(PresenceActivity::default_activity());
    let mut client: Option<DiscordIpcClient> = None;
    let mut dirty = true;
    let mut unavailable_reported = false;
    let mut published_reported = false;
    let mut next_probe = Instant::now();

    loop {
        let timeout = if desired.is_some() {
            next_probe.saturating_duration_since(Instant::now())
        } else {
            Duration::from_secs(60 * 60)
        };

        match receiver.recv_timeout(timeout) {
            Ok(PresenceCommand::Set(activity)) => {
                if desired.as_ref() != Some(&activity) {
                    desired = Some(activity);
                    dirty = true;
                }
            }
            Ok(PresenceCommand::Clear) => {
                desired = None;
                dirty = false;
                close_client(&mut client, true);
                continue;
            }
            Ok(PresenceCommand::Shutdown) | Err(RecvTimeoutError::Disconnected) => {
                close_client(&mut client, true);
                return;
            }
            Err(RecvTimeoutError::Timeout) => {}
        }

        let now = Instant::now();
        if desired.is_none() || (!dirty && now < next_probe) {
            continue;
        }
        next_probe = now + CONNECTION_PROBE_INTERVAL;

        if client.is_none() {
            let mut candidate = DiscordIpcClient::new(DISCORD_APPLICATION_ID);
            match candidate.connect() {
                Ok(()) => {
                    client = Some(candidate);
                    if unavailable_reported {
                        #[cfg(debug_assertions)]
                        eprintln!("[discord-presence] connected");
                    }
                    unavailable_reported = false;
                }
                Err(error) => {
                    if !unavailable_reported {
                        #[cfg(debug_assertions)]
                        eprintln!("[discord-presence] Discord Desktop unavailable: {error}");
                        unavailable_reported = true;
                    }
                    continue;
                }
            }
        }

        let Some(activity) = desired.as_ref() else {
            continue;
        };
        let mut assets = Assets::new()
            .large_image(activity.large_image.as_str())
            .large_text(activity.large_text.as_str());
        if let Some(small_image) = activity.small_image.as_deref() {
            assets = assets.small_image(small_image);
        }
        if let Some(small_text) = activity.small_text.as_deref() {
            assets = assets.small_text(small_text);
        }
        let payload = Activity::new()
            .name("H.I.S. Future")
            .details(activity.details.as_str())
            .state(activity.state.as_str())
            .assets(assets)
            .timestamps(Timestamps::new().start(session_started));
        let should_report_publish = dirty || !published_reported;
        match client
            .as_mut()
            .expect("client was connected")
            .set_activity(payload)
        {
            Ok(()) => {
                dirty = false;
                if should_report_publish {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[discord-presence] activity published large_image={} small_image={}",
                        activity.large_image,
                        activity.small_image.as_deref().unwrap_or("none")
                    );
                    published_reported = true;
                }
            }
            Err(error) => {
                if !unavailable_reported {
                    #[cfg(debug_assertions)]
                    eprintln!("[discord-presence] connection lost: {error}");
                    unavailable_reported = true;
                }
                close_client(&mut client, false);
                dirty = true;
                published_reported = false;
            }
        }
    }
}

fn close_client(client: &mut Option<DiscordIpcClient>, clear: bool) {
    if let Some(mut connected) = client.take() {
        if clear {
            let _ = connected.clear_activity();
        }
        let _ = connected.close();
    }
}

#[cfg(test)]
mod tests {
    use super::{PresenceActivity, DISCORD_APPLICATION_ID};

    #[test]
    fn application_id_is_centralized_and_activity_is_generic() {
        assert_eq!(DISCORD_APPLICATION_ID, "1548208254247764078");
        assert_eq!(
            PresenceActivity::default_activity(),
            PresenceActivity {
                details: "Working in H.I.S. Future".to_owned(),
                state: "H.I.S. Future".to_owned(),
                large_image: "hisfuture_icon".to_owned(),
                large_text: "H.I.S. Future".to_owned(),
                small_image: None,
                small_text: None,
            }
        );
    }
}
