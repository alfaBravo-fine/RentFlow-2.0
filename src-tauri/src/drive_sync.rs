use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

use crate::auth::{
    get_authenticated_google_id, get_valid_access_token, refresh_google_access_token, AuthState,
};
use crate::db::{db_export_all, db_import_all, revert_single_change, validate_table_name, DatabaseManager};

const SALT: &[u8] = b"rentflow_appdata_gcm_salt_v2";
const BACKUPS_FOLDER_NAME: &str = "RentFlow Grouped Backups";
const LEGACY_BACKUPS_FOLDER_NAME: &str = "RentFlow Backups";
const MANIFEST_FILENAME: &str = "manifest.json";
const MAX_FULL_BACKUP_RETENTION: usize = 30;
const MAX_CHANGE_HISTORY_RETENTION: usize = 20;
const FULL_BACKUP_CHANGE_THRESHOLD: u32 = 10;
const FULL_BACKUP_INTERVAL_SECS: i64 = 86_400; // 24 hours

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupManifestEntry {
    pub filename: String,
    pub date: String,
    pub size: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record_count: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChangeHistoryEntry {
    pub filename: String,
    pub entity: String,
    pub table: String,
    pub action: String,
    pub record_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub date: String,
    pub size: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct GroupedManifest {
    #[serde(default)]
    pub full_backups: Vec<BackupManifestEntry>,
    #[serde(default)]
    pub change_history: Vec<ChangeHistoryEntry>,
    #[serde(default)]
    pub changes_since_full_backup: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_full_backup_at: Option<String>,
    #[serde(default)]
    pub last_full_backup_epoch: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GroupedBackupList {
    pub full_backups: Vec<BackupManifestEntry>,
    pub change_history: Vec<ChangeHistoryEntry>,
    pub changes_since_full_backup: u32,
    pub last_full_backup_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChangePayloadInput {
    pub entity: String,
    pub table: String,
    pub action: String,
    pub record_id: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub before: Option<serde_json::Value>,
    #[serde(default)]
    pub after: Option<serde_json::Value>,
    #[serde(default)]
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSyncResult {
    pub success: bool,
    pub synced_at: String,
    pub file_id: Option<String>,
    pub folder_id: Option<String>,
    pub filename: Option<String>,
    pub snapshot_count: usize,
    #[serde(default)]
    pub full_backup_triggered: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub full_backup_filename: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DrivePullResult {
    pub restored: bool,
    pub filename: Option<String>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct DriveFileList {
    pub files: Vec<DriveFileItem>,
}

#[derive(Debug, Deserialize, Serialize)]
struct DriveFileItem {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub size: Option<String>,
    #[serde(rename = "modifiedTime", default)]
    pub modified_time: Option<String>,
}

fn derive_aes_key(google_id: &str) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(google_id.as_bytes(), SALT, 100_000, &mut key);
    key
}

fn encrypt_payload(plaintext: &str, google_id: &str) -> Result<Vec<u8>, String> {
    let key = derive_aes_key(google_id);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("AES encryption error: {}", e))?;

    let mut output = Vec::with_capacity(12 + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

fn decrypt_payload(encrypted_bytes: &[u8], google_id: &str) -> Result<String, String> {
    if encrypted_bytes.len() < 12 {
        return Err("Payload too short for AES-GCM nonce".to_string());
    }

    let key = derive_aes_key(google_id);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let (nonce_bytes, ciphertext) = encrypted_bytes.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("AES decryption authentication failed: {}", e))?;

    String::from_utf8(decrypted).map_err(|e| format!("UTF-8 decoding error: {}", e))
}

fn validate_snapshot_filename(filename: &str) -> Result<(), String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() || trimmed.len() > 160 {
        return Err("Invalid backup snapshot filename.".to_string());
    }
    if trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Security Violation: Invalid characters in snapshot filename.".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err("Security Violation: Snapshot filename contains disallowed characters.".to_string());
    }
    if !trimmed.ends_with(".enc") {
        return Err("Snapshot filename must end with .enc.".to_string());
    }
    Ok(())
}

fn validate_drive_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Invalid Google Drive resource identifier.".to_string());
    }
    Ok(())
}

fn sanitize_slug(raw: &str, fallback: &str) -> String {
    let cleaned: String = raw
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let collapsed = cleaned.trim_matches('_').to_string();
    if collapsed.is_empty() {
        fallback.to_string()
    } else {
        collapsed
    }
}

fn unix_now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Converts UNIX epoch seconds to UTC calendar components (year, month, day, hour, minute, second)
/// using Howard Hinnant's civil-from-days algorithm.
fn utc_now_parts() -> (i64, u32, u32, u32, u32, u32, i64) {
    let secs = unix_now_secs();

    let days = secs.div_euclid(86_400);
    let secs_of_day = secs.rem_euclid(86_400) as u32;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };

    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    (year, m as u32, d as u32, hour, minute, second, secs)
}

fn format_human_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        let kb = ((bytes as f64) / 1024.0).ceil() as u64;
        format!("{} KB", kb.max(1))
    } else {
        let mb = (bytes as f64) / (1024.0 * 1024.0);
        format!("{:.1} MB", mb)
    }
}

