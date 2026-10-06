use crate::project::{mark_archive_dirty, ProjectState};
use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRecord {
    id: String,
    project_id: Option<String>,
    vault_id: Option<String>,
    title: String,
    created_at: String,
    updated_at: String,
    archived: bool,
    message_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    id: String,
    conversation_id: String,
    sequence: i64,
    role: String,
    content: String,
    created_at: String,
    response_type: Option<String>,
    operation: Option<String>,
    pipeline: Option<String>,
    model: Option<String>,
    metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessage {
    id: String,
    conversation_id: String,
    role: String,
    content: String,
    created_at: String,
    response_type: Option<String>,
    operation: Option<String>,
    pipeline: Option<String>,
    model: Option<String>,
    metadata: Option<serde_json::Value>,
}

fn conversation_from_row(row: &Row<'_>) -> rusqlite::Result<ConversationRecord> {
    Ok(ConversationRecord {
        id: row.get(0)?, project_id: row.get(1)?, vault_id: row.get(2)?, title: row.get(3)?,
        created_at: row.get(4)?, updated_at: row.get(5)?, archived: row.get::<_, i64>(6)? != 0,
        message_count: row.get(7)?,
    })
}

fn message_from_row(row: &Row<'_>) -> rusqlite::Result<MessageRecord> {
    let metadata_json: Option<String> = row.get(10)?;
    Ok(MessageRecord {
        id: row.get(0)?, conversation_id: row.get(1)?, sequence: row.get(2)?, role: row.get(3)?,
        content: row.get(4)?, created_at: row.get(5)?, response_type: row.get(6)?, operation: row.get(7)?,
        pipeline: row.get(8)?, model: row.get(9)?, metadata: metadata_json.and_then(|value| serde_json::from_str(&value).ok()),
    })
}

pub fn list_conversations(state: &ProjectState, include_archived: bool, limit: u32) -> Result<Vec<ConversationRecord>, String> {
    let guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_ref().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let mut statement = project.db.prepare(
        "SELECT id, project_id, vault_id, title, created_at, updated_at, archived, message_count
         FROM ai_conversations WHERE (?1 = 1 OR archived = 0) ORDER BY updated_at DESC LIMIT ?2"
    ).map_err(|error| error.to_string())?;
    let result = statement.query_map(params![include_archived as i64, limit.clamp(1, 500)], conversation_from_row)
        .map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string());
    result
}

pub fn create_conversation(state: &ProjectState, id: String, project_id: Option<String>, vault_id: Option<String>, title: String, now: String) -> Result<ConversationRecord, String> {
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    project.db.execute(
        "INSERT INTO ai_conversations(id, project_id, vault_id, title, created_at, updated_at) VALUES(?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, project_id, vault_id, title.trim(), now],
    ).map_err(|error| format!("No se pudo crear la conversación: {error}"))?;
    mark_archive_dirty(project)?;
    Ok(ConversationRecord { id, project_id, vault_id, title: title.trim().to_string(), created_at: now.clone(), updated_at: now, archived: false, message_count: 0 })
}

pub fn rename_conversation(state: &ProjectState, id: String, title: String, now: String) -> Result<(), String> {
    mutate_conversation(state, "UPDATE ai_conversations SET title=?2, updated_at=?3 WHERE id=?1", params![id, title.trim(), now])
}

pub fn archive_conversation(state: &ProjectState, id: String, archived: bool, now: String) -> Result<(), String> {
    mutate_conversation(state, "UPDATE ai_conversations SET archived=?2, updated_at=?3 WHERE id=?1", params![id, archived as i64, now])
}

pub fn delete_conversation(state: &ProjectState, id: String) -> Result<(), String> {
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    project.db.execute("DELETE FROM ai_conversations WHERE id=?1", [id]).map_err(|error| error.to_string())?;
    mark_archive_dirty(project)
}

fn mutate_conversation<P: rusqlite::Params>(state: &ProjectState, sql: &str, values: P) -> Result<(), String> {
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let changed = project.db.execute(sql, values).map_err(|error| error.to_string())?;
    if changed == 0 { return Err("La conversación no existe.".into()); }
    mark_archive_dirty(project)
}

