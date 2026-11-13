use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const ALLOWED_TABLES: &[&str] = &[
    "organizations",
    "users",
    "workspaces",
    "device_registry",
    "owners",
    "properties",
    "units",
    "tenants",
    "leases",
    "invoices",
    "payments",
    "credits",
    "deposits",
    "deposit_deductions",
    "maintenance_requests",
    "documents",
    "tenant_contact_logs",
    "vendors",
    "expenses",
    "rent_increases",
    "utility_bills",
    "audit_log",
    "sync_queue",
    "app_settings",
];

fn current_timestamp_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn validate_column_name(col: &str) -> Result<(), String> {
    if col.is_empty() || !col.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(format!("Invalid column identifier: '{}'", col));
    }
    Ok(())
}

fn row_to_json(row: &Row<'_>, column_names: &[String]) -> rusqlite::Result<Value> {
    let mut map = serde_json::Map::new();
    for (i, name) in column_names.iter().enumerate() {
        let val_ref = row.get_ref(i)?;
        let json_val = match val_ref {
            rusqlite::types::ValueRef::Null => Value::Null,
            rusqlite::types::ValueRef::Integer(n) => json!(n),
            rusqlite::types::ValueRef::Real(f) => json!(f),
            rusqlite::types::ValueRef::Text(s) => {
                let text = String::from_utf8_lossy(s).to_string();
                if (text.starts_with('{') && text.ends_with('}'))
                    || (text.starts_with('[') && text.ends_with(']'))
                {
                    serde_json::from_str(&text).unwrap_or(json!(text))
                } else {
                    json!(text)
                }
            }
            rusqlite::types::ValueRef::Blob(b) => json!(BASE64_STANDARD.encode(b)),
        };
        map.insert(name.clone(), json_val);
    }
    Ok(Value::Object(map))
}

fn query_table_rows(conn: &Connection, table_name: &str) -> Result<Vec<Value>, String> {
    validate_table_name(table_name)?;

    let sql = if table_name == "audit_log" || table_name == "sync_queue" {
        format!("SELECT * FROM {} ORDER BY created_at DESC", table_name)
    } else {
        format!(
            "SELECT * FROM {} WHERE deleted_at IS NULL ORDER BY updated_at DESC",
            table_name
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt
        .column_names()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    let rows = stmt
        .query_map([], |row| row_to_json(row, &column_names))
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            result.push(item);
        }
    }
    Ok(result)
}

