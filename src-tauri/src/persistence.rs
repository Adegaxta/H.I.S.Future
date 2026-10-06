use std::collections::HashSet;

pub const NODAL_SCHEMA_VERSION_KEY: &str = "nodal_schema_version";
pub const CURRENT_NODAL_SCHEMA_VERSION: &str = "1";

// Backend persistence IDs are deliberately stable: labels and renderers may change,
// but an existing .his project must always resolve these stored identities.
pub const PERSISTED_NODE_TYPES: &[&str] = &[
    "categoria",
    "pagina",
    "proyecto",
    "imagen",
    "calendario",
    "tempo",
    "pdf",
    "curso",
    "tarea",
    "video",
];

pub struct ProjectResourceDefinition {
    pub kind: &'static str,
    pub node_type: &'static str,
    pub extension: &'static str,
    pub metadata_prefix: &'static str,
    validate: fn(&[u8]) -> Result<(), &'static str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProjectResourceFormat {
    pub extension: &'static str,
    pub mime_type: &'static str,
}

fn validate_pdf(data: &[u8]) -> Result<(), &'static str> {
    if data.windows(5).take(1024).any(|window| window == b"%PDF-") {
        Ok(())
    } else {
        Err("El archivo no contiene una cabecera PDF válida.")
    }
}

pub const PROJECT_RESOURCE_DEFINITIONS: &[ProjectResourceDefinition] =
    &[
      ProjectResourceDefinition {
        kind: "pdf",
        node_type: "pdf",
        extension: "pdf",
        metadata_prefix: "<!--hisfuture-pdf-resource:",
        validate: validate_pdf,
      },
      ProjectResourceDefinition {
        kind: "image",
        node_type: "imagen",
        extension: "png",
        metadata_prefix: "<!--hisfuture-image-resource:",
        validate: |_| Ok(()),
      },
    ];

pub fn project_resource_definition(kind: &str) -> Option<&'static ProjectResourceDefinition> {
    PROJECT_RESOURCE_DEFINITIONS
        .iter()
        .find(|definition| definition.kind == kind)
}

#[cfg(test)]
pub fn validate_project_resource(kind: &str, data: &[u8]) -> Result<(), String> {
    project_resource_format(kind, data, None).map(|_| ())
}

fn requested_matches(requested: Option<&str>, actual: &str) -> bool {
    requested.is_none_or(|value| {
        let value = value.trim().to_ascii_lowercase();
        value == actual || (actual == "jpg" && matches!(value.as_str(), "jpeg" | "jfif"))
    })
}

fn image_resource_format(data: &[u8]) -> Option<ProjectResourceFormat> {
    let format = if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        ProjectResourceFormat { extension: "png", mime_type: "image/png" }
    } else if data.starts_with(&[0xff, 0xd8, 0xff]) {
        ProjectResourceFormat { extension: "jpg", mime_type: "image/jpeg" }
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        ProjectResourceFormat { extension: "gif", mime_type: "image/gif" }
    } else if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        ProjectResourceFormat { extension: "webp", mime_type: "image/webp" }
    } else if data.starts_with(b"BM") {
        ProjectResourceFormat { extension: "bmp", mime_type: "image/bmp" }
    } else if data.starts_with(&[0, 0, 1, 0]) {
        ProjectResourceFormat { extension: "ico", mime_type: "image/x-icon" }
    } else if data.len() >= 12 && &data[4..8] == b"ftyp" {
        match &data[8..12] {
            b"avif" | b"avis" => ProjectResourceFormat { extension: "avif", mime_type: "image/avif" },
            b"heic" | b"heix" | b"hevc" | b"hevx" | b"heim" | b"heis" => ProjectResourceFormat { extension: "heic", mime_type: "image/heic" },
            b"mif1" | b"msf1" => ProjectResourceFormat { extension: "heif", mime_type: "image/heif" },
            _ => return None,
        }
    } else {
        let prefix = String::from_utf8_lossy(&data[..data.len().min(4096)]);
        let normalized = prefix.trim_start_matches('\u{feff}').trim_start();
        if normalized.starts_with("<svg") || (normalized.starts_with("<?xml") && normalized.contains("<svg")) {
            ProjectResourceFormat { extension: "svg", mime_type: "image/svg+xml" }
        } else {
            return None;
        }
    };
    Some(format)
}

pub fn project_resource_format(
    kind: &str,
    data: &[u8],
    requested_extension: Option<&str>,
) -> Result<ProjectResourceFormat, String> {
    let definition = project_resource_definition(kind)
        .ok_or_else(|| format!("Tipo de recurso no compatible: {kind}"))?;
    if kind == "image" {
        let format = image_resource_format(data)
            .ok_or_else(|| "El archivo no contiene una imagen compatible válida.".to_string())?;
        if !requested_matches(requested_extension, format.extension) {
            return Err("La extensión de la imagen no coincide con su contenido.".into());
        }
        return Ok(format);
    }
    (definition.validate)(data).map_err(str::to_string)?;
    if !requested_matches(requested_extension, definition.extension) {
        return Err("La extensión del recurso no coincide con su contenido.".into());
    }
    Ok(ProjectResourceFormat { extension: definition.extension, mime_type: "application/pdf" })
}

