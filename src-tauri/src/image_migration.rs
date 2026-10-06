use crate::persistence::{project_resource_format, resource_id_from_content};
use crate::project::{
    mark_archive_dirty, validate_archive_file, write_archive, NodeRecord, OpenProject, ProjectState,
};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const JOURNAL_FILE: &str = ".hisfuture-image-migration.json";
const STAGING_DIR: &str = ".hisfuture-image-migration";

#[derive(Default)]
pub struct MigrationCancellation(AtomicBool);

impl MigrationCancellation {
    pub fn reset(&self) { self.0.store(false, Ordering::SeqCst); }
    pub fn cancel(&self) { self.0.store(true, Ordering::SeqCst); }
    pub fn requested(&self) -> bool { self.0.load(Ordering::SeqCst) }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReference {
    pub node_id: String,
    pub node_name: String,
    pub location: String,
    pub mentions: usize,
    pub inline_copies: usize,
    pub block_ids: Vec<String>,
    pub expected_content_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationImagePlan {
    pub image_node_id: String,
    pub image_node_name: String,
    pub location: String,
    pub file_name: String,
    pub mime_type: String,
    pub file_size: usize,
    pub base64_characters: usize,
    pub calculated_hash: String,
    pub existing_hash: Option<String>,
    pub target_resource_id: String,
    pub target_extension: String,
    pub reuses_resource: bool,
    pub expected_content_hash: String,
    pub references: Vec<MigrationReference>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationIssue {
    pub image_node_id: String,
    pub image_node_name: String,
    pub classification: String,
    pub reason: String,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MigrationEstimate {
    pub legacy_base64_characters: usize,
    pub legacy_binary_bytes: usize,
    pub estimated_reference_bytes_after: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMigrationPlan {
    pub version: u32,
    pub plan_id: String,
    pub images: Vec<MigrationImagePlan>,
    pub already_modern: usize,
    pub external_provider: usize,
    pub ambiguous: Vec<MigrationIssue>,
    pub corrupt: Vec<MigrationIssue>,
    pub unknown: Vec<MigrationIssue>,
    pub affected_pages: usize,
    pub affected_mentions: usize,
    pub estimate: MigrationEstimate,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMigrationProgress {
    pub phase: String,
    pub current: usize,
    pub total: usize,
    pub image_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMigrationResult {
    pub nodes: Vec<NodeRecord>,
    pub deleted_nodes: Vec<NodeRecord>,
    pub backup_path: String,
    pub migrated: usize,
    pub already_modern: usize,
    pub omitted: usize,
    pub conflicts: usize,
    pub failed: usize,
    pub resources_created: usize,
    pub resources_reused: usize,
    pub base64_characters_removed: usize,
    pub binary_bytes: usize,
    pub backup_ms: f64,
    pub resource_ms: f64,
    pub sqlite_ms: f64,
    pub total_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MigrationJournal {
    version: u32,
    plan_id: String,
    status: String,
    backup_path: String,
    created_resources: Vec<ResourceTarget>,
    image_targets: Vec<ImageTarget>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceTarget {
    resource_id: String,
    extension: String,
    hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageTarget {
    image_node_id: String,
    resource_id: String,
    extension: String,
}

#[derive(Debug, Clone)]
struct LocatedNode {
    node: NodeRecord,
    location: &'static str,
}

#[derive(Debug, Clone)]
struct LegacyImage {
    bytes: Vec<u8>,
    base64_characters: usize,
    mime_type: String,
    extension: String,
    file_name: String,
    hash: String,
    existing_hash: Option<String>,
    description: String,
    provenance: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
struct HtmlAttribute {
    name: String,
    value: Option<String>,
    start: usize,
    end: usize,
}

#[derive(Debug, Clone)]
struct HtmlTag {
    start: usize,
    end: usize,
    name: String,
    closing: bool,
    void: bool,
    attributes: Vec<HtmlAttribute>,
}

#[derive(Default)]
struct MentionFacts {
    mentions: usize,
    inline_copies: usize,
    hashes: Vec<String>,
    invalid_sources: Vec<String>,
    block_ids: HashSet<String>,
}

fn sha256(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}

fn content_hash(content: &str) -> String {
    sha256(content.as_bytes())
}

fn decode_html(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn attr<'a>(tag: &'a HtmlTag, name: &str) -> Option<&'a str> {
    tag.attributes
        .iter()
        .find(|item| item.name == name)
        .and_then(|item| item.value.as_deref())
}

fn parse_tags(html: &str) -> Vec<HtmlTag> {
    let bytes = html.as_bytes();
    let mut tags = Vec::new();
    let mut index = 0usize;
    while index < bytes.len() {
        let Some(relative) = html[index..].find('<') else { break };
        let start = index + relative;
        if html[start..].starts_with("<!--") {
            index = html[start + 4..].find("-->").map_or(bytes.len(), |end| start + 4 + end + 3);
            continue;
        }
        let mut cursor = start + 1;
        let closing = bytes.get(cursor) == Some(&b'/');
        if closing { cursor += 1; }
        while bytes.get(cursor).is_some_and(u8::is_ascii_whitespace) { cursor += 1; }
        let name_start = cursor;
        while bytes.get(cursor).is_some_and(|b| b.is_ascii_alphanumeric() || *b == b'-') { cursor += 1; }
        if cursor == name_start { index = start + 1; continue; }
        let name = html[name_start..cursor].to_ascii_lowercase();
        let mut quote = None;
        let mut end = cursor;
        while end < bytes.len() {
            let byte = bytes[end];
            if let Some(active) = quote {
                if byte == active { quote = None; }
            } else if byte == b'\'' || byte == b'"' {
                quote = Some(byte);
            } else if byte == b'>' { break; }
            end += 1;
        }
        if end >= bytes.len() { break; }
        let mut attributes = Vec::new();
        if !closing {
            while cursor < end {
                let whitespace_start = cursor;
                while cursor < end && bytes[cursor].is_ascii_whitespace() { cursor += 1; }
                if cursor >= end || bytes[cursor] == b'/' { break; }
                let attribute_start = cursor;
                while cursor < end && !bytes[cursor].is_ascii_whitespace() && !matches!(bytes[cursor], b'=' | b'/' | b'>') { cursor += 1; }
                if cursor == attribute_start { cursor += 1; continue; }
                let attribute_name = html[attribute_start..cursor].to_ascii_lowercase();
                while cursor < end && bytes[cursor].is_ascii_whitespace() { cursor += 1; }
                let mut value = None;
                if cursor < end && bytes[cursor] == b'=' {
                    cursor += 1;
                    while cursor < end && bytes[cursor].is_ascii_whitespace() { cursor += 1; }
                    if cursor < end && matches!(bytes[cursor], b'\'' | b'"') {
                        let delimiter = bytes[cursor]; cursor += 1;
                        let value_start = cursor;
                        while cursor < end && bytes[cursor] != delimiter { cursor += 1; }
                        value = Some(decode_html(&html[value_start..cursor]));
                        if cursor < end { cursor += 1; }
                    } else {
                        let value_start = cursor;
                        while cursor < end && !bytes[cursor].is_ascii_whitespace() && bytes[cursor] != b'>' { cursor += 1; }
                        value = Some(decode_html(&html[value_start..cursor]));
                    }
                }
                attributes.push(HtmlAttribute { name: attribute_name, value, start: whitespace_start - start, end: cursor - start });
            }
        }
        let void = matches!(name.as_str(), "img" | "br" | "hr" | "input" | "meta" | "link" | "source" | "wbr") || html[start..=end].trim_end_matches('>').trim_end().ends_with('/');
        tags.push(HtmlTag { start, end: end + 1, name, closing, void, attributes });
        index = end + 1;
    }
    tags
}

fn parse_data_url(source: &str, fallback_name: &str, tag: &HtmlTag) -> Result<LegacyImage, String> {
    let comma = source.find(',').ok_or("Data URL sin separador.")?;
    let metadata = &source[5..comma];
    if !metadata.to_ascii_lowercase().contains(";base64") {
        return Err("La imagen inline no utiliza Base64.".into());
    }
    let declared_mime = metadata.split(';').next().unwrap_or_default().to_ascii_lowercase();
    if !declared_mime.starts_with("image/") { return Err("Data URL no es de imagen.".into()); }
    let encoded = source[comma + 1..].chars().filter(|character| !character.is_whitespace()).collect::<String>();
    let bytes = BASE64.decode(encoded.as_bytes()).map_err(|_| "Base64 inválido.".to_string())?;
    let format = project_resource_format("image", &bytes, None)?;
    let hash = sha256(&bytes);
    let existing_hash = attr(tag, "data-image-hash").filter(|value| !value.is_empty()).map(str::to_ascii_lowercase);
    if existing_hash.as_ref().is_some_and(|existing| existing != &hash) {
        return Err(format!("El hash guardado {0} no coincide con el calculado {hash}.", existing_hash.as_deref().unwrap_or_default()));
    }
    let raw_name = attr(tag, "data-image-file-name").filter(|value| !value.trim().is_empty()).unwrap_or(fallback_name);
    let file_name = if raw_name.rsplit_once('.').is_some() { raw_name.to_string() } else { format!("{raw_name}.{}", format.extension) };
    let description = attr(tag, "data-image-description").unwrap_or_default().to_string();
    let provenance = attr(tag, "data-image-provenance").and_then(|value| serde_json::from_str(value).ok());
    Ok(LegacyImage {
        bytes,
        base64_characters: encoded.len(),
        mime_type: format.mime_type.into(),
        extension: format.extension.into(),
        file_name,
        hash,
        existing_hash,
        description,
        provenance,
    })
}

fn legacy_image(content: &str, fallback_name: &str) -> Result<Option<LegacyImage>, String> {
    let tags = parse_tags(content);
    let Some(image) = tags.iter().find(|tag| !tag.closing && tag.name == "img") else { return Ok(None) };
    let Some(source) = attr(image, "src") else { return Ok(None) };
    if !source.to_ascii_lowercase().starts_with("data:image/") { return Ok(None) }
    parse_data_url(source, fallback_name, image).map(Some)
}

fn project_image_metadata(content: &str) -> Option<(String, String, String)> {
    const PREFIX: &str = "<!--hisfuture-image-resource:";
    let start = content.find(PREFIX)? + PREFIX.len();
    let end = content[start..].find("-->")? + start;
    let value: serde_json::Value = serde_json::from_str(&content[start..end]).ok()?;
    Some((
        value.get("resourceId")?.as_str()?.to_string(),
        value.get("extension")?.as_str()?.to_ascii_lowercase(),
        value.get("hash")?.as_str()?.to_ascii_lowercase(),
    ))
}

fn load_nodes(project: &OpenProject) -> Result<(Vec<NodeRecord>, Vec<NodeRecord>), String> {
    let mut statement = project.db.prepare("SELECT id, name, type, parent_id, sort_order, content FROM nodes ORDER BY sort_order, id").map_err(|error| error.to_string())?;
    let active = statement.query_map([], |row| Ok(NodeRecord { id: row.get(0)?, name: row.get(1)?, node_type: row.get(2)?, parent_id: row.get(3)?, order: row.get(4)?, content: row.get(5)? }))
        .map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    let trash_json: Option<String> = project.db.query_row("SELECT value FROM project_meta WHERE key='deletedNodes'", [], |row| row.get(0)).optional().map_err(|error| error.to_string())?;
    let trash = trash_json.as_deref().map(serde_json::from_str).transpose().map_err(|error| format!("Papelera inválida: {error}"))?.unwrap_or_default();
    Ok((active, trash))
}

fn mention_facts_for_targets(content: &str, target_ids: &HashSet<String>) -> HashMap<String, MentionFacts> {
    let tags = parse_tags(content);
    let mut stack: Vec<(String, Option<String>, Option<String>)> = Vec::new();
    let mut results = HashMap::<String, MentionFacts>::new();
    for tag in tags {
        if tag.closing {
            if let Some(index) = stack.iter().rposition(|entry| entry.0 == tag.name) { stack.truncate(index); }
            continue;
        }
        let own_mention = attr(&tag, "data-mention-id").map(str::to_string);
        let own_block = attr(&tag, "data-block-id").map(str::to_string);
        if let Some(target_id) = own_mention.as_ref().filter(|id| target_ids.contains(*id)) {
            results.entry(target_id.clone()).or_default().mentions += 1;
        }
        let active_mention = own_mention.as_deref().or_else(|| stack.iter().rev().find_map(|entry| entry.1.as_deref()));
        if tag.name == "img" && active_mention.is_some_and(|id| target_ids.contains(id)) {
            let target_id = active_mention.unwrap().to_string();
            let result = results.entry(target_id).or_default();
            if let Some(block) = own_block.as_deref().or_else(|| stack.iter().rev().find_map(|entry| entry.2.as_deref())) { result.block_ids.insert(block.to_string()); }
            if let Some(source) = attr(&tag, "src") {
                if source.to_ascii_lowercase().starts_with("data:image/") {
                    match parse_data_url(source, "mention", &tag) {
                        Ok(image) => { result.inline_copies += 1; result.hashes.push(image.hash); }
                        Err(error) => result.invalid_sources.push(error),
                    }
                } else if !source.is_empty() {
                    result.invalid_sources.push(format!("La mención contiene una fuente distinta: {}", &source[..source.len().min(80)]));
                }
            }
        }
        if !tag.void { stack.push((tag.name, own_mention, own_block)); }
    }
    results
}

fn fresh_resource_id(hash: &str, ordinal: usize) -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let digest = sha256(format!("{nanos}:{ordinal}:{hash}").as_bytes());
    format!("img-{}", &digest[..32])
}

fn resource_path(root: &Path, resource_id: &str, extension: &str) -> PathBuf {
    root.join("resources").join("image").join(format!("{resource_id}.{extension}"))
}

fn compute_plan_id(plan: &ImageMigrationPlan) -> Result<String, String> {
    let mut unsigned = plan.clone();
    unsigned.plan_id.clear();
    serde_json::to_vec(&unsigned).map(|bytes| sha256(&bytes)).map_err(|error| error.to_string())
}

fn analyze_project(project: &OpenProject, supplied: Option<&ImageMigrationPlan>) -> Result<ImageMigrationPlan, String> {
    let (active, trash) = load_nodes(project)?;
    let all = active.iter().cloned().map(|node| LocatedNode { node, location: "active" })
        .chain(trash.iter().cloned().map(|node| LocatedNode { node, location: "trash" })).collect::<Vec<_>>();
    let mut modern_by_hash = HashMap::<String, (String, String)>::new();
    let mut already_modern = 0usize;
    let mut external_provider = 0usize;
    let mut ambiguous = Vec::new();
    let mut corrupt = Vec::new();
    let mut unknown = Vec::new();
    for located in all.iter().filter(|item| item.node.node_type == "imagen") {
        if let Some((resource_id, extension, hash)) = project_image_metadata(&located.node.content) {
            already_modern += 1;
            if resource_path(&project.working_folder, &resource_id, &extension).is_file() { modern_by_hash.entry(hash).or_insert((resource_id, extension)); }
        } else {
            let tags = parse_tags(&located.node.content);
            let source = tags.iter().find(|tag| tag.name == "img" && !tag.closing).and_then(|tag| attr(tag, "src"));
            if source.is_some_and(|value| !value.to_ascii_lowercase().starts_with("data:image/")) { external_provider += 1; }
        }
    }
    let mut candidates = Vec::<(&LocatedNode, LegacyImage)>::new();
    for located in all.iter().filter(|item| item.node.node_type == "imagen") {
        if project_image_metadata(&located.node.content).is_some() { continue; }
        let parsed = match legacy_image(&located.node.content, &located.node.name) {
            Ok(Some(image)) => image,
            Ok(None) => {
                let tags = parse_tags(&located.node.content);
                let source = tags.iter().find(|tag| tag.name == "img" && !tag.closing).and_then(|tag| attr(tag, "src"));
                if source.is_none() {
                    unknown.push(MigrationIssue { image_node_id: located.node.id.clone(), image_node_name: located.node.name.clone(), classification: "unknown".into(), reason: "El Nodo Imagen no contiene una representación reconocible.".into(), details: vec![] });
                }
                continue;
            }
            Err(reason) => {
                corrupt.push(MigrationIssue { image_node_id: located.node.id.clone(), image_node_name: located.node.name.clone(), classification: "corrupt".into(), reason, details: vec![] });
                continue;
            }
        };
        candidates.push((located, parsed));
    }
    let candidate_ids = candidates.iter().map(|(located, _)| located.node.id.clone()).collect::<HashSet<_>>();
    let mut references_by_image = HashMap::<String, Vec<(&LocatedNode, MentionFacts)>>::new();
    for container in &all {
        for (image_id, facts) in mention_facts_for_targets(&container.node.content, &candidate_ids) {
            if container.node.id != image_id {
                references_by_image.entry(image_id).or_default().push((container, facts));
            }
        }
    }
    let supplied_targets = supplied.map(|plan| plan.images.iter().map(|image| (image.image_node_id.as_str(), image)).collect::<HashMap<_, _>>());
    let mut planned_by_hash = HashMap::<String, (String, String)>::new();
    let mut images = Vec::new();
    let mut affected_nodes = HashSet::new();
    let mut affected_mentions = 0usize;
    let mut estimate = MigrationEstimate::default();
    for (located, parsed) in candidates {
        let mut references = Vec::new();
        let mut conflicts = Vec::new();
        for (container, facts) in references_by_image.remove(&located.node.id).unwrap_or_default() {
            if facts.hashes.iter().any(|hash| hash != &parsed.hash) {
                conflicts.push(format!("{} ({}) contiene una variante cuyo hash no coincide.", container.node.name, container.node.id));
            }
            conflicts.extend(facts.invalid_sources.iter().map(|detail| format!("{} ({}): {detail}", container.node.name, container.node.id)));
            references.push(MigrationReference {
                node_id: container.node.id.clone(), node_name: container.node.name.clone(), location: container.location.into(),
                mentions: facts.mentions, inline_copies: facts.inline_copies, block_ids: { let mut ids = facts.block_ids.into_iter().collect::<Vec<_>>(); ids.sort(); ids },
                expected_content_hash: content_hash(&container.node.content),
            });
        }
        references.sort_by(|left, right| left.node_id.cmp(&right.node_id));
        if !conflicts.is_empty() {
            ambiguous.push(MigrationIssue { image_node_id: located.node.id.clone(), image_node_name: located.node.name.clone(), classification: "conflict".into(), reason: "El binario del Nodo Imagen y una o más menciones no son equivalentes.".into(), details: conflicts });
            continue;
        }
        for reference in &references {
            affected_mentions += reference.mentions;
            affected_nodes.insert(reference.node_id.clone());
        }
        let supplied_image = supplied_targets.as_ref().and_then(|targets| targets.get(located.node.id.as_str())).copied();
        let (target_resource_id, target_extension, reuses_resource) = if let Some(existing) = modern_by_hash.get(&parsed.hash).or_else(|| planned_by_hash.get(&parsed.hash)) {
            (existing.0.clone(), existing.1.clone(), true)
        } else if let Some(existing) = supplied_image.filter(|existing| {
            !existing.reuses_resource || resource_path(&project.working_folder, &existing.target_resource_id, &existing.target_extension).is_file()
        }) {
            (existing.target_resource_id.clone(), existing.target_extension.clone(), existing.reuses_resource)
        } else {
            (fresh_resource_id(&parsed.hash, images.len()), parsed.extension.clone(), false)
        };
        planned_by_hash.insert(parsed.hash.clone(), (target_resource_id.clone(), target_extension.clone()));
        estimate.legacy_base64_characters += parsed.base64_characters + references.iter().map(|reference| reference.inline_copies * parsed.base64_characters).sum::<usize>();
        estimate.legacy_binary_bytes += parsed.bytes.len();
        estimate.estimated_reference_bytes_after += 300 + references.iter().map(|reference| reference.mentions * 180).sum::<usize>();
        images.push(MigrationImagePlan {
            image_node_id: located.node.id.clone(), image_node_name: located.node.name.clone(), location: located.location.into(),
            file_name: parsed.file_name, mime_type: parsed.mime_type, file_size: parsed.bytes.len(), base64_characters: parsed.base64_characters,
            calculated_hash: parsed.hash, existing_hash: parsed.existing_hash, target_resource_id, target_extension, reuses_resource,
            expected_content_hash: content_hash(&located.node.content), references,
        });
    }
    images.sort_by(|left, right| left.image_node_id.cmp(&right.image_node_id));
    ambiguous.sort_by(|left, right| left.image_node_id.cmp(&right.image_node_id));
    corrupt.sort_by(|left, right| left.image_node_id.cmp(&right.image_node_id));
    unknown.sort_by(|left, right| left.image_node_id.cmp(&right.image_node_id));
    let mut plan = ImageMigrationPlan { version: 1, plan_id: String::new(), images, already_modern, external_provider, ambiguous, corrupt, unknown, affected_pages: affected_nodes.len(), affected_mentions, estimate };
    plan.plan_id = compute_plan_id(&plan)?;
    Ok(plan)
}

pub fn analyze(state: &ProjectState) -> Result<ImageMigrationPlan, String> {
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or("No hay un proyecto abierto.")?;
    recover_if_needed(project)?;
    analyze_project(project, None)
}

fn rewrite_image_tag(original: &str, tag: &HtmlTag) -> String {
    let mut removals = tag.attributes.iter().filter(|attribute| matches!(attribute.name.as_str(), "src" | "data-his-runtime-image")).map(|attribute| (attribute.start, attribute.end)).collect::<Vec<_>>();
    removals.sort_by(|left, right| right.0.cmp(&left.0));
    let mut rewritten = original.to_string();
    for (start, end) in removals { rewritten.replace_range(start..end, ""); }
    let mut additions = String::new();
    if !tag.attributes.iter().any(|attribute| attribute.name == "data-his-image-placeholder") { additions.push_str(" data-his-image-placeholder=\"true\""); }
    if !tag.attributes.iter().any(|attribute| attribute.name == "data-no-resize") { additions.push_str(" data-no-resize=\"true\""); }
    let insert = rewritten.rfind('>').unwrap_or(rewritten.len());
    let insert = if rewritten[..insert].trim_end().ends_with('/') { rewritten[..insert].rfind('/').unwrap_or(insert) } else { insert };
    rewritten.insert_str(insert, &additions);
    rewritten
}

fn rewrite_mentions(content: &str, migratable_ids: &HashSet<String>) -> String {
    let tags = parse_tags(content);
    let mut stack: Vec<(String, Option<String>)> = Vec::new();
    let mut replacements = Vec::<(usize, usize, String)>::new();
    for tag in tags {
        if tag.closing {
            if let Some(index) = stack.iter().rposition(|entry| entry.0 == tag.name) { stack.truncate(index); }
            continue;
        }
        let own_mention = attr(&tag, "data-mention-id").map(str::to_string);
        let active_mention = own_mention.as_deref().or_else(|| stack.iter().rev().find_map(|entry| entry.1.as_deref()));
        if tag.name == "img" && active_mention.is_some_and(|id| migratable_ids.contains(id)) {
            replacements.push((tag.start, tag.end, rewrite_image_tag(&content[tag.start..tag.end], &HtmlTag { start: 0, end: tag.end - tag.start, ..tag.clone() })));
        }
        if !tag.void { stack.push((tag.name, own_mention)); }
    }
    let mut result = content.to_string();
    for (start, end, replacement) in replacements.into_iter().rev() { result.replace_range(start..end, &replacement); }
    result
}

fn image_v2_content(image: &MigrationImagePlan, legacy: &LegacyImage) -> Result<String, String> {
    let metadata = serde_json::json!({
        "version": 2,
        "resourceId": image.target_resource_id,
        "fileName": legacy.file_name,
        "fileSize": legacy.bytes.len(),
        "mimeType": legacy.mime_type,
        "extension": image.target_extension,
        "hash": legacy.hash,
        "description": legacy.description,
        "provenance": legacy.provenance,
    });
    Ok(format!("<!--hisfuture-image-resource:{}--><p><br></p>", serde_json::to_string(&metadata).map_err(|error| error.to_string())?))
}

fn sync_write(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| format!("No se pudo preparar staging: {error}"))?; }
    let mut file = fs::OpenOptions::new().create_new(true).write(true).open(path).map_err(|error| format!("No se pudo escribir staging: {error}"))?;
    file.write_all(data).and_then(|_| file.sync_all()).map_err(|error| format!("No se pudo hacer durable el recurso: {error}"))
}

fn write_journal(project: &OpenProject, journal: &MigrationJournal) -> Result<(), String> {
    let path = project.working_folder.join(JOURNAL_FILE);
    let temporary = project.working_folder.join(format!("{JOURNAL_FILE}.tmp"));
    fs::write(&temporary, serde_json::to_vec_pretty(journal).map_err(|error| error.to_string())?).map_err(|error| format!("No se pudo escribir el journal: {error}"))?;
    fs::OpenOptions::new().write(true).open(&temporary).and_then(|file| file.sync_all()).map_err(|error| format!("No se pudo sincronizar el journal: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("No se pudo confirmar el journal: {error}"))
}

fn create_backup(project: &OpenProject) -> Result<PathBuf, String> {
    let archive = project.archive_path.as_ref().ok_or("La migración segura requiere un proyecto .his; los proyectos de carpeta no son compatibles.")?;
    let parent = archive.parent().ok_or("El proyecto no tiene una carpeta contenedora válida.")?;
    let stem = archive.file_stem().and_then(|value| value.to_str()).unwrap_or("Proyecto");
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    for suffix in 0..1000usize {
        let name = if suffix == 0 { format!("{stem}.backup-before-image-migration-{timestamp}.his") } else { format!("{stem}.backup-before-image-migration-{timestamp}-{suffix}.his") };
        let path = parent.join(name);
        match fs::OpenOptions::new().create_new(true).write(true).open(&path) {
            Ok(file) => {
                if let Err(error) = write_archive(&project.working_folder, file).and_then(|_| validate_archive_file(&path)) {
                    let _ = fs::remove_file(&path); return Err(format!("No se pudo crear un backup verificable. Migración abortada: {error}"));
                }
                if fs::metadata(&path).map_err(|error| error.to_string())?.len() == 0 { let _ = fs::remove_file(&path); return Err("El backup resultó vacío. Migración abortada.".into()); }
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("No se pudo reservar el backup. Migración abortada: {error}")),
        }
    }
    Err("No se pudo elegir un nombre de backup libre.".into())
}

fn current_resource_refs(active: &[NodeRecord], trash: &[NodeRecord]) -> HashSet<(String, String)> {
    active.iter().chain(trash).filter_map(|node| resource_id_from_content(&node.node_type, &node.content)).filter(|(kind, _, _)| *kind == "image").map(|(_, id, extension)| (id, extension)).collect()
}

pub fn recover_if_needed(project: &mut OpenProject) -> Result<(), String> {
    let path = project.working_folder.join(JOURNAL_FILE);
    if !path.is_file() { return Ok(()) }
    let journal: MigrationJournal = serde_json::from_slice(&fs::read(&path).map_err(|error| format!("No se pudo leer el journal de migración: {error}"))?).map_err(|error| format!("Journal de migración inválido: {error}"))?;
    let (active, trash) = load_nodes(project)?;
    let migrated = journal.image_targets.iter().filter(|target| active.iter().chain(&trash).any(|node| node.id == target.image_node_id && project_image_metadata(&node.content).is_some_and(|metadata| metadata.0 == target.resource_id))).count();
    if migrated == journal.image_targets.len() {
        for target in &journal.image_targets {
            if !resource_path(&project.working_folder, &target.resource_id, &target.extension).is_file() {
                return Err(format!("La migración {} fue confirmada pero falta el recurso {}. Restaura el backup {}.", journal.plan_id, target.resource_id, journal.backup_path));
            }
        }
    } else if migrated == 0 {
        let references = current_resource_refs(&active, &trash);
        for resource in &journal.created_resources {
            if !references.contains(&(resource.resource_id.clone(), resource.extension.clone())) { let _ = fs::remove_file(resource_path(&project.working_folder, &resource.resource_id, &resource.extension)); }
        }
    } else {
        return Err(format!("La migración {} presenta un estado parcial imposible. Abre el backup {}.", journal.plan_id, journal.backup_path));
    }
    let _ = fs::remove_dir_all(project.working_folder.join(STAGING_DIR).join(&journal.plan_id));
    fs::remove_file(path).map_err(|error| format!("No se pudo cerrar el recovery journal: {error}"))?;
    Ok(())
}

pub fn execute<F, C>(state: &ProjectState, plan: ImageMigrationPlan, mut progress: F, should_cancel: C) -> Result<ImageMigrationResult, String>
where F: FnMut(&ImageMigrationProgress), C: Fn() -> bool {
    let total_started = Instant::now();
    if plan.version != 1 || compute_plan_id(&plan)? != plan.plan_id { return Err("El plan de migración fue alterado o no es compatible.".into()) }
    let mut guard = state.lock().map_err(|_| "No se pudo bloquear el proyecto.".to_string())?;
    let project = guard.as_mut().ok_or("No hay un proyecto abierto.")?;
    recover_if_needed(project)?;
    let fresh = analyze_project(project, Some(&plan))?;
    if fresh != plan { return Err("El proyecto cambió desde la auditoría. Ejecuta el análisis nuevamente.".into()) }
    if plan.images.is_empty() {
        let (nodes, deleted_nodes) = load_nodes(project)?;
        return Ok(ImageMigrationResult { nodes, deleted_nodes, backup_path: String::new(), migrated: 0, already_modern: plan.already_modern, omitted: plan.corrupt.len() + plan.unknown.len(), conflicts: plan.ambiguous.len(), failed: 0, resources_created: 0, resources_reused: 0, base64_characters_removed: 0, binary_bytes: 0, backup_ms: 0.0, resource_ms: 0.0, sqlite_ms: 0.0, total_ms: total_started.elapsed().as_secs_f64() * 1000.0 });
    }
    progress(&ImageMigrationProgress { phase: "backup".into(), current: 0, total: plan.images.len(), image_name: String::new() });
    let checkpoint: (i64, i64, i64) = project.db.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).map_err(|error| format!("No se pudo preparar SQLite para backup: {error}"))?;
    if checkpoint.0 != 0 { return Err("SQLite está ocupado; no se inició la migración.".into()) }
    let backup_started = Instant::now();
    let backup = create_backup(project)?;
    let backup_ms = backup_started.elapsed().as_secs_f64() * 1000.0;
    let (mut active, mut trash) = load_nodes(project)?;
    let lookup = active.iter().chain(&trash).map(|node| (node.id.clone(), node.clone())).collect::<HashMap<_, _>>();
    let unique_new = plan.images.iter().filter(|image| !image.reuses_resource).map(|image| (image.target_resource_id.clone(), image.target_extension.clone(), image.calculated_hash.clone())).collect::<HashSet<_>>();
    let created_resources = unique_new.iter().map(|(resource_id, extension, hash)| ResourceTarget { resource_id: resource_id.clone(), extension: extension.clone(), hash: hash.clone() }).collect::<Vec<_>>();
    let mut journal = MigrationJournal { version: 1, plan_id: plan.plan_id.clone(), status: "prepared".into(), backup_path: backup.to_string_lossy().into_owned(), created_resources: created_resources.clone(), image_targets: plan.images.iter().map(|image| ImageTarget { image_node_id: image.image_node_id.clone(), resource_id: image.target_resource_id.clone(), extension: image.target_extension.clone() }).collect() };
    write_journal(project, &journal)?;
    let resource_started = Instant::now();
    let staging_root = project.working_folder.join(STAGING_DIR).join(&plan.plan_id).join("resources").join("image");
    for (index, image) in plan.images.iter().enumerate() {
        if should_cancel() {
            for resource in &created_resources { let _ = fs::remove_file(resource_path(&project.working_folder, &resource.resource_id, &resource.extension)); }
            let _ = fs::remove_dir_all(project.working_folder.join(STAGING_DIR).join(&plan.plan_id));
            let _ = fs::remove_file(project.working_folder.join(JOURNAL_FILE));
            return Err(format!("Migración cancelada antes del commit. El proyecto no fue modificado; el backup permanece en {}.", backup.display()));
        }
        progress(&ImageMigrationProgress { phase: "resource".into(), current: index + 1, total: plan.images.len(), image_name: image.image_node_name.clone() });
        let source_node = lookup.get(&image.image_node_id).ok_or("Un Nodo Imagen desapareció durante la migración.")?;
        let legacy = legacy_image(&source_node.content, &source_node.name)?.ok_or("La representación legacy cambió durante la migración.")?;
        if legacy.hash != image.calculated_hash { return Err(format!("El hash de {} cambió durante la migración.", image.image_node_name)) }
        let final_path = resource_path(&project.working_folder, &image.target_resource_id, &image.target_extension);
        if final_path.is_file() {
            if sha256(&fs::read(&final_path).map_err(|error| error.to_string())?) != image.calculated_hash { return Err(format!("El recurso destino de {} existe con otro contenido.", image.image_node_name)) }
            continue;
        }
        let staged = staging_root.join(format!("{}.{}", image.target_resource_id, image.target_extension));
        if !staged.is_file() { sync_write(&staged, &legacy.bytes)?; }
        let verified = fs::read(&staged).map_err(|error| format!("No se pudo releer el recurso staged: {error}"))?;
        project_resource_format("image", &verified, Some(&image.target_extension))?;
        if sha256(&verified) != image.calculated_hash { return Err(format!("La verificación del recurso de {} falló.", image.image_node_name)) }
        if let Some(parent) = final_path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
        fs::rename(&staged, &final_path).map_err(|error| format!("No se pudo confirmar el recurso de {}: {error}", image.image_node_name))?;
        if sha256(&fs::read(&final_path).map_err(|error| error.to_string())?) != image.calculated_hash { return Err(format!("El recurso confirmado de {} no supera la relectura.", image.image_node_name)) }
    }
    journal.status = "resourcesCommitted".into(); write_journal(project, &journal)?;
    let resource_ms = resource_started.elapsed().as_secs_f64() * 1000.0;
    let migratable_ids = plan.images.iter().map(|image| image.image_node_id.clone()).collect::<HashSet<_>>();
    for collection in [&mut active, &mut trash] {
        for node in collection.iter_mut() {
            if let Some(image) = plan.images.iter().find(|image| image.image_node_id == node.id) {
                let legacy = legacy_image(&node.content, &node.name)?.ok_or("No se pudo releer el Nodo Imagen legacy.")?;
                node.content = image_v2_content(image, &legacy)?;
            } else if node.content.contains("data-mention-id") {
                node.content = rewrite_mentions(&node.content, &migratable_ids);
            }
        }
    }
    if should_cancel() {
        for resource in &created_resources { let _ = fs::remove_file(resource_path(&project.working_folder, &resource.resource_id, &resource.extension)); }
        let _ = fs::remove_dir_all(project.working_folder.join(STAGING_DIR).join(&plan.plan_id));
        let _ = fs::remove_file(project.working_folder.join(JOURNAL_FILE));
        return Err(format!("Migración cancelada antes del commit. El proyecto no fue modificado; el backup permanece en {}.", backup.display()));
    }
    progress(&ImageMigrationProgress { phase: "commit".into(), current: plan.images.len(), total: plan.images.len(), image_name: String::new() });
    mark_archive_dirty(project)?;
    let sqlite_started = Instant::now();
    let tx = project.db.transaction().map_err(|error| format!("No se pudo iniciar el commit de migración: {error}"))?;
    {
        let mut update = tx.prepare("UPDATE nodes SET content=?1 WHERE id=?2 AND content IS NOT ?1").map_err(|error| error.to_string())?;
        for node in &active { update.execute(params![node.content, node.id]).map_err(|error| format!("No se pudo migrar {}: {error}", node.id))?; }
    }
    let trash_json = serde_json::to_string(&trash).map_err(|error| error.to_string())?;
    tx.execute("INSERT INTO project_meta(key,value) VALUES('deletedNodes',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [trash_json]).map_err(|error| format!("No se pudo migrar Papelera: {error}"))?;
    tx.commit().map_err(|error| format!("No se pudo confirmar la migración: {error}"))?;
    project.archive_dirty = true;
    let sqlite_ms = sqlite_started.elapsed().as_secs_f64() * 1000.0;
    journal.status = "dbCommitted".into(); write_journal(project, &journal)?;
    let _ = fs::remove_dir_all(project.working_folder.join(STAGING_DIR).join(&plan.plan_id));
    fs::remove_file(project.working_folder.join(JOURNAL_FILE)).map_err(|error| format!("La migración terminó, pero no se pudo retirar el journal: {error}"))?;
    progress(&ImageMigrationProgress { phase: "done".into(), current: plan.images.len(), total: plan.images.len(), image_name: String::new() });
    let total_ms = total_started.elapsed().as_secs_f64() * 1000.0;
    eprintln!("[lifecycle][image-migration] images={} resources_created={} resources_reused={} backup={backup_ms:.2}ms resources={resource_ms:.2}ms sqlite={sqlite_ms:.2}ms total={total_ms:.2}ms", plan.images.len(), created_resources.len(), plan.images.len().saturating_sub(created_resources.len()));
    Ok(ImageMigrationResult {
        nodes: active, deleted_nodes: trash, backup_path: backup.to_string_lossy().into_owned(), migrated: plan.images.len(), already_modern: plan.already_modern,
        omitted: plan.corrupt.len() + plan.unknown.len(), conflicts: plan.ambiguous.len(), failed: 0,
        resources_created: created_resources.len(), resources_reused: plan.images.len().saturating_sub(created_resources.len()), base64_characters_removed: plan.estimate.legacy_base64_characters,
        binary_bytes: plan.estimate.legacy_binary_bytes, backup_ms, resource_ms, sqlite_ms, total_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{create_project_file, save_workspace};

    fn temp_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("hisfuture-image-migration-{label}-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn node(id: &str, name: &str, node_type: &str, content: String) -> NodeRecord {
        NodeRecord { id: id.into(), name: name.into(), node_type: node_type.into(), parent_id: None, order: 0, content }
    }

    const PNG_DATA: &str = "iVBORw0KGgo=";

    #[test]
    fn mention_rewrite_preserves_document_attributes_and_removes_only_runtime_payload() {
        let html = r#"<div data-block-id="b1"><span class="editor-mention extra" data-mention-id="image-1" data-mention-mode="full" data-caption="Mapa"><img src="data:image/png;base64,iVBORw0KGgo=" alt="Mapa" width="420" style="float:left" data-his-runtime-image="true"></span></div>"#;
        let result = rewrite_mentions(html, &["image-1".to_string()].into_iter().collect());
        assert!(!result.contains("base64"));
        assert!(!result.contains("data-his-runtime-image"));
        assert!(result.contains("data-his-image-placeholder=\"true\""));
        assert!(result.contains("data-no-resize=\"true\""));
        assert!(result.contains("width=\"420\""));
        assert!(result.contains("style=\"float:left\""));
        assert!(result.contains("data-caption=\"Mapa\""));
    }

    #[test]
    fn data_url_validation_rejects_hash_mismatch() {
        let html = r#"<img src="data:image/png;base64,iVBORw0KGgo=" data-image-hash="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">"#;
        let tag = parse_tags(html).remove(0);
        assert!(parse_data_url(attr(&tag, "src").unwrap(), "x.png", &tag).is_err());
    }

    #[test]
    fn migration_is_backed_up_atomic_deduplicated_and_idempotent() {
        let root = temp_root("commit");
        let archive = root.join("Legacy.his");
        let project = create_project_file(archive.to_string_lossy().into_owned(), "Legacy".into()).unwrap();
        let state = ProjectState::new(Some(project));
        let image_a = format!(r#"<p><img src="data:image/png;base64,{PNG_DATA}" alt="Mapa" data-image-file-name="mapa.png"></p>"#);
        let image_b = format!(r#"<p><img src="data:image/png;base64,{PNG_DATA}" alt="Copia" data-image-file-name="copia.png"></p>"#);
        let page = format!(r#"<div data-block-id="block-a"><span class="editor-mention" data-mention-id="image-a" data-mention-mode="full" data-caption="Mapa"><img src="data:image/png;base64,{PNG_DATA}" alt="Mapa" width="420"></span></div>"#);
        save_workspace(&state, vec![node("image-a", "Mapa", "imagen", image_a), node("image-b", "Copia semántica", "imagen", image_b), node("page", "Página", "pagina", page)], Some(vec![]), Some("[]".into())).unwrap();

        let plan = analyze(&state).unwrap();
        assert_eq!(plan.images.len(), 2);
        assert_eq!(plan.images[0].target_resource_id, plan.images[1].target_resource_id);
        let result = execute(&state, plan.clone(), |_| {}, || false).unwrap();
        assert_eq!(result.migrated, 2);
        assert_eq!(result.resources_created, 1);
        assert_eq!(result.resources_reused, 1);
        assert!(Path::new(&result.backup_path).is_file());
        validate_archive_file(Path::new(&result.backup_path)).unwrap();
        let migrated_page = result.nodes.iter().find(|item| item.id == "page").unwrap();
        assert!(!migrated_page.content.contains("base64"));
        assert!(migrated_page.content.contains("data-caption=\"Mapa\""));
        assert!(migrated_page.content.contains("width=\"420\""));
        assert!(migrated_page.content.contains("data-his-image-placeholder=\"true\""));
        let second = analyze(&state).unwrap();
        assert!(second.images.is_empty());
        assert_eq!(second.already_modern, 2);
        let second_result = execute(&state, second, |_| {}, || false).unwrap();
        assert_eq!(second_result.migrated, 0);
        assert!(second_result.backup_path.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn conflicting_mention_variant_is_reported_and_left_untouched() {
        let root = temp_root("conflict");
        let archive = root.join("Conflict.his");
        let project = create_project_file(archive.to_string_lossy().into_owned(), "Conflict".into()).unwrap();
        let state = ProjectState::new(Some(project));
        let image = format!(r#"<p><img src="data:image/png;base64,{PNG_DATA}" alt="Mapa"></p>"#);
        let page = r#"<span data-mention-id="image"><img src="data:image/gif;base64,R0lGODlh"></span>"#.to_string();
        save_workspace(&state, vec![node("image", "Mapa", "imagen", image.clone()), node("page", "Página", "pagina", page.clone())], Some(vec![]), Some("[]".into())).unwrap();
        let plan = analyze(&state).unwrap();
        assert!(plan.images.is_empty());
        assert_eq!(plan.ambiguous.len(), 1);
        let snapshot = execute(&state, plan, |_| {}, || false).unwrap();
        assert_eq!(snapshot.nodes.iter().find(|item| item.id == "image").unwrap().content, image);
        assert_eq!(snapshot.nodes.iter().find(|item| item.id == "page").unwrap().content, page);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn recovery_removes_precommit_orphans_without_touching_sqlite() {
        let root = temp_root("recovery");
        let archive = root.join("Recovery.his");
        let mut project = create_project_file(archive.to_string_lossy().into_owned(), "Recovery".into()).unwrap();
        let resource = ResourceTarget { resource_id: "orphan".into(), extension: "png".into(), hash: sha256(&BASE64.decode(PNG_DATA).unwrap()) };
        let path = resource_path(&project.working_folder, &resource.resource_id, &resource.extension);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, BASE64.decode(PNG_DATA).unwrap()).unwrap();
        let journal = MigrationJournal { version: 1, plan_id: "crash-plan".into(), status: "resourcesCommitted".into(), backup_path: archive.to_string_lossy().into_owned(), created_resources: vec![resource], image_targets: vec![ImageTarget { image_node_id: "not-committed".into(), resource_id: "orphan".into(), extension: "png".into() }] };
        write_journal(&project, &journal).unwrap();
        recover_if_needed(&mut project).unwrap();
        assert!(!path.exists());
        assert!(!project.working_folder.join(JOURNAL_FILE).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cancellation_before_commit_keeps_legacy_content_and_removes_new_resource() {
        let root = temp_root("cancel");
        let archive = root.join("Cancel.his");
        let project = create_project_file(archive.to_string_lossy().into_owned(), "Cancel".into()).unwrap();
        let state = ProjectState::new(Some(project));
        let legacy = format!(r#"<p><img src="data:image/png;base64,{PNG_DATA}" alt="Mapa"></p>"#);
        save_workspace(&state, vec![node("image", "Mapa", "imagen", legacy.clone())], Some(vec![]), Some("[]".into())).unwrap();
        let plan = analyze(&state).unwrap();
        let target = plan.images[0].clone();
        let error = execute(&state, plan, |_| {}, || true).unwrap_err();
        assert!(error.contains("cancelada antes del commit"));
        let guard = state.lock().unwrap();
        let project = guard.as_ref().unwrap();
        assert!(!resource_path(&project.working_folder, &target.target_resource_id, &target.target_extension).exists());
        assert!(!project.working_folder.join(JOURNAL_FILE).exists());
        assert_eq!(load_nodes(project).unwrap().0.iter().find(|item| item.id == "image").unwrap().content, legacy);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn recovery_accepts_a_fully_committed_transaction_and_keeps_resource() {
        let root = temp_root("recovery-committed");
        let archive = root.join("Committed.his");
        let mut project = create_project_file(archive.to_string_lossy().into_owned(), "Committed".into()).unwrap();
        let bytes = BASE64.decode(PNG_DATA).unwrap();
        let hash = sha256(&bytes);
        let resource_id = "committed-resource";
        let content = format!(r#"<!--hisfuture-image-resource:{{"version":2,"resourceId":"{resource_id}","fileName":"mapa.png","fileSize":8,"mimeType":"image/png","extension":"png","hash":"{hash}","description":"","provenance":null}}--><p><br></p>"#);
        project.db.execute("INSERT INTO nodes(id,name,type,parent_id,sort_order,content) VALUES('image','Mapa','imagen',NULL,0,?1)", [&content]).unwrap();
        let path = resource_path(&project.working_folder, resource_id, "png");
        fs::create_dir_all(path.parent().unwrap()).unwrap(); fs::write(&path, bytes).unwrap();
        let journal = MigrationJournal { version: 1, plan_id: "committed-plan".into(), status: "dbCommitted".into(), backup_path: archive.to_string_lossy().into_owned(), created_resources: vec![ResourceTarget { resource_id: resource_id.into(), extension: "png".into(), hash }], image_targets: vec![ImageTarget { image_node_id: "image".into(), resource_id: resource_id.into(), extension: "png".into() }] };
        write_journal(&project, &journal).unwrap();
        recover_if_needed(&mut project).unwrap();
        assert!(path.is_file());
        assert!(!project.working_folder.join(JOURNAL_FILE).exists());
        let _ = fs::remove_dir_all(root);
    }

    fn count_occurrences(content: &str, needle: &str) -> usize {
        content.match_indices(needle).count()
    }

    fn stored_data_url_characters(content: &str) -> usize {
        let mut total = 0usize;
        let mut cursor = 0usize;
        while let Some(relative) = content[cursor..].find("data:image/") {
            let start = cursor + relative;
            let end = content[start..].find(['\"', '\'', '<', '>']).map_or(content.len(), |offset| start + offset);
            total += end.saturating_sub(start);
            cursor = end.max(start + 1);
        }
        total
    }

    fn visible_text(content: &str) -> String {
        let bytes = content.as_bytes();
        let mut output = String::new();
        let mut index = 0usize;
        while index < bytes.len() {
            if content[index..].starts_with("<!--") {
                index = content[index + 4..].find("-->").map_or(bytes.len(), |end| index + 4 + end + 3);
            } else if bytes[index] == b'<' {
                let mut quote = None;
                index += 1;
                while index < bytes.len() {
                    if let Some(active) = quote { if bytes[index] == active { quote = None; } }
                    else if matches!(bytes[index], b'\'' | b'"') { quote = Some(bytes[index]); }
                    else if bytes[index] == b'>' { index += 1; break; }
                    index += 1;
                }
                output.push(' ');
            } else {
                let character = content[index..].chars().next().unwrap(); output.push(character); index += character.len_utf8();
            }
        }
        decode_html(&output).split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn node_metrics(node: &NodeRecord) -> serde_json::Value {
        let tags = parse_tags(&node.content);
        let text = visible_text(&node.content);
        let block_names = ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "table", "hr"];
        serde_json::json!({
            "contentBytes": node.content.len(), "base64Characters": stored_data_url_characters(&node.content),
            "dataUrls": count_occurrences(&node.content, "data:image/"), "mentions": count_occurrences(&node.content, "data-mention-id"),
            "domElements": tags.iter().filter(|tag| !tag.closing).count(), "images": tags.iter().filter(|tag| !tag.closing && tag.name == "img").count(),
            "blocks": tags.iter().filter(|tag| !tag.closing && block_names.contains(&tag.name.as_str())).count(),
            "words": text.split_whitespace().count(), "visibleTextHash": content_hash(&text),
        })
    }

    #[test]
    #[ignore = "requires HIS_MIGRATION_PROJECT_PATH and migrates only an automatically-created copy"]
    fn validates_midasico_on_a_copy_and_prints_measurements() {
        use crate::project::{close_project, open_project_from_path};
        let source = PathBuf::from(std::env::var("HIS_MIGRATION_PROJECT_PATH").expect("HIS_MIGRATION_PROJECT_PATH"));
        let root = temp_root("midasico-real-copy");
        let copy = root.join(source.file_name().unwrap_or_default());
        fs::copy(&source, &copy).expect("copy original project");
        let before_archive = fs::metadata(&copy).unwrap().len();
        let opened = open_project_from_path(copy.to_string_lossy().into_owned()).expect("open copied project");
        let before_sqlite = fs::metadata(opened.working_folder.join("lore.sqlite")).unwrap().len();
        let state = ProjectState::new(Some(opened));
        let (before_nodes, before_trash) = { let guard = state.lock().unwrap(); load_nodes(guard.as_ref().unwrap()).unwrap() };
        let target_before = before_nodes.iter().chain(&before_trash).find(|node| node.name.to_lowercase().contains("imperio midas"));
        let Some(target_before) = target_before else {
            println!("MIDASICO_NOT_FOUND source={}", source.display());
            return;
        };
        let plan = analyze(&state).unwrap();
        if std::env::var_os("HIS_MIGRATION_AUDIT_ONLY").is_some() {
            println!("MIGRATION_AUDIT {}", serde_json::to_string(&serde_json::json!({
                "migratable": plan.images.len(), "modern": plan.already_modern, "external": plan.external_provider,
                "ambiguous": plan.ambiguous, "corrupt": plan.corrupt, "unknown": plan.unknown,
            })).unwrap());
            return;
        }
        let before_project_base64 = before_nodes.iter().chain(&before_trash).map(|node| stored_data_url_characters(&node.content)).sum::<usize>();
        let mut before_target = node_metrics(target_before);
        before_target["id"] = serde_json::Value::String(target_before.id.clone());
        before_target["name"] = serde_json::Value::String(target_before.name.clone());
        let result = execute(&state, plan.clone(), |_| {}, || false).unwrap();
        let target_after = result.nodes.iter().chain(&result.deleted_nodes).find(|node| node.id == target_before.id).unwrap();
        let after_target = node_metrics(target_after);
        let after_project_base64 = result.nodes.iter().chain(&result.deleted_nodes).map(|node| stored_data_url_characters(&node.content)).sum::<usize>();
        let after_sqlite_working = { let guard = state.lock().unwrap(); guard.as_ref().unwrap().working_folder.join("lore.sqlite") };
        let after_sqlite = fs::metadata(&after_sqlite_working).unwrap().len();
        close_project(&state).unwrap();
        let after_archive = fs::metadata(&copy).unwrap().len();
        let report = serde_json::json!({
            "source": source, "migratedCopy": copy, "backup": result.backup_path,
            "before": { "archiveBytes": before_archive, "sqliteBytes": before_sqlite, "nodes": before_nodes.len(), "imageNodes": before_nodes.iter().filter(|node| node.node_type == "imagen").count(), "projectBase64Characters": before_project_base64, "target": before_target },
            "plan": { "migratable": plan.images.len(), "modern": plan.already_modern, "conflicts": plan.ambiguous.len(), "corrupt": plan.corrupt.len(), "unknown": plan.unknown.len(), "affectedNodes": plan.affected_pages, "mentions": plan.affected_mentions },
            "after": { "archiveBytes": after_archive, "sqliteBytes": after_sqlite, "nodes": result.nodes.len(), "imageNodes": result.nodes.iter().filter(|node| node.node_type == "imagen").count(), "projectBase64Characters": after_project_base64, "target": after_target },
            "result": { "migrated": result.migrated, "resourcesCreated": result.resources_created, "resourcesReused": result.resources_reused, "base64CharactersRemoved": result.base64_characters_removed, "binaryBytes": result.binary_bytes, "backupMs": result.backup_ms, "resourceMs": result.resource_ms, "sqliteMs": result.sqlite_ms, "totalMs": result.total_ms }
        });
        println!("MIDASICO_REPORT {}", serde_json::to_string(&report).unwrap());
    }

    #[test]
    #[ignore = "requires HIS_MIGRATION_BEFORE_PATH and HIS_MIGRATION_AFTER_PATH"]
    fn compares_midasico_semantics_between_project_copies() {
        use crate::project::{open_project_from_path, save_node_contents_traced, NodeContentChange};
        let before_source = PathBuf::from(std::env::var("HIS_MIGRATION_BEFORE_PATH").expect("HIS_MIGRATION_BEFORE_PATH"));
        let after_source = PathBuf::from(std::env::var("HIS_MIGRATION_AFTER_PATH").expect("HIS_MIGRATION_AFTER_PATH"));
        let root = temp_root("semantic-compare");
        let before_copy = root.join("before.his"); let after_copy = root.join("after.his");
        fs::copy(before_source, &before_copy).unwrap(); fs::copy(after_source, &after_copy).unwrap();
        let before_project = open_project_from_path(before_copy.to_string_lossy().into_owned()).unwrap();
        let (before_nodes, before_trash) = load_nodes(&before_project).unwrap();
        let before = before_nodes.iter().chain(&before_trash).find(|node| node.name.to_lowercase().contains("imperio midas")).unwrap();
        let before_metrics = node_metrics(before);
        let before_change = NodeContentChange { id: before.id.clone(), content: format!("{} ", before.content) };
        let before_state = ProjectState::new(Some(before_project));
        let before_incremental = save_node_contents_traced(&before_state, vec![before_change], Some("midasico-before")).unwrap();
        drop(before_state);
        let after_project = open_project_from_path(after_copy.to_string_lossy().into_owned()).unwrap();
        let (after_nodes, after_trash) = load_nodes(&after_project).unwrap();
        let after = after_nodes.iter().chain(&after_trash).find(|node| node.id == before.id).unwrap();
        let after_metrics = node_metrics(after);
        let missing_resources = after_nodes.iter().chain(&after_trash).filter_map(|node| project_image_metadata(&node.content)).filter(|(id, extension, _)| !resource_path(&after_project.working_folder, id, extension).is_file()).count();
        let after_change = NodeContentChange { id: after.id.clone(), content: format!("{} ", after.content) };
        let after_state = ProjectState::new(Some(after_project));
        let after_incremental = save_node_contents_traced(&after_state, vec![after_change], Some("midasico-after")).unwrap();
        assert_eq!(before_metrics["visibleTextHash"], after_metrics["visibleTextHash"]);
        assert_eq!(before_metrics["words"], after_metrics["words"]);
        assert_eq!(before_metrics["mentions"], after_metrics["mentions"]);
        assert_eq!(missing_resources, 0);
        println!("MIDASICO_SEMANTIC_COMPARE {}", serde_json::to_string(&serde_json::json!({
            "before": before_metrics, "after": after_metrics, "missingResources": missing_resources,
            "incrementalBefore": { "payloadBytes": before.content.len() + 1, "sqliteMs": before_incremental.sqlite_ms, "totalMs": before_incremental.total_ms, "changedRows": before_incremental.changed_rows },
            "incrementalAfter": { "payloadBytes": after.content.len() + 1, "sqliteMs": after_incremental.sqlite_ms, "totalMs": after_incremental.total_ms, "changedRows": after_incremental.changed_rows }
        })).unwrap());
    }
}