fn count_snapshot_records(snapshot: &serde_json::Value) -> usize {
    snapshot
        .as_object()
        .map(|obj| {
            obj.values()
                .filter_map(|v| v.as_array().map(|arr| arr.len()))
                .sum()
        })
        .unwrap_or(0)
}

fn build_full_backup_filename(year: i64, month: u32, day: u32) -> String {
    format!("FULL_BACKUP_{:04}-{:02}-{:02}.enc", year, month, day)
}

fn build_unique_change_filename(
    existing: &[ChangeHistoryEntry],
    entity: &str,
    action: &str,
    year: i64,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
) -> String {
    let entity_slug = sanitize_slug(entity, "record");
    let action_slug = sanitize_slug(action, "edit");
    let base = format!(
        "{}_{}_{:04}-{:02}-{:02}_{:02}{:02}",
        entity_slug, action_slug, year, month, day, hour, minute
    );
    let primary = format!("{}.enc", base);
    if !existing.iter().any(|e| e.filename == primary) {
        return primary;
    }

    let mut suffix = 2usize;
    loop {
        let candidate = format!("{}_{}.enc", base, suffix);
        if !existing.iter().any(|e| e.filename == candidate) {
            return candidate;
        }
        suffix += 1;
    }
}

async fn find_folder_by_name(
    client: &reqwest::Client,
    token: &str,
    folder_name: &str,
) -> Result<Option<DriveFileItem>, String> {
    let query = format!(
        "name = '{}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        folder_name
    );

    let res = client
        .get("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", token))
        .query(&[
            ("spaces", "drive"),
            ("q", query.as_str()),
            ("orderBy", "createdTime asc"),
            ("fields", "files(id, name, modifiedTime)"),
        ])
        .send()
        .await
        .map_err(|e| format!("Drive folder lookup error: {}", e))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("UNAUTHORIZED".to_string());
    }

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Drive folder query failed: {}", err_text));
    }

    let list: DriveFileList = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Drive folder response: {}", e))?;

    Ok(list.files.into_iter().next())
}

async fn find_backups_folder(
    client: &reqwest::Client,
    token: &str,
) -> Result<Option<DriveFileItem>, String> {
    if let Some(grouped) = find_folder_by_name(client, token, BACKUPS_FOLDER_NAME).await? {
        return Ok(Some(grouped));
    }
    find_folder_by_name(client, token, LEGACY_BACKUPS_FOLDER_NAME).await
}

async fn create_backups_folder(
    client: &reqwest::Client,
    token: &str,
) -> Result<DriveFileItem, String> {
    let metadata = serde_json::json!({
        "name": BACKUPS_FOLDER_NAME,
        "mimeType": "application/vnd.google-apps.folder"
    });

    let res = client
        .post("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&metadata)
        .send()
        .await
        .map_err(|e| format!("Drive folder creation error: {}", e))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("UNAUTHORIZED".to_string());
    }

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to create '{}' folder in Google Drive: {}",
            BACKUPS_FOLDER_NAME, err_text
        ));
    }

    res.json::<DriveFileItem>()
        .await
        .map_err(|e| format!("Failed to parse created folder metadata: {}", e))
}

async fn find_backups_folder_resilient(
    app: &AppHandle,
    auth_state: &AuthState,
    client: &reqwest::Client,
) -> Result<(String, Option<String>), String> {
    let mut token = get_valid_access_token(Some(app), auth_state).await?;

    match find_backups_folder(client, &token).await {
        Ok(folder) => Ok((token, folder.map(|f| f.id))),
        Err(err) if err == "UNAUTHORIZED" => {
            token = refresh_google_access_token(Some(app), auth_state).await?;
            let folder = find_backups_folder(client, &token).await?;
            Ok((token, folder.map(|f| f.id)))
        }
        Err(err) => Err(err),
    }
}

