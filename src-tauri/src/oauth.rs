use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl,
    Scope, TokenResponse, TokenUrl,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// Native Desktop OAuth Credentials (strictly scoped to Rust backend)
const CLIENT_ID: &str = "509114057579-hujt8mv20tj4vbul7f9ae4ua73j87eeq.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const VAULT_FILENAME: &str = "oauth_stronghold.bin";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PersistedSession {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub user_profile: UserProfile,
    pub drive_file_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfoResponse {
    pub sub: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleRefreshResponse {
    pub access_token: String,
}

// In-memory secure token store - RAW TOKENS NEVER EXPOSED TO REACT FRONTEND
pub struct AuthState {
    pub access_token: Mutex<Option<String>>,
    pub refresh_token: Mutex<Option<String>>,
    pub user_profile: Mutex<Option<UserProfile>>,
    pub drive_file_id: Mutex<Option<String>>,
    pub vault_dir: Mutex<Option<PathBuf>>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            access_token: Mutex::new(None),
            refresh_token: Mutex::new(None),
            user_profile: Mutex::new(None),
            drive_file_id: Mutex::new(None),
            vault_dir: Mutex::new(None),
        }
    }
}

fn derive_vault_key(vault_dir: &Path) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"rentflow_stronghold_session_key_v2:");
    hasher.update(CLIENT_ID.as_bytes());
    hasher.update(vault_dir.to_string_lossy().as_bytes());
    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest[..32]);
    key
}

fn save_persisted_session(state: &AuthState) {
    let vault_dir = state.vault_dir.lock().unwrap().clone();
    let Some(dir) = vault_dir else {
        return;
    };

    let profile = state.user_profile.lock().unwrap().clone();
    let access_token = state.access_token.lock().unwrap().clone();
    let refresh_token = state.refresh_token.lock().unwrap().clone();
    let drive_file_id = state.drive_file_id.lock().unwrap().clone();

    let vault_path = dir.join(VAULT_FILENAME);
    let (Some(user_profile), Some(access_token)) = (profile, access_token) else {
        let _ = fs::remove_file(vault_path);
        return;
    };

    let session = PersistedSession {
        access_token,
        refresh_token,
        user_profile,
        drive_file_id,
    };

    if let Ok(json_bytes) = serde_json::to_vec(&session) {
        let key = derive_vault_key(&dir);
        if let Ok(cipher) = Aes256Gcm::new_from_slice(&key) {
            let mut nonce_bytes = [0u8; 12];
            rand::thread_rng().fill_bytes(&mut nonce_bytes);
            let nonce = Nonce::from_slice(&nonce_bytes);
            if let Ok(ciphertext) = cipher.encrypt(nonce, json_bytes.as_slice()) {
                let mut payload = Vec::with_capacity(12 + ciphertext.len());
                payload.extend_from_slice(&nonce_bytes);
                payload.extend_from_slice(&ciphertext);
                let _ = fs::create_dir_all(&dir);
                let _ = fs::write(vault_path, payload);
            }
        }
    }
}

pub fn hydrate_auth_state(app_data_dir: &Path, state: &AuthState) {
    *state.vault_dir.lock().unwrap() = Some(app_data_dir.to_path_buf());
    let vault_path = app_data_dir.join(VAULT_FILENAME);
    let Ok(bytes) = fs::read(vault_path) else {
        return;
    };
    if bytes.len() <= 12 {
        return;
    }

    let key = derive_vault_key(app_data_dir);
    let Ok(cipher) = Aes256Gcm::new_from_slice(&key) else {
        return;
    };
    let (nonce_bytes, ciphertext) = bytes.split_at(12);
    let Ok(plaintext) = cipher.decrypt(Nonce::from_slice(nonce_bytes), ciphertext) else {
        return;
    };
    if let Ok(session) = serde_json::from_slice::<PersistedSession>(&plaintext) {
        *state.access_token.lock().unwrap() = Some(session.access_token);
        *state.refresh_token.lock().unwrap() = session.refresh_token;
        *state.user_profile.lock().unwrap() = Some(session.user_profile);
        *state.drive_file_id.lock().unwrap() = session.drive_file_id;
    }
}

pub fn clear_auth_state_and_vault(app_data_dir: Option<&Path>, state: &AuthState) {
    *state.access_token.lock().unwrap() = None;
    *state.refresh_token.lock().unwrap() = None;
    *state.user_profile.lock().unwrap() = None;
    *state.drive_file_id.lock().unwrap() = None;

    if let Some(dir) = app_data_dir {
        let _ = fs::remove_file(dir.join(VAULT_FILENAME));
        let _ = fs::remove_file(dir.join("stronghold.hold"));
    } else if let Some(dir) = state.vault_dir.lock().unwrap().clone() {
        let _ = fs::remove_file(dir.join(VAULT_FILENAME));
        let _ = fs::remove_file(dir.join("stronghold.hold"));
    }
}

pub async fn refresh_google_access_token(state: &AuthState) -> Result<String, String> {
    let refresh_token = state
        .refresh_token
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Session expired. Please sign in with Google again.".to_string())?;

    let http_client = reqwest::Client::new();
    let res = http_client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Network error refreshing Google token: {}", e))?;

    if !res.status().is_success() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("Failed to refresh Google session: {}", err_body));
    }

    let data: GoogleRefreshResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    *state.access_token.lock().unwrap() = Some(data.access_token.clone());
    save_persisted_session(state);
    Ok(data.access_token)
}