fn query_item_by_id(conn: &Connection, table_name: &str, id: &str) -> Result<Option<Value>, String> {
    validate_table_name(table_name)?;

    let sql = if table_name == "audit_log" || table_name == "sync_queue" {
        format!("SELECT * FROM {} WHERE id = ? LIMIT 1", table_name)
    } else {
        format!(
            "SELECT * FROM {} WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            table_name
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt
        .column_names()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    let mut rows = stmt
        .query_map(params![id], |row| row_to_json(row, &column_names))
        .map_err(|e| e.to_string())?;

    if let Some(first) = rows.next() {
        first.map(Some).map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

fn insert_json_into_conn(conn: &Connection, table_name: &str, item: &Value) -> Result<Value, String> {
    validate_table_name(table_name)?;
    let obj = item.as_object().ok_or("Item must be a JSON object")?;

    let mut keys: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    for (raw_key, val) in obj.iter() {
        if raw_key == "deletedAt" {
            continue;
        }
        validate_column_name(raw_key)?;
        keys.push(raw_key.clone());

        let boxed: Box<dyn rusqlite::ToSql> = match val {
            Value::Null => Box::new(rusqlite::types::Null),
            Value::Bool(b) => Box::new(if *b { 1 } else { 0 }),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Box::new(i)
                } else if let Some(f) = n.as_f64() {
                    Box::new(f)
                } else {
                    Box::new(0)
                }
            }
            Value::String(s) => Box::new(s.clone()),
            Value::Array(_) | Value::Object(_) => Box::new(val.to_string()),
        };
        params_vec.push(boxed);
    }

    let placeholders: Vec<&str> = keys.iter().map(|_| "?").collect();
    let sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
        table_name,
        keys.join(", "),
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
    stmt.execute(&*params_slice).map_err(|e| e.to_string())?;

    Ok(item.clone())
}

pub fn open_connection(db_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create db dir: {}", e))?;
    }

    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    let _ = conn.execute("PRAGMA journal_mode = WAL;", []);
    let _ = conn.execute("PRAGMA foreign_keys = ON;", []);

    Ok(conn)
}

pub struct DatabaseManager {
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
}

impl DatabaseManager {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        let conn = open_connection(&db_path)?;
        let mgr = Self {
            conn: Mutex::new(conn),
            db_path,
        };

        mgr.run_migrations()?;
        Ok(mgr)
    }

    pub fn new_with_key(db_path: PathBuf, _key: &str) -> Result<Self, String> {
        Self::new(db_path)
    }

    pub fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                country_code TEXT NOT NULL,
                display_currency TEXT NOT NULL,
                timezone TEXT NOT NULL DEFAULT 'UTC',
                locale TEXT NOT NULL DEFAULT 'en-US',
                plan TEXT NOT NULL DEFAULT 'landlord',
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                google_sub TEXT NOT NULL,
                email TEXT NOT NULL,
                name TEXT NOT NULL,
                picture TEXT,
                role TEXT NOT NULL DEFAULT 'owner',
                auth_provider TEXT NOT NULL DEFAULT 'local',
                status TEXT NOT NULL DEFAULT 'active',
                last_login_at INTEGER,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                storage_model TEXT NOT NULL DEFAULT 'personal',
                drive_folder_id TEXT,
                drive_owner_email TEXT,
                encryption_salt TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS device_registry (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                device_name TEXT NOT NULL,
                os TEXT NOT NULL,
                last_sync_at INTEGER,
                revoked_at INTEGER,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS owners (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                payout_details TEXT,
                commission_type TEXT NOT NULL DEFAULT 'percentage',
                commission_value REAL NOT NULL DEFAULT 8.0,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS properties (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                owner_id TEXT,
                name TEXT NOT NULL,
                address_line1 TEXT,
                address_line2 TEXT,
                address TEXT,
                city TEXT,
                region TEXT,
                postal_code TEXT,
                type TEXT NOT NULL DEFAULT 'residential_apartment',
                country_code TEXT NOT NULL DEFAULT 'US',
                notes TEXT,
                photo_url TEXT,
                latitude REAL,
                longitude REAL,
                lat REAL,
                lng REAL,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS units (
                id TEXT PRIMARY KEY,
                property_id TEXT NOT NULL,
                name TEXT NOT NULL,
                size REAL NOT NULL DEFAULT 0,
                area_unit TEXT NOT NULL DEFAULT 'sqft',
                bedrooms INTEGER NOT NULL DEFAULT 1,
                bathrooms REAL NOT NULL DEFAULT 1,
                rent_minor INTEGER NOT NULL DEFAULT 0,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                status TEXT NOT NULL DEFAULT 'vacant',
                amenities_json TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS tenants (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL,
                id_type TEXT NOT NULL,
                id_number TEXT NOT NULL,
                emergency_contact TEXT,
                occupants INTEGER DEFAULT 1,
                notes_json TEXT,
                tags_json TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS leases (
                id TEXT PRIMARY KEY,
                unit_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                rent_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                country_code_snapshot TEXT NOT NULL DEFAULT 'US',
                pack_version_snapshot INTEGER NOT NULL DEFAULT 1,
                billing_cycle TEXT NOT NULL DEFAULT 'monthly',
                due_day INTEGER NOT NULL DEFAULT 1,
                deposit_minor INTEGER NOT NULL DEFAULT 0,
                late_fee_type TEXT NOT NULL DEFAULT 'percent',
                late_fee_value REAL NOT NULL DEFAULT 5,
                grace_days INTEGER NOT NULL DEFAULT 5,
                status TEXT NOT NULL DEFAULT 'active',
                terms_notes TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                lease_id TEXT NOT NULL,
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                due_date TEXT NOT NULL,
                subtotal_minor INTEGER NOT NULL,
                late_fee_minor INTEGER NOT NULL DEFAULT 0,
                total_minor INTEGER NOT NULL,
                amount_paid_minor INTEGER NOT NULL DEFAULT 0,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                status TEXT NOT NULL DEFAULT 'unpaid',
                voided_reason TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                invoice_id TEXT NOT NULL,
                amount_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                method TEXT NOT NULL,
                reference TEXT,
                paid_at TEXT NOT NULL,
                receipt_path TEXT,
                reversal_of_id TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS credits (
                id TEXT PRIMARY KEY,
                tenant_id TEXT,
                lease_id TEXT NOT NULL,
                amount_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                reason TEXT NOT NULL,
                applied_invoice_id TEXT,
                source_payment_id TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS deposits (
                id TEXT PRIMARY KEY,
                lease_id TEXT NOT NULL,
                amount_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                received_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'held',
                interest_accrued_minor INTEGER NOT NULL DEFAULT 0,
                returned_minor INTEGER NOT NULL DEFAULT 0,
                deductions_json TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS deposit_deductions (
                id TEXT PRIMARY KEY,
                deposit_id TEXT NOT NULL,
                lease_id TEXT NOT NULL,
                tenant_id TEXT,
                amount_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                reason TEXT NOT NULL,
                receipt_note TEXT,
                deducted_at TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS maintenance_requests (
                id TEXT PRIMARY KEY,
                unit_id TEXT NOT NULL,
                tenant_id TEXT,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                urgency TEXT NOT NULL DEFAULT 'medium',
                status TEXT NOT NULL DEFAULT 'new',
                vendor_id TEXT,
                cost_minor INTEGER NOT NULL DEFAULT 0,
                paid_by TEXT NOT NULL DEFAULT 'landlord',
                completed_at TEXT,
                photo_url TEXT,
                needs_approval INTEGER NOT NULL DEFAULT 0,
                approved_by TEXT,
                approved_at TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                related_entity_type TEXT,
                related_entity_id TEXT,
                file_name TEXT NOT NULL,
                file_data_or_url TEXT NOT NULL,
                file_size_bytes INTEGER,
                expiry_date TEXT,
                notes TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS tenant_contact_logs (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                channel TEXT NOT NULL,
                summary TEXT NOT NULL,
                details TEXT,
                user_name TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS vendors (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'maintenance',
                service_category TEXT,
                phone TEXT NOT NULL,
                email TEXT,
                rating REAL,
                contact_person TEXT,
                tax_id TEXT,
                is_insured INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL DEFAULT 'org_demo_1',
                property_id TEXT,
                unit_id TEXT,
                category TEXT NOT NULL,
                amount_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                expense_date TEXT,
                date TEXT,
                vendor_id TEXT,
                vendor TEXT,
                receipt_path TEXT,
                receipt_url TEXT,
                notes TEXT,
                description TEXT,
                tax_deductible INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS rent_increases (
                id TEXT PRIMARY KEY,
                unit_id TEXT NOT NULL,
                old_amount_minor INTEGER NOT NULL,
                new_amount_minor INTEGER NOT NULL,
                effective_date TEXT NOT NULL,
                reason TEXT,
                user_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER,
                device_id TEXT,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS utility_bills (
                id TEXT PRIMARY KEY,
                property_id TEXT NOT NULL,
                unit_id TEXT,
                utility_type TEXT NOT NULL,
                bill_period TEXT,
                provider_name TEXT,
                account_number TEXT,
                total_amount_minor INTEGER,
                amount_minor INTEGER,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                split_method TEXT,
                splits_json TEXT,
                bill_date TEXT,
                due_date TEXT,
                status TEXT DEFAULT 'unpaid',
                paid_at TEXT,
                created_at INTEGER,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                before_json TEXT,
                after_json TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                op TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0,
                file_id TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            "#,
        )
        .map_err(|e| format!("Migration error: {}", e))?;

        // Forward-compatible column migrations for existing desktop DB files
        let alter_statements = [
            "ALTER TABLE properties ADD COLUMN lat REAL;",
            "ALTER TABLE properties ADD COLUMN lng REAL;",
            "ALTER TABLE vendors ADD COLUMN category TEXT DEFAULT 'maintenance';",
            "ALTER TABLE vendors ADD COLUMN rating REAL;",
            "ALTER TABLE expenses ADD COLUMN org_id TEXT DEFAULT 'org_demo_1';",
            "ALTER TABLE expenses ADD COLUMN expense_date TEXT;",
            "ALTER TABLE expenses ADD COLUMN vendor_id TEXT;",
            "ALTER TABLE expenses ADD COLUMN receipt_path TEXT;",
            "ALTER TABLE expenses ADD COLUMN notes TEXT;",
            "ALTER TABLE utility_bills ADD COLUMN bill_period TEXT;",
            "ALTER TABLE utility_bills ADD COLUMN total_amount_minor INTEGER;",
            "ALTER TABLE utility_bills ADD COLUMN split_method TEXT;",
            "ALTER TABLE utility_bills ADD COLUMN splits_json TEXT;",
            "ALTER TABLE utility_bills ADD COLUMN created_at INTEGER;",
            "ALTER TABLE deposit_deductions ADD COLUMN tenant_id TEXT;",
            "ALTER TABLE credits ADD COLUMN tenant_id TEXT;",
            "ALTER TABLE credits ADD COLUMN source_payment_id TEXT;",
            "ALTER TABLE credits ADD COLUMN status TEXT DEFAULT 'active';",
            "ALTER TABLE credits ADD COLUMN created_at INTEGER DEFAULT 0;",
        ];
        for stmt in alter_statements {
            let _ = conn.execute(stmt, []);
        }

        Ok(())
    }
}

pub fn validate_table_name(table_name: &str) -> Result<(), String> {
    if !ALLOWED_TABLES.contains(&table_name) {
        return Err(format!("Forbidden or invalid table name: '{}'", table_name));
    }
    Ok(())
}

pub fn validate_safe_path(path_str: &str) -> Result<(), String> {
    if path_str.contains("..") || path_str.contains('\0') {
        return Err("Security Violation: Path traversal or invalid character detected".into());
    }
    Ok(())
}

// --- Core Tauri Database Commands ---

#[tauri::command]
pub async fn db_init(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let db_path = app_data_dir.join("rentflow.db");

    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Dir create error: {}", e))?;
    }

    let _mgr = DatabaseManager::new(db_path)?;
    Ok("SQLite database initialized successfully".to_string())
}

#[tauri::command]
pub async fn db_get_table(
    table_name: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, &table_name)
}

#[tauri::command]
pub async fn db_get_item(
    table_name: String,
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Option<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_item_by_id(&conn, &table_name, &id)
}

#[tauri::command]
pub async fn db_insert_item(
    table_name: String,
    item: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, &table_name, &item)
}

#[tauri::command]
pub async fn db_update_item(
    table_name: String,
    id: String,
    updates: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    validate_table_name(&table_name)?;
    let obj = updates.as_object().ok_or("Updates must be a JSON object")?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut set_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    for (k, val) in obj.iter() {
        if k == "deletedAt" {
            continue;
        }
        validate_column_name(k)?;
        set_clauses.push(format!("{} = ?", k));

        let boxed: Box<dyn rusqlite::ToSql> = match val {
            Value::Null => Box::new(rusqlite::types::Null),
            Value::Bool(b) => Box::new(if *b { 1 } else { 0 }),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Box::new(i)
                } else if let Some(f) = n.as_f64() {
                    Box::new(f)
                } else {
                    Box::new(0)
                }
            }
            Value::String(s) => Box::new(s.clone()),
            Value::Array(_) | Value::Object(_) => Box::new(val.to_string()),
        };
        params_vec.push(boxed);
    }

    if set_clauses.is_empty() {
        return Ok(updates);
    }

    let sql = format!(
        "UPDATE {} SET {} WHERE id = ?",
        table_name,
        set_clauses.join(", ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    params_vec.push(Box::new(id));
    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    stmt.execute(&*params_slice).map_err(|e| e.to_string())?;
    Ok(updates)
}

#[tauri::command]
pub async fn db_delete_item(
    table_name: String,
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    validate_table_name(&table_name)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now_ts = current_timestamp_ms();

    let sql = format!(
        "UPDATE {} SET deleted_at = ?, updated_at = ? WHERE id = ?",
        table_name
    );
    conn.execute(&sql, params![now_ts, now_ts, id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// --- Clean Typed Domain Commands ---

#[tauri::command]
pub async fn get_properties(state: tauri::State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "properties")
}

#[tauri::command]
pub async fn add_property(
    property: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "properties", &property)
}

#[tauri::command]
pub async fn get_units(state: tauri::State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "units")
}

#[tauri::command]
pub async fn add_unit(
    unit: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "units", &unit)
}

#[tauri::command]
pub async fn get_tenants(state: tauri::State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "tenants")
}

#[tauri::command]
pub async fn add_tenant(
    tenant: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "tenants", &tenant)
}

#[tauri::command]
pub async fn get_leases(state: tauri::State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "leases")
}

#[tauri::command]
pub async fn add_lease(
    lease: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "leases", &lease)
}

#[tauri::command]
pub async fn get_invoices(state: tauri::State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "invoices")
}

#[tauri::command]
pub async fn add_invoice(
    invoice: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "invoices", &invoice)
}

/// Atomically records a payment, caps invoice amount_paid_minor at total_minor,
/// creates an active Credit record for any overpayment, and updates parent invoice.
#[tauri::command]
pub async fn record_payment_transaction(
    invoice_id: String,
    payment_id: String,
    amount_minor: i64,
    method: String,
    reference: Option<String>,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    if amount_minor <= 0 {
        return Err("Payment amount must be greater than zero.".to_string());
    }

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now_ms = current_timestamp_ms();

    let (lease_id, total_minor, current_paid_minor, currency_code, device_id): (
        String,
        i64,
        i64,
        String,
        String,
    ) = tx
        .query_row(
            "SELECT lease_id, total_minor, amount_paid_minor, currency_code, device_id FROM invoices WHERE id = ? AND deleted_at IS NULL",
            params![invoice_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| format!("Invoice not found: {}", e))?;

    let remaining_due_minor = (total_minor - current_paid_minor).max(0);
    let applied_minor = amount_minor.min(remaining_due_minor);
    let overpayment_minor = (amount_minor - applied_minor).max(0);

    let new_paid = current_paid_minor + applied_minor;
    let new_status = if new_paid >= total_minor {
        "paid"
    } else {
        "partially_paid"
    };

    tx.execute(
        "UPDATE invoices SET amount_paid_minor = ?, status = ?, updated_at = ? WHERE id = ?",
        params![new_paid, new_status, now_ms, invoice_id],
    )
    .map_err(|e| e.to_string())?;

    let ref_val = reference.unwrap_or_else(|| format!("REF-{}", now_ms));
    let paid_at_iso = format!("{}", now_ms);

    tx.execute(
        "INSERT INTO payments (id, invoice_id, amount_minor, currency_code, method, reference, paid_at, updated_at, device_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
        params![
            payment_id,
            invoice_id,
            amount_minor,
            currency_code,
            method,
            ref_val,
            paid_at_iso,
            now_ms,
            device_id
        ],
    )
    .map_err(|e| e.to_string())?;

    let mut created_credit_id: Option<String> = None;
    if overpayment_minor > 0 {
        let tenant_id: Option<String> = tx
            .query_row(
                "SELECT tenant_id FROM leases WHERE id = ? LIMIT 1",
                params![lease_id],
                |row| row.get(0),
            )
            .ok();

        let credit_id = format!("cred_{}_{}", now_ms, payment_id);
        let reason = format!("Overpayment credit from invoice {}", invoice_id);
        tx.execute(
            "INSERT INTO credits (id, tenant_id, lease_id, amount_minor, currency_code, reason, applied_invoice_id, source_payment_id, status, created_at, updated_at, device_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'active', ?, ?, ?, NULL)",
            params![
                credit_id,
                tenant_id,
                lease_id,
                overpayment_minor,
                currency_code,
                reason,
                payment_id,
                now_ms,
                now_ms,
                device_id
            ],
        )
        .map_err(|e| e.to_string())?;
        created_credit_id = Some(credit_id);
    }

    tx.commit().map_err(|e| e.to_string())?;

    let invoice_json = query_item_by_id(&conn, "invoices", &invoice_id)?
        .ok_or_else(|| "Failed to read updated invoice".to_string())?;
    let payment_json = query_item_by_id(&conn, "payments", &payment_id)?
        .ok_or_else(|| "Failed to read recorded payment".to_string())?;
    let credit_json = match created_credit_id {
        Some(cid) => query_item_by_id(&conn, "credits", &cid)?,
        None => None,
    };

    Ok(json!({
        "payment": payment_json,
        "invoice": invoice_json,
        "credit": credit_json
    }))
}

// --- Transactional Cascading Soft Deletes ---

#[tauri::command]
pub async fn db_delete_property_cascading(
    property_id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = current_timestamp_ms();

    tx.execute(
        "UPDATE properties SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE units SET deleted_at = ?, updated_at = ? WHERE property_id = ?",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE maintenance_requests SET deleted_at = ?, updated_at = ? WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?)",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE leases SET deleted_at = ?, updated_at = ? WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?)",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE invoices SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?))",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE payments SET deleted_at = ?, updated_at = ? WHERE invoice_id IN (SELECT id FROM invoices WHERE lease_id IN (SELECT id FROM leases WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?)))",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE credits SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?))",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE deposits SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?))",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE deposit_deductions SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?))",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_delete_unit_cascading(
    unit_id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = current_timestamp_ms();

    tx.execute(
        "UPDATE units SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE maintenance_requests SET deleted_at = ?, updated_at = ? WHERE unit_id = ?",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE leases SET deleted_at = ?, updated_at = ? WHERE unit_id = ?",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE invoices SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id = ?)",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE payments SET deleted_at = ?, updated_at = ? WHERE invoice_id IN (SELECT id FROM invoices WHERE lease_id IN (SELECT id FROM leases WHERE unit_id = ?))",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE credits SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id = ?)",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE deposits SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id = ?)",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE deposit_deductions SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id = ?)",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_delete_invoice_cascading(
    invoice_id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = current_timestamp_ms();

    tx.execute(
        "UPDATE invoices SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, invoice_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE payments SET deleted_at = ?, updated_at = ? WHERE invoice_id = ?",
        params![now, now, invoice_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_delete_tenant_cascading(
    tenant_id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = current_timestamp_ms();

    tx.execute(
        "UPDATE tenants SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE leases SET deleted_at = ?, updated_at = ? WHERE tenant_id = ?",
        params![now, now, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE units SET status = 'vacant', updated_at = ? WHERE status != 'maintenance' AND id IN (SELECT unit_id FROM leases WHERE tenant_id = ?) AND id NOT IN (SELECT unit_id FROM leases WHERE status = 'active' AND deleted_at IS NULL)",
        params![now, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE invoices SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE tenant_id = ?)",
        params![now, now, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE payments SET deleted_at = ?, updated_at = ? WHERE invoice_id IN (SELECT id FROM invoices WHERE lease_id IN (SELECT id FROM leases WHERE tenant_id = ?))",
        params![now, now, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE credits SET deleted_at = ?, updated_at = ? WHERE tenant_id = ? OR lease_id IN (SELECT id FROM leases WHERE tenant_id = ?)",
        params![now, now, tenant_id, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE deposits SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE tenant_id = ?)",
        params![now, now, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE deposit_deductions SET deleted_at = ?, updated_at = ? WHERE tenant_id = ? OR lease_id IN (SELECT id FROM leases WHERE tenant_id = ?)",
        params![now, now, tenant_id, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// Export All Data (for backup / Drive sync)
#[tauri::command]
pub async fn db_export_all(state: tauri::State<'_, DatabaseManager>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut map = serde_json::Map::new();

    for table in ALLOWED_TABLES {
        let rows = query_table_rows(&conn, table)?;
        map.insert(table.to_string(), Value::Array(rows));
    }

    Ok(Value::Object(map))
}

// Atomic Import All Data
#[tauri::command]
pub async fn db_import_all(
    data: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let obj = data.as_object().ok_or("Import payload must be an object")?;
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (table, rows_val) in obj {
        if !ALLOWED_TABLES.contains(&table.as_str()) {
            continue;
        }
        if let Some(rows) = rows_val.as_array() {
            for row in rows {
                insert_json_into_conn(&tx, table, row)?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// Backup Database File (Creates an encrypted copy of the SQLite database file at user-selected location)
#[tauri::command]
pub async fn db_backup_file(
    destination_path: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<String, String> {
    validate_safe_path(&destination_path)?;

    let dest = PathBuf::from(&destination_path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination directory: {}", e))?;
        }
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let _ = conn.execute("PRAGMA wal_checkpoint(FULL);", []);

    fs::copy(&state.db_path, &dest)
        .map_err(|e| format!("Failed to copy database file: {}", e))?;

    Ok(format!(
        "Database file successfully backed up to {}",
        destination_path
    ))
}

// ============================================================================
// TYPED CRUD COMMANDS FOR DESKTOP FRONTEND INTEGRATION
// ============================================================================

// --- Properties ---
#[tauri::command]
pub async fn update_property(
    id: String,
    property: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    db_update_item("properties".to_string(), id, property, state).await
}

#[tauri::command]
pub async fn delete_property(
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    db_delete_property_cascading(id, state).await
}

// --- Units ---
#[tauri::command]
pub async fn update_unit(
    id: String,
    unit: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    db_update_item("units".to_string(), id, unit, state).await
}

#[tauri::command]
pub async fn delete_unit(
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    db_delete_unit_cascading(id, state).await
}

// --- Tenants ---
#[tauri::command]
pub async fn update_tenant(
    id: String,
    tenant: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    db_update_item("tenants".to_string(), id, tenant, state).await
}

#[tauri::command]
pub async fn delete_tenant(
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    db_delete_tenant_cascading(id, state).await
}

// --- Leases ---
#[tauri::command]
pub async fn update_lease(
    id: String,
    lease: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    db_update_item("leases".to_string(), id, lease, state).await
}

#[tauri::command]
pub async fn delete_lease(
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now_ts = current_timestamp_ms();

    let unit_id: Option<String> = tx
        .query_row(
            "SELECT unit_id FROM leases WHERE id = ? LIMIT 1",
            params![id],
            |row| row.get(0),
        )
        .ok();

    tx.execute(
        "UPDATE leases SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now_ts, now_ts, id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(uid) = unit_id {
        let active_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM leases WHERE unit_id = ? AND status = 'active' AND deleted_at IS NULL",
                params![uid],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if active_count == 0 {
            tx.execute(
                "UPDATE units SET status = 'vacant', updated_at = ? WHERE id = ? AND status != 'maintenance'",
                params![now_ts, uid],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// --- Invoices ---
#[tauri::command]
pub async fn update_invoice(
    id: String,
    invoice: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    db_update_item("invoices".to_string(), id, invoice, state).await
}

#[tauri::command]
pub async fn delete_invoice(
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    db_delete_invoice_cascading(id, state).await
}

// --- Payments ---
#[tauri::command]
pub async fn get_payments(
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "payments")
}

#[tauri::command]
pub async fn add_payment(
    payment: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "payments", &payment)
}

// --- Expenses ---
#[tauri::command]
pub async fn get_expenses(
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "expenses")
}

#[tauri::command]
pub async fn add_expense(
    expense: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "expenses", &expense)
}

#[tauri::command]
pub async fn update_expense(
    id: String,
    expense: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    db_update_item("expenses".to_string(), id, expense, state).await
}

#[tauri::command]
pub async fn delete_expense(
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    db_delete_item("expenses".to_string(), id, state).await
}

// --- Maintenance Requests ---
#[tauri::command]
pub async fn get_maintenance_requests(
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "maintenance_requests")
}

#[tauri::command]
pub async fn add_maintenance_request(
    request: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "maintenance_requests", &request)
}

#[tauri::command]
pub async fn update_maintenance_request(
    id: String,
    request: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    db_update_item("maintenance_requests".to_string(), id, request, state).await
}

#[tauri::command]
pub async fn delete_maintenance_request(
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    db_delete_item("maintenance_requests".to_string(), id, state).await
}

// --- Vendors ---
#[tauri::command]
pub async fn get_vendors(
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "vendors")
}

#[tauri::command]
pub async fn add_vendor(
    vendor: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "vendors", &vendor)
}

#[tauri::command]
pub async fn update_vendor(
    id: String,
    vendor: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    db_update_item("vendors".to_string(), id, vendor, state).await
}

#[tauri::command]
pub async fn delete_vendor(
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    db_delete_item("vendors".to_string(), id, state).await
}

// --- Credits ---
#[tauri::command]
pub async fn get_credits(
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Vec<Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    query_table_rows(&conn, "credits")
}

#[tauri::command]
pub async fn add_credit(
    credit: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    insert_json_into_conn(&conn, "credits", &credit)
}

// --- Settings ---
#[tauri::command]
pub async fn get_settings(
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value_json FROM app_settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let val_str: String = row.get(1)?;
            let parsed: Value = serde_json::from_str(&val_str).unwrap_or(json!(val_str));
            Ok((key, parsed))
        })
        .map_err(|e| e.to_string())?;

    let mut map = serde_json::Map::new();
    for item in rows {
        if let Ok((k, v)) = item {
            map.insert(k, v);
        }
    }
    Ok(Value::Object(map))
}

#[tauri::command]
pub async fn save_setting(
    key: String,
    value: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let val_str = serde_json::to_string(&value).map_err(|e| e.to_string())?;
    let now = current_timestamp_ms();
    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value_json = ?2, updated_at = ?3",
        params![key, val_str, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_settings(
    settings: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let obj = settings.as_object().ok_or("Settings must be an object")?;
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = current_timestamp_ms();
    for (k, v) in obj {
        let val_str = serde_json::to_string(v).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value_json = ?2, updated_at = ?3",
            params![k, val_str, now],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_app_data_path(
    state: tauri::State<'_, DatabaseManager>,
) -> Result<String, String> {
    Ok(state.db_path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default())
}

#[derive(serde::Deserialize)]
pub struct DeductionInputItem {
    pub id: String,
    pub reason: String,
    pub amount_minor: i64,
}

/// Atomically records security deposit deductions inside SQLite without creating expenses or invoices.
#[tauri::command]
pub async fn record_deduction_transaction(
    lease_id: String,
    items: Vec<DeductionInputItem>,
    receipt_note: Option<String>,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    if items.is_empty() {
        return Err("At least one deduction item is required.".to_string());
    }

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now_ms = current_timestamp_ms();
    let now_iso = format!("{}", now_ms);

    let (tenant_id, lease_deposit_minor, lease_currency, lease_start, lease_device): (
        String,
        i64,
        String,
        String,
        String,
    ) = tx
        .query_row(
            "SELECT tenant_id, deposit_minor, currency_code, start_date, device_id FROM leases WHERE id = ? AND deleted_at IS NULL",
            params![lease_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| format!("Lease not found: {}", e))?;

    let existing_dep: Option<(String, i64, String, Option<String>)> = tx
        .query_row(
            "SELECT id, amount_minor, currency_code, deductions_json FROM deposits WHERE lease_id = ? AND deleted_at IS NULL LIMIT 1",
            params![lease_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();

    let (deposit_id, deposit_amount_minor, currency_code, prev_deductions_json) = match existing_dep {
        Some(d) => d,
        None => {
            if lease_deposit_minor <= 0 {
                return Err("No security deposit found for this lease.".to_string());
            }
            let new_dep_id = format!("dep_{}_{}", lease_id, now_ms);
            tx.execute(
                "INSERT INTO deposits (id, lease_id, amount_minor, currency_code, received_at, status, interest_accrued_minor, returned_minor, deductions_json, updated_at, device_id, deleted_at) VALUES (?, ?, ?, ?, ?, 'held', 0, 0, NULL, ?, ?, NULL)",
                params![
                    new_dep_id,
                    lease_id,
                    lease_deposit_minor,
                    lease_currency,
                    lease_start,
                    now_ms,
                    lease_device
                ],
            )
            .map_err(|e| e.to_string())?;
            (new_dep_id, lease_deposit_minor, lease_currency, None)
        }
    };

    let existing_deducted_minor: i64 = tx
        .query_row(
            "SELECT COALESCE(SUM(amount_minor), 0) FROM deposit_deductions WHERE deposit_id = ? AND deleted_at IS NULL",
            params![deposit_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let remaining_before = (deposit_amount_minor - existing_deducted_minor).max(0);
    let requested_total: i64 = items.iter().map(|i| i.amount_minor.max(0)).sum();
    if requested_total <= 0 {
        return Err("Deduction total must be greater than zero.".to_string());
    }
    if requested_total > remaining_before {
        return Err("Deduction amount exceeds the remaining deposit balance.".to_string());
    }

    let note_clean = receipt_note.as_deref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    let mut existing_items: Vec<Value> = prev_deductions_json
        .as_deref()
        .and_then(|s| serde_json::from_str::<Value>(s).ok())
        .and_then(|v| v.get("deductions").and_then(|d| d.as_array()).cloned())
        .unwrap_or_default();

    let mut inserted_ids: Vec<String> = Vec::new();
    for item in &items {
        if item.amount_minor <= 0 || item.reason.trim().is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO deposit_deductions (id, deposit_id, lease_id, tenant_id, amount_minor, currency_code, reason, receipt_note, deducted_at, created_at, updated_at, device_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
            params![
                item.id,
                deposit_id,
                lease_id,
                tenant_id,
                item.amount_minor,
                currency_code,
                item.reason.trim(),
                note_clean,
                now_iso,
                now_ms,
                now_ms,
                lease_device
            ],
        )
        .map_err(|e| e.to_string())?;
        inserted_ids.push(item.id.clone());
        existing_items.push(json!({
            "id": item.id,
            "reason": item.reason.trim(),
            "amount_minor": item.amount_minor,
            "date": now_iso
        }));
    }

    let total_deducted_after = existing_deducted_minor + requested_total;
    let remaining_after = (deposit_amount_minor - total_deducted_after).max(0);
    let next_status = if remaining_after == 0 {
        "forfeited"
    } else if total_deducted_after > 0 {
        "partially_returned"
    } else {
        "returned"
    };

    let ledger_json = json!({
        "deductions": existing_items,
        "total_deductions_minor": total_deducted_after,
        "refunded_minor": remaining_after,
        "settled_at": now_iso,
        "receipt_note": note_clean
    })
    .to_string();

    tx.execute(
        "UPDATE deposits SET deductions_json = ?, returned_minor = ?, status = ?, updated_at = ? WHERE id = ?",
        params![ledger_json, remaining_after, next_status, now_ms, deposit_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    let deposit_json = query_item_by_id(&conn, "deposits", &deposit_id)?
        .ok_or_else(|| "Failed to read updated deposit".to_string())?;

    let mut deduction_rows = Vec::new();
    for did in inserted_ids {
        if let Some(row) = query_item_by_id(&conn, "deposit_deductions", &did)? {
            deduction_rows.push(row);
        }
    }

    Ok(json!({
        "deposit": deposit_json,
        "deductions": deduction_rows,
        "remainingBalanceMinor": remaining_after
    }))
}

/// Wipes all SQLite tables and clears persisted Stronghold/OAuth vault data locally.
#[tauri::command]
pub async fn wipe_all_local_data(
    app: AppHandle,
    state: tauri::State<'_, DatabaseManager>,
    auth_state: tauri::State<'_, crate::oauth::AuthState>,
) -> Result<(), String> {
    {
        let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for table in ALLOWED_TABLES {
            let sql = format!("DELETE FROM {};", table);
            tx.execute(&sql, []).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        let _ = conn.execute("VACUUM;", []);
    }

    let app_dir = app.path().app_data_dir().ok();
    crate::oauth::clear_auth_state_and_vault(app_dir.as_deref(), &auth_state);

    Ok(())
}