async fn get_or_create_backups_folder_resilient(
    app: &AppHandle,
    auth_state: &AuthState,
    client: &reqwest::Client,
) -> Result<(String, String), String> {
    let (mut token, existing_id) = match find_folder_by_name(
        client,
        &get_valid_access_token(Some(app), auth_state).await?,
        BACKUPS_FOLDER_NAME,
    )
    .await
    {
        Ok(folder) => (
            get_valid_access_token(Some(app), auth_state).await?,
            folder.map(|f| f.id),
        ),
        Err(err) if err == "UNAUTHORIZED" => {
            let refreshed = refresh_google_access_token(Some(app), auth_state).await?;
            let folder = find_folder_by_name(client, &refreshed, BACKUPS_FOLDER_NAME).await?;
            (refreshed, folder.map(|f| f.id))
        }
        Err(err) => return Err(err),
    };

    if let Some(fid) = existing_id {
        return Ok((token, fid));
    }

    let created = match create_backups_folder(client, &token).await {
        Ok(folder) => folder,
        Err(err) if err == "UNAUTHORIZED" => {
            token = refresh_google_access_token(Some(app), auth_state).await?;
            create_backups_folder(client, &token).await?
        }
        Err(err) => return Err(err),
    };

    Ok((token, created.id))
}

async fn find_file_in_folder(
    client: &reqwest::Client,
    token: &str,
    folder_id: &str,
    filename: &str,
) -> Result<Option<DriveFileItem>, String> {
    validate_drive_id(folder_id)?;
    if filename.contains('\'') || filename.contains('\\') {
        return Err("Invalid filename for Drive lookup.".to_string());
    }

    let query = format!(
        "name = '{}' and '{}' in parents and trashed = false",
        filename, folder_id
    );

    let res = client
        .get("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", token))
        .query(&[
            ("spaces", "drive"),
            ("q", query.as_str()),
            ("orderBy", "modifiedTime desc"),
            ("fields", "files(id, name, size, modifiedTime)"),
        ])
        .send()
        .await
        .map_err(|e| format!("Drive query error: {}", e))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("UNAUTHORIZED".to_string());
    }

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Drive file query error: {}", err_text));
    }

    let list: DriveFileList = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Drive file list: {}", e))?;

    Ok(list.files.into_iter().next())
}

async fn download_drive_file_bytes(
    client: &reqwest::Client,
    token: &str,
    file_id: &str,
) -> Result<Vec<u8>, String> {
    validate_drive_id(file_id)?;

    let res = client
        .get(format!(
            "https://www.googleapis.com/drive/v3/files/{}?alt=media",
            file_id
        ))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Drive download error: {}", e))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("UNAUTHORIZED".to_string());
    }

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Failed to download Drive file: {}", err_text));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Failed reading Drive download stream: {}", e))?;

    Ok(bytes.to_vec())
}

async fn upload_new_file_in_folder(
    client: &reqwest::Client,
    token: &str,
    folder_id: &str,
    filename: &str,
    mime_type: &str,
    body_bytes: Vec<u8>,
) -> Result<DriveFileItem, String> {
    validate_drive_id(folder_id)?;

    let metadata = serde_json::json!({
        "name": filename,
        "parents": [folder_id]
    });

    let form = reqwest::multipart::Form::new()
        .part(
            "metadata",
            reqwest::multipart::Part::text(metadata.to_string())
                .mime_str("application/json")
                .map_err(|e| e.to_string())?,
        )
        .part(
            "file",
            reqwest::multipart::Part::bytes(body_bytes)
                .mime_str(mime_type)
                .map_err(|e| e.to_string())?,
        );

    let res = client
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        .header("Authorization", format!("Bearer {}", token))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Drive multipart upload error: {}", e))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("UNAUTHORIZED".to_string());
    }

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Drive upload error: {}", err_text));
    }

    res.json::<DriveFileItem>()
        .await
        .map_err(|e| format!("Parse created Drive file response: {}", e))
}

async fn patch_drive_file(
    client: &reqwest::Client,
    token: &str,
    file_id: &str,
    mime_type: &str,
    body_bytes: Vec<u8>,
) -> Result<(), String> {
    validate_drive_id(file_id)?;

    let url = format!(
        "https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media",
        file_id
    );

    let res = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", mime_type)
        .body(body_bytes)
        .send()
        .await
        .map_err(|e| format!("Drive PATCH error: {}", e))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("UNAUTHORIZED".to_string());
    }

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Drive PATCH failed: {}", err_text));
    }

    Ok(())
}

async fn delete_drive_file(
    client: &reqwest::Client,
    token: &str,
    file_id: &str,
) -> Result<(), String> {
    validate_drive_id(file_id)?;

    let res = client
        .delete(format!(
            "https://www.googleapis.com/drive/v3/files/{}",
            file_id
        ))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Drive delete error: {}", e))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("UNAUTHORIZED".to_string());
    }

    if !res.status().is_success() && res.status() != reqwest::StatusCode::NOT_FOUND {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Failed deleting old snapshot: {}", err_text));
    }

    Ok(())
}