pub async fn get_valid_access_token(state: &AuthState) -> Result<String, String> {
    if let Some(token) = state.access_token.lock().unwrap().clone() {
        if !token.is_empty() {
            return Ok(token);
        }
    }
    refresh_google_access_token(state).await
}

#[tauri::command]
pub async fn google_login(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<UserProfile, String> {
    if let Ok(dir) = app.path().app_data_dir() {
        *state.vault_dir.lock().unwrap() = Some(dir);
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx_mutex = std::sync::Arc::new(Mutex::new(Some(tx)));

    // 1. Start loopback callback listener via tauri-plugin-oauth on 127.0.0.1:<port>/callback
    let port = tauri_plugin_oauth::start(move |url| {
        if let Ok(parsed_url) = reqwest::Url::parse(&url) {
            let mut auth_code: Option<String> = None;
            let mut oauth_error: Option<String> = None;

            for (k, v) in parsed_url.query_pairs() {
                if k == "code" {
                    auth_code = Some(v.to_string());
                } else if k == "error" {
                    oauth_error = Some(v.to_string());
                }
            }

            if let Some(sender) = tx_mutex.lock().unwrap().take() {
                if let Some(err) = oauth_error {
                    let _ = sender.send(Err(format!("Google sign-in denied: {}", err)));
                } else if let Some(code) = auth_code {
                    let _ = sender.send(Ok(code));
                } else {
                    let _ = sender.send(Err("No authorization code returned from Google.".to_string()));
                }
            }
        }
    })
    .map_err(|e| format!("Failed to start local OAuth loopback server: {}", e))?;

    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    // 2. Configure oauth2 BasicClient with PKCE
    let auth_url = AuthUrl::new(GOOGLE_AUTH_URL.to_string()).map_err(|e| e.to_string())?;
    let token_url = TokenUrl::new(GOOGLE_TOKEN_URL.to_string()).map_err(|e| e.to_string())?;
    let redirect = RedirectUrl::new(redirect_uri).map_err(|e| e.to_string())?;

    let client = BasicClient::new(
        ClientId::new(CLIENT_ID.to_string()),
        Some(ClientSecret::new(CLIENT_SECRET.to_string())),
        auth_url,
        Some(token_url),
    )
    .set_redirect_uri(redirect);

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let (authorize_url, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .add_scope(Scope::new("https://www.googleapis.com/auth/drive.appdata".to_string()))
        .add_extra_param("access_type", "offline")
        .add_extra_param("prompt", "consent")
        .set_pkce_challenge(pkce_challenge)
        .url();

    // 3. Open system default browser
    open::that(authorize_url.as_str())
        .map_err(|e| format!("Failed to open system browser for Google Login: {}", e))?;

    // 4. Await callback authorization code
    let auth_code = rx
        .await
        .map_err(|_| "Google OAuth loopback cancelled or timed out.".to_string())??;

    // 5. Exchange code for tokens via oauth2 crate
    let token_response = client
        .exchange_code(AuthorizationCode::new(auth_code))
        .set_pkce_verifier(pkce_verifier)
        .request_async(async_http_client)
        .await
        .map_err(|e| format!("OAuth token exchange failed: {}", e))?;

    let access_token = token_response.access_token().secret().to_string();
    let refresh_token = token_response.refresh_token().map(|t| t.secret().to_string());

    // 6. Fetch real Google user profile
    let http_client = reqwest::Client::new();
    let userinfo_res = http_client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Google userinfo: {}", e))?;

    if !userinfo_res.status().is_success() {
        return Err("Failed to retrieve authenticated Google user profile.".to_string());
    }

    let userinfo: GoogleUserInfoResponse = userinfo_res
        .json()
        .await
        .map_err(|e| format!("Invalid userinfo response: {}", e))?;

    let profile = UserProfile {
        id: userinfo.sub,
        email: userinfo.email,
        name: userinfo.name,
        picture: userinfo.picture,
    };

    // 7. Store tokens strictly in Rust backend + encrypted vault (NEVER return tokens to React)
    *state.access_token.lock().unwrap() = Some(access_token);
    if refresh_token.is_some() {
        *state.refresh_token.lock().unwrap() = refresh_token;
    }
    *state.user_profile.lock().unwrap() = Some(profile.clone());
    save_persisted_session(&state);

    Ok(profile)
}

#[tauri::command]
pub async fn google_oauth(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<UserProfile, String> {
    google_login(app, state).await
}

#[tauri::command]
pub async fn google_oauth_logout(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<(), String> {
    let token = state.access_token.lock().unwrap().take();
    if let Some(t) = token {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://oauth2.googleapis.com/revoke")
            .form(&[("token", t)])
            .send()
            .await;
    }

    let app_dir = app.path().app_data_dir().ok();
    clear_auth_state_and_vault(app_dir.as_deref(), &state);

    Ok(())
}

#[tauri::command]
pub async fn google_get_current_user(state: State<'_, AuthState>) -> Result<Option<UserProfile>, String> {
    let user = state.user_profile.lock().unwrap().clone();
    Ok(user)
}