pub fn append_message(state: &ProjectState, message: NewMessage) -> Result<MessageRecord, String> {
    if !matches!(message.role.as_str(), "user" | "assistant") { return Err("Rol de mensaje no válido.".into()); }
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let tx = project.db.transaction().map_err(|error| error.to_string())?;
    let sequence: i64 = tx.query_row("SELECT COALESCE(MAX(sequence), 0) + 1 FROM ai_messages WHERE conversation_id=?1", [&message.conversation_id], |row| row.get(0)).map_err(|error| error.to_string())?;
    let metadata_json = message.metadata.as_ref().map(serde_json::to_string).transpose().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO ai_messages(id, conversation_id, sequence, role, content, created_at, response_type, operation, pipeline, model, metadata_json)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![message.id, message.conversation_id, sequence, message.role, message.content, message.created_at, message.response_type, message.operation, message.pipeline, message.model, metadata_json],
    ).map_err(|error| format!("No se pudo guardar el mensaje: {error}"))?;
    tx.execute("UPDATE ai_conversations SET updated_at=?2, message_count=message_count+1 WHERE id=?1", params![message.conversation_id, message.created_at]).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    mark_archive_dirty(project)?;
    Ok(MessageRecord { id: message.id, conversation_id: message.conversation_id, sequence, role: message.role, content: message.content, created_at: message.created_at, response_type: message.response_type, operation: message.operation, pipeline: message.pipeline, model: message.model, metadata: message.metadata })
}

pub fn list_messages(state: &ProjectState, conversation_id: String, before_sequence: Option<i64>, limit: u32) -> Result<Vec<MessageRecord>, String> {
    let guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_ref().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let mut statement = project.db.prepare(
        "SELECT id, conversation_id, sequence, role, content, created_at, response_type, operation, pipeline, model, metadata_json
         FROM ai_messages WHERE conversation_id=?1 AND (?2 IS NULL OR sequence < ?2) ORDER BY sequence DESC LIMIT ?3"
    ).map_err(|error| error.to_string())?;
    let mut messages = statement.query_map(params![conversation_id, before_sequence, limit.clamp(1, 500)], message_from_row)
        .map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    messages.reverse();
    Ok(messages)
}

pub fn list_message_range(state: &ProjectState, conversation_id: String, start: i64, end: i64, limit: u32) -> Result<Vec<MessageRecord>, String> {
    let guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_ref().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let mut statement = project.db.prepare(
        "SELECT id, conversation_id, sequence, role, content, created_at, response_type, operation, pipeline, model, metadata_json
         FROM ai_messages WHERE conversation_id=?1 AND sequence BETWEEN ?2 AND ?3 ORDER BY sequence ASC LIMIT ?4"
    ).map_err(|error| error.to_string())?;
    let result = statement.query_map(params![conversation_id, start, end, limit.clamp(1, 500)], message_from_row)
        .map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string());
    result
}

pub fn messages_around(state: &ProjectState, conversation_id: String, message_id: String, radius: u32) -> Result<Vec<MessageRecord>, String> {
    let guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_ref().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let sequence: Option<i64> = project.db.query_row("SELECT sequence FROM ai_messages WHERE id=?1 AND conversation_id=?2", params![message_id, conversation_id], |row| row.get(0)).optional().map_err(|error| error.to_string())?;
    let sequence = sequence.ok_or_else(|| "El mensaje no existe.".to_string())?;
    let radius = i64::from(radius.min(50));
    drop(guard);
    list_message_range(state, conversation_id, (sequence - radius).max(1), sequence + radius, (radius as u32 * 2) + 1)
}

pub fn search_messages(state: &ProjectState, conversation_id: String, query: String, limit: u32) -> Result<Vec<MessageRecord>, String> {
    let tokens = query.split_whitespace().filter_map(|token| {
        let clean: String = token.chars().filter(|character| character.is_alphanumeric()).collect();
        (!clean.is_empty()).then(|| format!("\"{}\"", clean.replace('"', "")))
    }).take(8).collect::<Vec<_>>();
    if tokens.is_empty() { return Ok(Vec::new()); }
    let fts_query = tokens.join(" OR ");
    let guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_ref().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let mut statement = project.db.prepare(
        "SELECT m.id, m.conversation_id, m.sequence, m.role, m.content, m.created_at, m.response_type, m.operation, m.pipeline, m.model, m.metadata_json
         FROM ai_messages_fts f JOIN ai_messages m ON m.rowid=f.rowid
         WHERE ai_messages_fts MATCH ?1 AND f.conversation_id=?2 ORDER BY bm25(ai_messages_fts), m.sequence DESC LIMIT ?3"
    ).map_err(|error| error.to_string())?;
    let result = statement.query_map(params![fts_query, conversation_id, limit.clamp(1, 100)], message_from_row)
        .map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string());
    result
}

pub fn save_conversation_state(state: &ProjectState, conversation_id: String, state_json: serde_json::Value, now: String) -> Result<(), String> {
    let value = serde_json::to_string(&state_json).map_err(|error| error.to_string())?;
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    project.db.execute("INSERT INTO ai_conversation_states(conversation_id, state_json, updated_at) VALUES(?1, ?2, ?3) ON CONFLICT(conversation_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at", params![conversation_id, value, now]).map_err(|error| error.to_string())?;
    mark_archive_dirty(project)
}