pub fn resource_id_from_content(node_type: &str, content: &str) -> Option<(&'static str, String, String)> {
    let definition = PROJECT_RESOURCE_DEFINITIONS
        .iter()
        .find(|definition| definition.node_type == node_type)?;
    let start = content.find(definition.metadata_prefix)? + definition.metadata_prefix.len();
    let end = content[start..].find("-->")? + start;
    let metadata: serde_json::Value = serde_json::from_str(&content[start..end]).ok()?;
    let resource_id = metadata.get("resourceId")?.as_str()?.to_string();
    let extension = metadata
        .get("extension")
        .and_then(|value| value.as_str())
        .unwrap_or(definition.extension)
        .to_ascii_lowercase();
    Some((definition.kind, resource_id, extension))
}

pub const PROJECT_META_SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

pub const LINKS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS links (
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  PRIMARY KEY (from_node_id, to_node_id),
  FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
"#;

pub const TAGS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(name)) > 0),
  color TEXT NOT NULL CHECK(length(color) BETWEEN 4 AND 32),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_name_unique ON tags(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS node_tags (
  node_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (node_id, tag_id),
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS node_tags_tag_id ON node_tags(tag_id);
"#;

pub const AI_CONVERSATION_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  vault_id TEXT,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  message_count INTEGER NOT NULL DEFAULT 0 CHECK(message_count >= 0)
);

CREATE INDEX IF NOT EXISTS ai_conversations_updated_at ON ai_conversations(archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_conversations_project ON ai_conversations(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  response_type TEXT,
  operation TEXT,
  pipeline TEXT,
  model TEXT,
  metadata_json TEXT,
  UNIQUE(conversation_id, sequence),
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_sequence ON ai_messages(conversation_id, sequence DESC);
CREATE INDEX IF NOT EXISTS ai_messages_created_at ON ai_messages(created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS ai_messages_fts USING fts5(
  content,
  conversation_id UNINDEXED,
  message_id UNINDEXED,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS ai_messages_fts_insert AFTER INSERT ON ai_messages BEGIN
  INSERT INTO ai_messages_fts(rowid, content, conversation_id, message_id)
  VALUES (new.rowid, new.content, new.conversation_id, new.id);
END;
CREATE TRIGGER IF NOT EXISTS ai_messages_fts_delete AFTER DELETE ON ai_messages BEGIN
  DELETE FROM ai_messages_fts WHERE rowid = old.rowid;
END;
CREATE TRIGGER IF NOT EXISTS ai_messages_fts_update AFTER UPDATE OF content ON ai_messages BEGIN
  DELETE FROM ai_messages_fts WHERE rowid = old.rowid;
  INSERT INTO ai_messages_fts(rowid, content, conversation_id, message_id)
  VALUES (new.rowid, new.content, new.conversation_id, new.id);
END;

CREATE TABLE IF NOT EXISTS ai_semantic_mentions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  surface_text TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  semantic_type TEXT NOT NULL,
  subject TEXT,
  relation TEXT,
  object_value TEXT,
  temporal_reference_json TEXT,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  canonical_node_id TEXT,
  source TEXT NOT NULL,
  modality TEXT,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_mentions_conversation_type ON ai_semantic_mentions(conversation_id, semantic_type);
CREATE INDEX IF NOT EXISTS ai_mentions_normalized ON ai_semantic_mentions(conversation_id, normalized_value);
CREATE INDEX IF NOT EXISTS ai_mentions_subject ON ai_semantic_mentions(conversation_id, subject);
CREATE INDEX IF NOT EXISTS ai_mentions_message ON ai_semantic_mentions(message_id);

CREATE TABLE IF NOT EXISTS ai_conversation_states (
  conversation_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_memory_records (
  id TEXT PRIMARY KEY,
  memory_type TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope <> 'GLOBAL'),
  subject TEXT NOT NULL,
  predicate TEXT,
  value TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  source_message_ids_json TEXT NOT NULL,
  related_mention_ids_json TEXT NOT NULL,
  related_node_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  priority INTEGER NOT NULL,
  expires_at TEXT,
  superseded_by TEXT,
  FOREIGN KEY (source_conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (superseded_by) REFERENCES ai_memory_records(id)
);

CREATE INDEX IF NOT EXISTS ai_memory_scope_updated ON ai_memory_records(scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_memory_subject ON ai_memory_records(subject, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_memory_conversation ON ai_memory_records(source_conversation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_memory_active_expiry ON ai_memory_records(superseded_by, expires_at);

CREATE TABLE IF NOT EXISTS ai_conversation_summaries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  summary_json TEXT NOT NULL,
  source_sequence_start INTEGER NOT NULL,
  source_sequence_end INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(conversation_id, version),
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_summaries_conversation_version ON ai_conversation_summaries(conversation_id, version DESC);

INSERT INTO project_meta(key, value) VALUES('ai_conversation_schema_version', '1')
ON CONFLICT(key) DO UPDATE SET value=excluded.value
WHERE project_meta.value IS NOT excluded.value;
"#;

pub fn is_persisted_node_type(node_type: &str) -> bool {
    PERSISTED_NODE_TYPES.contains(&node_type)
}

fn sql_node_type_list() -> String {
    PERSISTED_NODE_TYPES
        .iter()
        .map(|node_type| format!("'{node_type}'"))
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn nodes_table_sql(table_name: &str, if_not_exists: bool) -> String {
    debug_assert!(matches!(table_name, "nodes" | "nodes_new"));
    let guard = if if_not_exists { "IF NOT EXISTS " } else { "" };
    format!(
        "CREATE TABLE {guard}{table_name} (\n\
           id TEXT PRIMARY KEY,\n\
           name TEXT NOT NULL,\n\
           type TEXT NOT NULL CHECK(type IN ({})),\n\
           parent_id TEXT,\n\
           sort_order INTEGER NOT NULL DEFAULT 0,\n\
           content TEXT NOT NULL DEFAULT '<p><br></p>',\n\
           FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE\n\
         );",
        sql_node_type_list()
    )
}

pub fn registered_types_from_schema(schema: &str) -> Option<HashSet<String>> {
    let lowercase = schema.to_ascii_lowercase();
    let marker = "check(type in (";
    let start = lowercase.find(marker)? + marker.len();
    let remainder = schema.get(start..)?;
    let end = remainder.find(')')?;
    let types = remainder[..end]
        .split(',')
        .map(|value| value.trim().trim_matches('\'').to_string())
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>();
    (!types.is_empty()).then_some(types)
}

pub fn schema_matches_registry(schema: &str) -> bool {
    registered_types_from_schema(schema).is_some_and(|types| {
        types
            == PERSISTED_NODE_TYPES
                .iter()
                .map(|node_type| (*node_type).to_string())
                .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_node_schema_is_owned_by_the_registry() {
        let schema = nodes_table_sql("nodes", true);
        assert!(schema_matches_registry(&schema));
        assert!(is_persisted_node_type("pagina"));
        assert!(is_persisted_node_type("proyecto"));
        assert!(!is_persisted_node_type("unknown"));
    }

    #[test]
    fn resource_registry_owns_validation_and_metadata_resolution() {
        let definition = project_resource_definition("pdf").expect("PDF definition");
        assert_eq!(definition.extension, "pdf");
        assert!(validate_project_resource("pdf", b"%PDF-1.4").is_ok());
        assert!(validate_project_resource("pdf", b"not a document").is_err());
        assert!(validate_project_resource("audio", b"bytes").is_err());
        assert_eq!(
            resource_id_from_content(
                "pdf",
                "<!--hisfuture-pdf-resource:{\"resourceId\":\"resource-1\"}--><p></p>"
            ),
            Some(("pdf", "resource-1".into(), "pdf".into()))
        );
        assert_eq!(
            resource_id_from_content("imagen", "<p><img src=\"data:image/png;base64,AA==\"></p>"),
            None,
            "inline images never enter project-resource cleanup"
        );
        assert_eq!(
            resource_id_from_content(
                "imagen",
                "<!--hisfuture-image-resource:{\"version\":2,\"resourceId\":\"image-1\",\"extension\":\"webp\"}--><p></p>"
            ),
            Some(("image", "image-1".into(), "webp".into()))
        );
    }

    #[test]
    fn image_resources_are_identified_by_bytes_not_browser_metadata() {
        let formats: &[(&[u8], &str, &str)] = &[
            (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
            (&[0xff, 0xd8, 0xff, 0xd9], "jpg", "image/jpeg"),
            (b"GIF89a", "gif", "image/gif"),
            (b"RIFF\0\0\0\0WEBP", "webp", "image/webp"),
            (b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", "svg", "image/svg+xml"),
        ];
        for (bytes, extension, mime) in formats {
            let format = project_resource_format("image", bytes, Some(extension)).unwrap();
            assert_eq!(format.extension, *extension);
            assert_eq!(format.mime_type, *mime);
        }
        assert!(project_resource_format("image", b"not an image", Some("png")).is_err());
        assert!(project_resource_format("image", b"GIF89a", Some("png")).is_err());
        assert!(project_resource_format("image", b"\x89PNG\r\n\x1a\n", Some("exe")).is_err());
    }
}