async fn fetch_manifest_in_folder(
    client: &reqwest::Client,
    token: &str,
    folder_id: &str,
) -> Result<(Option<String>, GroupedManifest), String> {
    let Some(manifest_item) =
        find_file_in_folder(client, token, folder_id, MANIFEST_FILENAME).await?
    else {
        return Ok((None, GroupedManifest::default()));
    };

    let bytes = download_drive_file_bytes(client, token, &manifest_item.id).await?;
    if bytes.is_empty() {
        return Ok((Some(manifest_item.id), GroupedManifest::default()));
    }

    let mut manifest: GroupedManifest =
        if let Ok(grouped) = serde_json::from_slice::<GroupedManifest>(&bytes) {
            if !grouped.full_backups.is_empty()
                || !grouped.change_history.is_empty()
                || grouped.last_full_backup_at.is_some()
                || grouped.changes_since_full_backup > 0
            {
                grouped
            } else if let Ok(legacy_list) = serde_json::from_slice::<Vec<BackupManifestEntry>>(&bytes)
            {
                GroupedManifest {
                    full_backups: legacy_list,
                    ..GroupedManifest::default()
                }
            } else {
                grouped
            }
        } else if let Ok(legacy_list) = serde_json::from_slice::<Vec<BackupManifestEntry>>(&bytes) {
            GroupedManifest {
                full_backups: legacy_list,
                ..GroupedManifest::default()
            }
        } else {
            #[derive(Deserialize)]
            struct WrappedManifest {
                backups: Vec<BackupManifestEntry>,
            }
            let legacy_wrapped = serde_json::from_slice::<WrappedManifest>(&bytes)
                .map(|w| w.backups)
                .unwrap_or_default();
            GroupedManifest {
                full_backups: legacy_wrapped,
                ..GroupedManifest::default()
            }
        };

    manifest.full_backups.sort_by(|a, b| b.date.cmp(&a.date));
    manifest.change_history.sort_by(|a, b| b.date.cmp(&a.date));
    Ok((Some(manifest_item.id), manifest))
}

async fn fetch_manifest_in_folder_resilient(
    app: &AppHandle,
    auth_state: &AuthState,
    client: &reqwest::Client,
    token: &mut String,
    folder_id: &str,
) -> Result<(Option<String>, GroupedManifest), String> {
    match fetch_manifest_in_folder(client, token, folder_id).await {
        Ok(res) => Ok(res),
        Err(err) if err == "UNAUTHORIZED" => {
            *token = refresh_google_access_token(Some(app), auth_state).await?;
            fetch_manifest_in_folder(client, token, folder_id).await
        }
        Err(err) => Err(err),
    }
}

async fn save_manifest_in_folder_resilient(
    app: &AppHandle,
    auth_state: &AuthState,
    client: &reqwest::Client,
    token: &mut String,
    folder_id: &str,
    manifest_file_id: Option<String>,
    manifest: &GroupedManifest,
) -> Result<String, String> {
    let manifest_bytes = serde_json::to_vec_pretty(manifest)
        .map_err(|e| format!("Failed to serialize manifest.json: {}", e))?;

    if let Some(fid) = manifest_file_id {
        match patch_drive_file(
            client,
            token,
            &fid,
            "application/json",
            manifest_bytes.clone(),
        )
        .await
        {
            Ok(()) => return Ok(fid),
            Err(err) if err == "UNAUTHORIZED" => {
                *token = refresh_google_access_token(Some(app), auth_state).await?;
                patch_drive_file(client, token, &fid, "application/json", manifest_bytes).await?;
                return Ok(fid);
            }
            Err(err) => return Err(err),
        }
    }

    match upload_new_file_in_folder(
        client,
        token,
        folder_id,
        MANIFEST_FILENAME,
        "application/json",
        manifest_bytes.clone(),
    )
    .await
    {
        Ok(created) => Ok(created.id),
        Err(err) if err == "UNAUTHORIZED" => {
            *token = refresh_google_access_token(Some(app), auth_state).await?;
            let created = upload_new_file_in_folder(
                client,
                token,
                folder_id,
                MANIFEST_FILENAME,
                "application/json",
                manifest_bytes,
            )
            .await?;
            Ok(created.id)
        }
        Err(err) => Err(err),
    }
}

