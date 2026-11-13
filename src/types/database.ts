export type UserRole = "admin" | "member" | "viewer";
export type InviteStatus = "invited" | "active" | "revoked";

export type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "person"
  | "relation"
  | "rollup";

export type ViewType = "table" | "kanban" | "calendar" | "gallery";

export type RollupAggregation =
  | "count"
  | "count_values"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "percent_checked"
  | "percent_unchecked"
  | "show_original";

export interface AllowedUser {
  id: string;
  email: string;
  role: UserRole;
  status: InviteStatus;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  vault_salt: string | null;
  vault_verifier: string | null;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  cover_image_url: string | null;
  position: number;
  is_database: boolean;
  yjs_state: string | null;
  content_json: unknown | null;
  plain_text: string | null;
  is_vault_encrypted: boolean;
  encrypted_payload: string | null;
  encryption_iv: string | null;
  wrapped_dek: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentTreeItem {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  position: number;
  is_database: boolean;
  is_vault_encrypted: boolean;
  encrypted_payload: string | null;
  encryption_iv: string | null;
  wrapped_dek: string | null;
  updated_at: string;
}

export interface BacklinkRecord {
  source_document_id: string;
  target_document_id: string;
  block_id: string;
  created_at: string;
  source_document?: {
    id: string;
    title: string;
    icon: string | null;
    is_vault_encrypted: boolean;
  };
}

export interface CommentRecord {
  id: string;
  document_id: string;
  thread_id: string;
  block_id: string;
  author_id: string;
  body: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface DocumentVersionRecord {
  id: string;
  document_id: string;
  yjs_snapshot: string | null;
  content_json: unknown | null;
  encrypted_payload: string | null;
  encryption_iv: string | null;
  wrapped_dek: string | null;
  created_by: string;
  created_at: string;
}

export interface SelectOption {
  id: string;
  label: string;
  color: string;
}

export interface PropertyConfig {
  options?: SelectOption[];
  target_database_id?: string;
  relation_property_id?: string;
  target_property_id?: string;
  aggregation?: RollupAggregation;
  format?: "number" | "currency" | "percent";
}

export interface DatabaseProperty {
  id: string;
  database_document_id: string;
  name: string;
  type: PropertyType;
  config: PropertyConfig;
  position: number;
  created_at: string;
}

export interface FilterRule {
  id: string;
  propertyId: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "is_empty"
    | "is_not_empty"
    | "gt"
    | "lt"
    | "is_checked"
    | "is_not_checked";
  value?: string | number | boolean | null;
}

export interface SortRule {
  propertyId: string;
  direction: "asc" | "desc";
}

export interface DatabaseView {
  id: string;
  database_document_id: string;
  name: string;
  type: ViewType;
  filters: FilterRule[];
  sorts: SortRule[];
  group_by_property_id: string | null;
  calendar_date_property_id: string | null;
  visible_properties: string[];
  position: number;
}

export interface DatabaseCellValue {
  row_document_id: string;
  property_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date_start: string | null;
  value_date_end: string | null;
  value_json: unknown | null;
  updated_at: string;
}

export interface DatabaseRelationLink {
  source_row_id: string;
  property_id: string;
  target_row_id: string;
}

export interface SecurityAuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  event_type: string;
  target_resource: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
