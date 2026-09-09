use std::collections::HashSet;

pub const NODAL_SCHEMA_VERSION_KEY: &str = "nodal_schema_version";
pub const CURRENT_NODAL_SCHEMA_VERSION: &str = "1";

// Backend persistence IDs are deliberately stable: labels and renderers may change,
// but an existing .his project must always resolve these stored identities.
pub const PERSISTED_NODE_TYPES: &[&str] = &[
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

pub struct ProjectResourceDefinition {
    pub kind: &'static str,
    pub node_type: &'static str,
    pub extension: &'static str,
    pub metadata_prefix: &'static str,
    validate: fn(&[u8]) -> Result<(), &'static str>,
}

fn validate_pdf(data: &[u8]) -> Result<(), &'static str> {
    if data.windows(5).take(1024).any(|window| window == b"%PDF-") {
        Ok(())
    } else {
        Err("El archivo no contiene una cabecera PDF válida.")
    }
}

pub const PROJECT_RESOURCE_DEFINITIONS: &[ProjectResourceDefinition] =
    &[ProjectResourceDefinition {
        kind: "pdf",
        node_type: "pdf",
        extension: "pdf",
        metadata_prefix: "<!--hisfuture-pdf-resource:",
        validate: validate_pdf,
    }];

pub fn project_resource_definition(kind: &str) -> Option<&'static ProjectResourceDefinition> {
    PROJECT_RESOURCE_DEFINITIONS
        .iter()
        .find(|definition| definition.kind == kind)
}

pub fn validate_project_resource(kind: &str, data: &[u8]) -> Result<(), String> {
    let definition = project_resource_definition(kind)
        .ok_or_else(|| format!("Tipo de recurso no compatible: {kind}"))?;
    (definition.validate)(data).map_err(str::to_string)
}

pub fn resource_id_from_content(node_type: &str, content: &str) -> Option<(&'static str, String)> {
    let definition = PROJECT_RESOURCE_DEFINITIONS
        .iter()
        .find(|definition| definition.node_type == node_type)?;
    let start = content.find(definition.metadata_prefix)? + definition.metadata_prefix.len();
    let end = content[start..].find("-->")? + start;
    let metadata: serde_json::Value = serde_json::from_str(&content[start..end]).ok()?;
    let resource_id = metadata.get("resourceId")?.as_str()?.to_string();
    Some((definition.kind, resource_id))
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
            Some(("pdf", "resource-1".into()))
        );
        assert_eq!(
            resource_id_from_content("imagen", "<p><img src=\"data:image/png;base64,AA==\"></p>"),
            None,
            "inline images never enter project-resource cleanup"
        );
    }
}