pub fn load_conversation_state(state: &ProjectState, conversation_id: String) -> Result<Option<serde_json::Value>, String> {
    let guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_ref().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let raw: Option<String> = project.db.query_row("SELECT state_json FROM ai_conversation_states WHERE conversation_id=?1", [conversation_id], |row| row.get(0)).optional().map_err(|error| error.to_string())?;
    raw.map(|value| serde_json::from_str(&value).map_err(|error| error.to_string())).transpose()
}

pub fn save_semantic_mentions(state: &ProjectState, mentions: Vec<serde_json::Value>) -> Result<(), String> {
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let tx = project.db.transaction().map_err(|error| error.to_string())?;
    for value in mentions {
        let get = |key: &str| value.get(key).and_then(|item| item.as_str());
        let id = get("id").ok_or("Mention sin id.")?;
        let conversation_id = get("conversationId").ok_or("Mention sin conversación.")?;
        let message_id = get("messageId").ok_or("Mention sin mensaje.")?;
        let temporal = value.get("temporalReference").map(serde_json::to_string).transpose().map_err(|error| error.to_string())?;
        tx.execute("INSERT OR REPLACE INTO ai_semantic_mentions(id, conversation_id, message_id, surface_text, normalized_value, semantic_type, subject, relation, object_value, temporal_reference_json, confidence, canonical_node_id, source, modality) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)", params![id, conversation_id, message_id, get("surfaceText").unwrap_or(""), get("normalizedValue").unwrap_or(""), get("semanticType").unwrap_or("OTHER"), get("subject"), get("relation"), get("object"), temporal, value.get("confidence").and_then(|item| item.as_f64()).unwrap_or(0.0), get("canonicalNodeId"), get("source").unwrap_or("rule"), get("modality")]).map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    mark_archive_dirty(project)
}

pub fn save_memory_records(state: &ProjectState, records: Vec<serde_json::Value>) -> Result<(), String> {
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let tx = project.db.transaction().map_err(|error| error.to_string())?;
    for value in records {
        let get = |key: &str| value.get(key).and_then(|item| item.as_str());
        if get("scope") == Some("GLOBAL") { return Err("La memoria GLOBAL está desactivada en GEMITAV V0.1.".into()); }
        let id = get("id").ok_or("Memoria sin id.")?;
        if matches!(get("memoryType"), Some("PREFERENCE" | "TASK" | "DECISION")) {
            tx.execute("UPDATE ai_memory_records SET superseded_by=?1 WHERE superseded_by IS NULL AND id<>?1 AND scope=?2 AND memory_type=?3 AND subject=?4 AND COALESCE(predicate,'')=COALESCE(?5,'')", params![id, get("scope"), get("memoryType"), get("subject"), get("predicate")]).map_err(|error| error.to_string())?;
        }
        tx.execute("INSERT OR REPLACE INTO ai_memory_records(id,memory_type,scope,subject,predicate,value,source_conversation_id,source_message_ids_json,related_mention_ids_json,related_node_ids_json,created_at,updated_at,confidence,priority,expires_at,superseded_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)", params![id, get("memoryType"), get("scope"), get("subject"), get("predicate"), get("value"), get("sourceConversationId"), serde_json::to_string(value.get("sourceMessageIds").unwrap_or(&serde_json::Value::Array(vec![]))).unwrap(), serde_json::to_string(value.get("relatedMentionIds").unwrap_or(&serde_json::Value::Array(vec![]))).unwrap(), serde_json::to_string(value.get("relatedNodeIds").unwrap_or(&serde_json::Value::Array(vec![]))).unwrap(), get("createdAt"), get("updatedAt"), value.get("confidence").and_then(|item| item.as_f64()).unwrap_or(0.0), value.get("priority").and_then(|item| item.as_i64()).unwrap_or(0), get("expiresAt"), get("supersededBy")]).map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    mark_archive_dirty(project)
}

pub fn list_memory_records(state: &ProjectState, conversation_id: String, now: String, limit: u32) -> Result<Vec<serde_json::Value>, String> {
    let guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_ref().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let mut statement = project.db.prepare("SELECT id,memory_type,scope,subject,predicate,value,source_conversation_id,source_message_ids_json,related_mention_ids_json,related_node_ids_json,created_at,updated_at,confidence,priority,expires_at,superseded_by FROM ai_memory_records WHERE superseded_by IS NULL AND (expires_at IS NULL OR expires_at>?2) AND (scope<>'CONVERSATION' OR source_conversation_id=?1) AND scope<>'GLOBAL' ORDER BY priority DESC, updated_at DESC LIMIT ?3").map_err(|error| error.to_string())?;
    let result = statement.query_map(params![conversation_id, now, limit.clamp(1, 500)], |row| {
        let parse = |value: String| serde_json::from_str::<serde_json::Value>(&value).unwrap_or_else(|_| serde_json::json!([]));
        Ok(serde_json::json!({ "id": row.get::<_, String>(0)?, "memoryType": row.get::<_, String>(1)?, "scope": row.get::<_, String>(2)?, "subject": row.get::<_, String>(3)?, "predicate": row.get::<_, Option<String>>(4)?, "value": row.get::<_, String>(5)?, "sourceConversationId": row.get::<_, String>(6)?, "sourceMessageIds": parse(row.get(7)?), "relatedMentionIds": parse(row.get(8)?), "relatedNodeIds": parse(row.get(9)?), "createdAt": row.get::<_, String>(10)?, "updatedAt": row.get::<_, String>(11)?, "confidence": row.get::<_, f64>(12)?, "priority": row.get::<_, i64>(13)?, "expiresAt": row.get::<_, Option<String>>(14)?, "supersededBy": row.get::<_, Option<String>>(15)? }))
    }).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string());
    result
}

pub fn save_summary(state: &ProjectState, summary: serde_json::Value) -> Result<(), String> {
    let get = |key: &str| summary.get(key).and_then(|item| item.as_str());
    let id = get("id").ok_or("Resumen sin id.")?;
    let conversation_id = get("conversationId").ok_or("Resumen sin conversación.")?;
    let version = summary.get("version").and_then(|item| item.as_i64()).ok_or("Resumen sin versión.")?;
    let start = summary.get("sourceSequenceStart").and_then(|item| item.as_i64()).ok_or("Resumen sin rango inicial.")?;
    let end = summary.get("sourceSequenceEnd").and_then(|item| item.as_i64()).ok_or("Resumen sin rango final.")?;
    let created_at = get("createdAt").ok_or("Resumen sin fecha.")?;
    let raw = serde_json::to_string(&summary).map_err(|error| error.to_string())?;
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    project.db.execute("INSERT INTO ai_conversation_summaries(id,conversation_id,version,summary_json,source_sequence_start,source_sequence_end,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(conversation_id,version) DO UPDATE SET summary_json=excluded.summary_json, source_sequence_start=excluded.source_sequence_start, source_sequence_end=excluded.source_sequence_end, created_at=excluded.created_at", params![id, conversation_id, version, raw, start, end, created_at]).map_err(|error| error.to_string())?;
    mark_archive_dirty(project)
}

pub fn load_latest_summary(state: &ProjectState, conversation_id: String) -> Result<Option<serde_json::Value>, String> {
    let guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_ref().ok_or_else(|| "No hay un proyecto abierto.".to_string())?;
    let raw: Option<String> = project.db.query_row("SELECT summary_json FROM ai_conversation_summaries WHERE conversation_id=?1 ORDER BY version DESC LIMIT 1", [conversation_id], |row| row.get(0)).optional().map_err(|error| error.to_string())?;
    raw.map(|value| serde_json::from_str(&value).map_err(|error| error.to_string())).transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::OpenProject;
    use rusqlite::Connection;
    use std::path::PathBuf;
    use std::sync::Mutex;

    fn state() -> ProjectState {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(crate::persistence::PROJECT_META_SCHEMA).unwrap();
        db.execute_batch(crate::persistence::AI_CONVERSATION_SCHEMA).unwrap();
        Mutex::new(Some(OpenProject { info: crate::project::ProjectInfo { name: "test".into(), folder_path: "".into(), database_path: "".into(), last_edited: 0 }, db, archive_path: None, working_folder: PathBuf::new(), archive_dirty: false }))
    }

    #[test]
    fn persistent_messages_are_ordered_and_isolated() {
        let state = state();
        for id in ["a", "b"] { create_conversation(&state, id.into(), None, None, id.into(), "2026-01-01T00:00:00Z".into()).unwrap(); }
        for index in 0..1_005 { append_message(&state, NewMessage { id: format!("a-{index}"), conversation_id: "a".into(), role: "user".into(), content: format!("message {index}"), created_at: format!("2026-01-01T00:00:{:02}Z", index % 60), response_type: None, operation: None, pipeline: None, model: None, metadata: None }).unwrap(); }
        append_message(&state, NewMessage { id: "b-1".into(), conversation_id: "b".into(), role: "user".into(), content: "private B".into(), created_at: "2026-01-01T00:01:00Z".into(), response_type: None, operation: None, pipeline: None, model: None, metadata: None }).unwrap();
        let page = list_messages(&state, "a".into(), None, 20).unwrap();
        assert_eq!(page.len(), 20);
        assert_eq!(page.first().unwrap().sequence, 986);
        assert!(page.iter().all(|message| message.conversation_id == "a"));
        assert!(search_messages(&state, "a".into(), "private".into(), 10).unwrap().is_empty());
    }
}