async fn compile_and_upload_full_backup(
    app: &AppHandle,
    auth_state: &AuthState,
    db_state: &State<'_, DatabaseManager>,
    client: &reqwest::Client,
    token: &mut String,
    folder_id: &str,
    google_id: &str,
    manifest: &mut GroupedManifest,
) -> Result<(BackupManifestEntry, String), String> {
    let full_snapshot = db_export_all(db_state.clone()).await?;
    let record_count = count_snapshot_records(&full_snapshot);

    let (year, month, day, hour, minute, second, epoch_secs) = utc_now_parts();
    let iso_timestamp = format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    );

    let payload = serde_json::json!({
        "app": "RentFlow",
        "kind": "full_backup",
        "version": "2.1.0",
        "exportedAt": iso_timestamp,
        "userId": google_id,
        "data": full_snapshot
    });

    let encrypted_bytes = encrypt_payload(&payload.to_string(), google_id)?;
    let byte_len = encrypted_bytes.len() as u64;
    let formatted_size = format_human_size(byte_len);

    let full_filename = build_full_backup_filename(year, month, day);

    let existing_same_day = find_file_in_folder(client, token, folder_id, &full_filename)
        .await
        .ok()
        .flatten();

    let file_id = if let Some(existing) = existing_same_day {
        match patch_drive_file(
            client,
            token,
            &existing.id,
            "application/octet-stream",
            encrypted_bytes.clone(),
        )
        .await
        {
            Ok(()) => existing.id,
            Err(err) if err == "UNAUTHORIZED" => {
                *token = refresh_google_access_token(Some(app), auth_state).await?;
                patch_drive_file(
                    client,
                    token,
                    &existing.id,
                    "application/octet-stream",
                    encrypted_bytes,
                )
                .await?;
                existing.id
            }
            Err(err) => return Err(err),
        }
    } else {
        let uploaded = match upload_new_file_in_folder(
            client,
            token,
            folder_id,
            &full_filename,
            "application/octet-stream",
            encrypted_bytes.clone(),
        )
        .await
        {
            Ok(item) => item,
            Err(err) if err == "UNAUTHORIZED" => {
                *token = refresh_google_access_token(Some(app), auth_state).await?;
                upload_new_file_in_folder(
                    client,
                    token,
                    folder_id,
                    &full_filename,
                    "application/octet-stream",
                    encrypted_bytes,
                )
                .await?
            }
            Err(err) => return Err(err),
        };
        uploaded.id
    };

    let entry = BackupManifestEntry {
        filename: full_filename.clone(),
        date: iso_timestamp.clone(),
        size: formatted_size,
        size_bytes: Some(byte_len),
        file_id: Some(file_id.clone()),
        record_count: Some(record_count),
    };

    // Replace existing entry for the same date filename so FULL_BACKUP_YYYY-MM-DD.enc stays clean
    manifest.full_backups.retain(|b| b.filename != full_filename);
    manifest.full_backups.insert(0, entry.clone());

    while manifest.full_backups.len() > MAX_FULL_BACKUP_RETENTION {
        if let Some(oldest) = manifest.full_backups.pop() {
            if let Some(fid) = oldest.file_id {
                let _ = delete_drive_file(client, token, &fid).await;
            }
        }
    }

    manifest.changes_since_full_backup = 0;
    manifest.last_full_backup_at = Some(iso_timestamp);
    manifest.last_full_backup_epoch = epoch_secs;

    Ok((entry, file_id))
}

#[tauri::command]
pub async fn drive_push_backup(
    app: AppHandle,
    google_id: Option<String>,
    auth_state: State<'_, AuthState>,
    db_state: State<'_, DatabaseManager>,
) -> Result<BackupSyncResult, String> {
    let _sync_guard = auth_state.sync_lock.lock().await;

    let session_google_id = get_authenticated_google_id(&auth_state)?;
    let effective_google_id = match google_id {
        Some(ref gid) if !gid.trim().is_empty() => {
            if gid.contains('/') || gid.contains('\\') {
                return Err("Invalid Google User ID".into());
            }
            if gid != &session_google_id {
                return Err("Google User ID does not match active authenticated session.".into());
            }
            gid.clone()
        }
        _ => session_google_id,
    };

    let client = reqwest::Client::new();
    let (mut token, folder_id) =
        get_or_create_backups_folder_resilient(&app, &auth_state, &client).await?;

    let (manifest_file_id, mut manifest) =
        fetch_manifest_in_folder_resilient(&app, &auth_state, &client, &mut token, &folder_id)
            .await?;

    let (entry, uploaded_id) = compile_and_upload_full_backup(
        &app,
        &auth_state,
        &db_state,
        &client,
        &mut token,
        &folder_id,
        &effective_google_id,
        &mut manifest,
    )
    .await?;

    save_manifest_in_folder_resilient(
        &app,
        &auth_state,
        &client,
        &mut token,
        &folder_id,
        manifest_file_id,
        &manifest,
    )
    .await?;

    *auth_state.drive_file_id.lock().map_err(|e| e.to_string())? = Some(uploaded_id.clone());

    Ok(BackupSyncResult {
        success: true,
        synced_at: entry.date.clone(),
        file_id: Some(uploaded_id),
        folder_id: Some(folder_id),
        filename: Some(entry.filename.clone()),
        snapshot_count: manifest.full_backups.len(),
        full_backup_triggered: true,
        full_backup_filename: Some(entry.filename.clone()),
        message: format!(
            "Saved full backup {} in '{}'",
            entry.filename, BACKUPS_FOLDER_NAME
        ),
    })
}

#[tauri::command]
pub async fn drive_push_change(
    change: ChangePayloadInput,
    google_id: Option<String>,
    app: AppHandle,
    auth_state: State<'_, AuthState>,
    db_state: State<'_, DatabaseManager>,
) -> Result<BackupSyncResult, String> {
    let _sync_guard = auth_state.sync_lock.lock().await;

    validate_table_name(&change.table)?;
    let action_slug = sanitize_slug(&change.action, "edit");
    if action_slug != "add" && action_slug != "edit" && action_slug != "delete" {
        return Err(format!("Invalid change action '{}'.", change.action));
    }

    let session_google_id = get_authenticated_google_id(&auth_state)?;
    let effective_google_id = match google_id {
        Some(ref gid) if !gid.trim().is_empty() => {
            if gid != &session_google_id {
                return Err("Google User ID does not match active authenticated session.".into());
            }
            gid.clone()
        }
        _ => session_google_id,
    };

    let (year, month, day, hour, minute, second, epoch_secs) = utc_now_parts();
    let iso_timestamp = change.timestamp.clone().unwrap_or_else(|| {
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
            year, month, day, hour, minute, second
        )
    });

    let client = reqwest::Client::new();
    let (mut token, folder_id) =
        get_or_create_backups_folder_resilient(&app, &auth_state, &client).await?;

    let (manifest_file_id, mut manifest) =
        fetch_manifest_in_folder_resilient(&app, &auth_state, &client, &mut token, &folder_id)
            .await?;

    let change_filename = build_unique_change_filename(
        &manifest.change_history,
        &change.entity,
        &action_slug,
        year,
        month,
        day,
        hour,
        minute,
    );

    let payload = serde_json::json!({
        "app": "RentFlow",
        "kind": "change_snapshot",
        "version": "2.1.0",
        "entity": sanitize_slug(&change.entity, "record"),
        "table": change.table,
        "action": action_slug,
        "record_id": change.record_id,
        "summary": change.summary,
        "before": change.before,
        "after": change.after,
        "timestamp": iso_timestamp,
        "userId": effective_google_id
    });

    let encrypted_bytes = encrypt_payload(&payload.to_string(), &effective_google_id)?;
    let byte_len = encrypted_bytes.len() as u64;
    let formatted_size = format_human_size(byte_len);

    let uploaded = match upload_new_file_in_folder(
        &client,
        &token,
        &folder_id,
        &change_filename,
        "application/octet-stream",
        encrypted_bytes.clone(),
    )
    .await
    {
        Ok(item) => item,
        Err(err) if err == "UNAUTHORIZED" => {
            token = refresh_google_access_token(Some(&app), &auth_state).await?;
            upload_new_file_in_folder(
                &client,
                &token,
                &folder_id,
                &change_filename,
                "application/octet-stream",
                encrypted_bytes,
            )
            .await?
        }
        Err(err) => return Err(err),
    };

    manifest.change_history.insert(
        0,
        ChangeHistoryEntry {
            filename: change_filename.clone(),
            entity: sanitize_slug(&change.entity, "record"),
            table: change.table,
            action: action_slug,
            record_id: change.record_id,
            summary: change.summary,
            date: iso_timestamp.clone(),
            size: formatted_size,
            size_bytes: Some(byte_len),
            file_id: Some(uploaded.id.clone()),
        },
    );

    // Keep last 20 small changes and purge older files from Google Drive
    while manifest.change_history.len() > MAX_CHANGE_HISTORY_RETENTION {
        if let Some(oldest) = manifest.change_history.pop() {
            let oldest_fid = match oldest.file_id {
                Some(fid) if !fid.is_empty() => Some(fid),
                _ => find_file_in_folder(&client, &token, &folder_id, &oldest.filename)
                    .await
                    .ok()
                    .flatten()
                    .map(|f| f.id),
            };
            if let Some(fid) = oldest_fid {
                match delete_drive_file(&client, &token, &fid).await {
                    Ok(()) => {}
                    Err(err) if err == "UNAUTHORIZED" => {
                        token = refresh_google_access_token(Some(&app), &auth_state).await?;
                        let _ = delete_drive_file(&client, &token, &fid).await;
                    }
                    Err(err) => eprintln!(
                        "[RentFlow Drive] Warning: failed purging oldest change {}: {}",
                        oldest.filename, err
                    ),
                }
            }
        }
    }

    manifest.changes_since_full_backup = manifest.changes_since_full_backup.saturating_add(1);

    let elapsed_since_full = epoch_secs.saturating_sub(manifest.last_full_backup_epoch);
    let should_trigger_full = manifest.changes_since_full_backup >= FULL_BACKUP_CHANGE_THRESHOLD
        || manifest.last_full_backup_epoch <= 0
        || elapsed_since_full >= FULL_BACKUP_INTERVAL_SECS;

    let mut full_backup_filename: Option<String> = None;
    if should_trigger_full {
        let (full_entry, _) = compile_and_upload_full_backup(
            &app,
            &auth_state,
            &db_state,
            &client,
            &mut token,
            &folder_id,
            &effective_google_id,
            &mut manifest,
        )
        .await?;
        full_backup_filename = Some(full_entry.filename);
    }

    save_manifest_in_folder_resilient(
        &app,
        &auth_state,
        &client,
        &mut token,
        &folder_id,
        manifest_file_id,
        &manifest,
    )
    .await?;

    *auth_state.drive_file_id.lock().map_err(|e| e.to_string())? = Some(uploaded.id.clone());

    Ok(BackupSyncResult {
        success: true,
        synced_at: iso_timestamp,
        file_id: Some(uploaded.id),
        folder_id: Some(folder_id),
        filename: Some(change_filename.clone()),
        snapshot_count: manifest.change_history.len(),
        full_backup_triggered: should_trigger_full,
        full_backup_filename,
        message: if should_trigger_full {
            format!(
                "Saved change {} and compiled grouped full backup in '{}'",
                change_filename, BACKUPS_FOLDER_NAME
            )
        } else {
            format!(
                "Saved change {} ({}/{} before next full backup)",
                change_filename, manifest.changes_since_full_backup, FULL_BACKUP_CHANGE_THRESHOLD
            )
        },
    })
}

#[tauri::command]
pub async fn get_grouped_backup_list(
    app: AppHandle,
    auth_state: State<'_, AuthState>,
) -> Result<GroupedBackupList, String> {
    let _ = get_authenticated_google_id(&auth_state)?;
    let client = reqwest::Client::new();

    let (mut token, folder_id_opt) =
        find_backups_folder_resilient(&app, &auth_state, &client).await?;

    let Some(folder_id) = folder_id_opt else {
        return Ok(GroupedBackupList {
            full_backups: Vec::new(),
            change_history: Vec::new(),
            changes_since_full_backup: 0,
            last_full_backup_at: None,
        });
    };

    let (_manifest_fid, manifest) =
        fetch_manifest_in_folder_resilient(&app, &auth_state, &client, &mut token, &folder_id)
            .await?;

    Ok(GroupedBackupList {
        full_backups: manifest.full_backups,
        change_history: manifest.change_history,
        changes_since_full_backup: manifest.changes_since_full_backup,
        last_full_backup_at: manifest.last_full_backup_at,
    })
}

#[tauri::command]
pub async fn get_backup_list(
    app: AppHandle,
    auth_state: State<'_, AuthState>,
) -> Result<Vec<BackupManifestEntry>, String> {
    let grouped = get_grouped_backup_list(app, auth_state).await?;
    Ok(grouped.full_backups)
}

#[tauri::command]
pub async fn restore_from_snapshot(
    filename: String,
    app: AppHandle,
    auth_state: State<'_, AuthState>,
    db_state: State<'_, DatabaseManager>,
) -> Result<DrivePullResult, String> {
    validate_snapshot_filename(&filename)?;
    let google_id = get_authenticated_google_id(&auth_state)?;
    let client = reqwest::Client::new();

    let (mut token, folder_id_opt) =
        find_backups_folder_resilient(&app, &auth_state, &client).await?;

    let Some(folder_id) = folder_id_opt else {
        return Err(format!(
            "Folder '{}' was not found in your Google Drive.",
            BACKUPS_FOLDER_NAME
        ));
    };

    let (_manifest_fid, manifest) =
        fetch_manifest_in_folder_resilient(&app, &auth_state, &client, &mut token, &folder_id)
            .await?;

    let mut target_file_id = manifest
        .full_backups
        .iter()
        .find(|e| e.filename == filename)
        .and_then(|e| e.file_id.clone());

    if target_file_id.is_none() {
        target_file_id =
            match find_file_in_folder(&client, &token, &folder_id, &filename).await {
                Ok(found) => found.map(|f| f.id),
                Err(err) if err == "UNAUTHORIZED" => {
                    token = refresh_google_access_token(Some(&app), &auth_state).await?;
                    find_file_in_folder(&client, &token, &folder_id, &filename)
                        .await?
                        .map(|f| f.id)
                }
                Err(err) => return Err(err),
            };
    }

    let Some(fid) = target_file_id else {
        return Err(format!(
            "Snapshot '{}' was not found inside '{}' in Google Drive.",
            filename, BACKUPS_FOLDER_NAME
        ));
    };

    let bytes = match download_drive_file_bytes(&client, &token, &fid).await {
        Ok(b) => b,
        Err(err) if err == "UNAUTHORIZED" => {
            token = refresh_google_access_token(Some(&app), &auth_state).await?;
            download_drive_file_bytes(&client, &token, &fid).await?
        }
        Err(err) => return Err(err),
    };

    if bytes.len() < 12 {
        return Err(format!("Snapshot '{}' is empty or corrupted.", filename));
    }

    let decrypted_str = decrypt_payload(&bytes, &google_id)?;
    let parsed: serde_json::Value = serde_json::from_str(&decrypted_str)
        .map_err(|e| format!("Failed to parse decrypted snapshot JSON: {}", e))?;

    let data_to_import = parsed.get("tables").or_else(|| parsed.get("data")).cloned();
    let Some(data_obj) = data_to_import else {
        return Ok(DrivePullResult {
            restored: false,
            filename: Some(filename),
            message: "Snapshot contained no database tables.".to_string(),
        });
    };

    db_import_all(data_obj, db_state.clone()).await?;

    Ok(DrivePullResult {
        restored: true,
        filename: Some(filename.clone()),
        message: format!(
            "Successfully restored SQLite database from full backup {}",
            filename
        ),
    })
}

#[tauri::command]
pub async fn revert_change_snapshot(
    filename: String,
    app: AppHandle,
    auth_state: State<'_, AuthState>,
    db_state: State<'_, DatabaseManager>,
) -> Result<DrivePullResult, String> {
    validate_snapshot_filename(&filename)?;
    let google_id = get_authenticated_google_id(&auth_state)?;
    let client = reqwest::Client::new();

    let (mut token, folder_id_opt) =
        find_backups_folder_resilient(&app, &auth_state, &client).await?;

    let Some(folder_id) = folder_id_opt else {
        return Err(format!(
            "Folder '{}' was not found in your Google Drive.",
            BACKUPS_FOLDER_NAME
        ));
    };

    let (_manifest_fid, manifest) =
        fetch_manifest_in_folder_resilient(&app, &auth_state, &client, &mut token, &folder_id)
            .await?;

    let mut target_file_id = manifest
        .change_history
        .iter()
        .find(|e| e.filename == filename)
        .and_then(|e| e.file_id.clone());

    if target_file_id.is_none() {
        target_file_id =
            match find_file_in_folder(&client, &token, &folder_id, &filename).await {
                Ok(found) => found.map(|f| f.id),
                Err(err) if err == "UNAUTHORIZED" => {
                    token = refresh_google_access_token(Some(&app), &auth_state).await?;
                    find_file_in_folder(&client, &token, &folder_id, &filename)
                        .await?
                        .map(|f| f.id)
                }
                Err(err) => return Err(err),
            };
    }

    let Some(fid) = target_file_id else {
        return Err(format!(
            "Change snapshot '{}' was not found inside '{}' in Google Drive.",
            filename, BACKUPS_FOLDER_NAME
        ));
    };

    let bytes = match download_drive_file_bytes(&client, &token, &fid).await {
        Ok(b) => b,
        Err(err) if err == "UNAUTHORIZED" => {
            token = refresh_google_access_token(Some(&app), &auth_state).await?;
            download_drive_file_bytes(&client, &token, &fid).await?
        }
        Err(err) => return Err(err),
    };

    if bytes.len() < 12 {
        return Err(format!("Change snapshot '{}' is empty or corrupted.", filename));
    }

    let decrypted_str = decrypt_payload(&bytes, &google_id)?;
    let parsed: serde_json::Value = serde_json::from_str(&decrypted_str)
        .map_err(|e| format!("Failed to parse decrypted change snapshot JSON: {}", e))?;

    let table = parsed
        .get("table")
        .and_then(|v| v.as_str())
        .ok_or("Change snapshot missing table name.")?;
    let action = parsed
        .get("action")
        .and_then(|v| v.as_str())
        .ok_or("Change snapshot missing action.")?;
    let record_id = parsed
        .get("record_id")
        .and_then(|v| v.as_str())
        .ok_or("Change snapshot missing record_id.")?;
    let before = parsed.get("before");

    let revert_msg = revert_single_change(&db_state, table, action, record_id, before)?;

    Ok(DrivePullResult {
        restored: true,
        filename: Some(filename),
        message: revert_msg,
    })
}

#[tauri::command]
pub async fn drive_pull_backup(
    app: AppHandle,
    google_id: Option<String>,
    auth_state: State<'_, AuthState>,
    db_state: State<'_, DatabaseManager>,
) -> Result<DrivePullResult, String> {
    let session_google_id = get_authenticated_google_id(&auth_state)?;
    if let Some(ref gid) = google_id {
        if !gid.trim().is_empty() && gid != &session_google_id {
            return Err("Google User ID does not match active authenticated session.".into());
        }
    }

    let backups = get_backup_list(app.clone(), auth_state.clone()).await?;
    let Some(latest) = backups.into_iter().next() else {
        return Ok(DrivePullResult {
            restored: false,
            filename: None,
            message: format!(
                "No full backups found in '{}' in Google Drive",
                BACKUPS_FOLDER_NAME
            ),
        });
    };

    restore_from_snapshot(latest.filename, app, auth_state, db_state).await
}
