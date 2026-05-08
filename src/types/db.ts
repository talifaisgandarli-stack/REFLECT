/**
 * Hand-written DB types (canonical names from PRD §3.2).
 * Keep in lockstep with supabase/migrations/0001_init_schema.sql.
 * Regenerate via `supabase gen types typescript` once a project is linked.
 */
export type RoleKey = 'creator' | 'admin' | 'manager' | 'bd_lead' | 'member' | 'viewer';

export type TaskStatus =
  | 'idea'
  | 'queued'
  | 'active'
  | 'review'
  | 'expert'
  | 'done'
  | 'cancelled';

export type ProjectStatus = 'active' | 'on_hold' | 'closed' | 'cancelled';

export type ClientPipelineStage =
  | 'lead'
  | 'proposal'
  | 'negotiation'
  | 'signed'
  | 'in_progress'
  | 'portfolio'
  | 'lost'
  | 'archived';

export type PresenceStatus = 'online' | 'away' | 'offline';

export type MiraiPersona =
  | 'general'
  | 'project_manager'
  | 'finance_analyst'
  | 'cmo'
  | 'hr_partner';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role_id: string | null;
  is_creator: boolean;
  is_active: boolean;
  telegram_chat_id: string | null;
  telegram_linked_at: string | null;
  locale: 'az' | 'en' | 'ru';
  career_level_id: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  key: RoleKey;
  level: number;
  name: string;
  is_admin: boolean;
}

export interface Project {
  id: string;
  name: string;
  client_id: string | null;
  phases: string[];
  requires_expertise: boolean;
  expertise_deadline: string | null;
  payment_buffer_days: number;
  deadline: string | null;
  start_date: string | null;
  status: ProjectStatus;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
  reopened_at: string | null;
}

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  parent_task_id: string | null;
  task_level: number;
  assignee_ids: string[];
  start_date: string | null;
  deadline: string | null;
  estimated_duration: number | null;
  duration_unit: string | null;
  risk_buffer_pct: number;
  is_expertise_subtask: boolean;
  workload: number | null;
  workload_calculated_at: string | null;
  cancel_reason: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  pipeline_stage: ClientPipelineStage;
  confidence_pct: number;
  expected_value: number | null;
  last_interaction_at: string | null;
  ai_icp_fit: number | null;
  created_by: string | null;
  created_at: string;
}

export type InteractionType = 'call' | 'email' | 'meeting' | 'whatsapp' | 'other';

export interface ClientInteraction {
  id: string;
  client_id: string;
  type: InteractionType;
  note: string | null;
  occurred_at: string;
  logged_by: string | null;
}

export interface ClientStageHistory {
  id: string;
  client_id: string;
  from_stage: ClientPipelineStage | null;
  to_stage: ClientPipelineStage;
  changed_by: string | null;
  changed_at: string;
  lost_reason: string | null;
}

export type ReceivableStatus = 'open' | 'partial' | 'paid' | 'overdue';
export type OutsourceStatus = 'order' | 'in_progress' | 'delivered' | 'paid';
export type RecurringPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Income {
  id: string;
  project_id: string | null;
  client_id: string | null;
  amount: number;
  payment_method: string | null;
  occurred_at: string;
  invoice_number: string | null;
  note: string | null;
  created_by: string | null;
}

export interface Expense {
  id: string;
  project_id: string | null;
  category: string | null;
  amount: number;
  vendor: string | null;
  occurred_at: string;
  note: string | null;
  created_by: string | null;
  recurring_rule_id: string | null;
}

export interface Receivable {
  id: string;
  client_id: string | null;
  project_id: string | null;
  amount: number;
  due_at: string | null;
  paid_amount: number;
  status: ReceivableStatus;
  created_at: string;
}

export interface OutsourceItem {
  id: string;
  project_id: string | null;
  work_title: string;
  contact_person: string | null;
  contact_company: string | null;
  amount: number | null;
  paid_at: string | null;
  payment_method: string | null;
  responsible_user_id: string | null;
  deadline: string | null;
  status: OutsourceStatus;
  created_at: string;
}

export interface SystemAward {
  id: string;
  name: string;
  organizer: string | null;
  deadline_month: number | null;
  url: string | null;
  criteria: string | null;
}

export interface PortfolioApplicationItem {
  key: string;
  label: string;
  checked: boolean;
}

export interface PortfolioApplications {
  [awardId: string]: { items: PortfolioApplicationItem[] };
}

export interface PortfolioWorkflow {
  id: string;
  project_id: string;
  selected_awards: string[];
  website_published_at: string | null;
  press_release_sent: boolean;
  applications: PortfolioApplications;
}

export interface CloseoutItem {
  key: string;
  label: string;
  checked: boolean;
}

export interface CloseoutChecklist {
  id: string;
  project_id: string;
  items: CloseoutItem[];
  completed_at: string | null;
}

/**
 * Career-level requirement. `kind`/`op`/`value` are optional metadata that
 * make the row auto-checkable (US-CAREER-01 final AC). When absent, the row
 * renders as a manual unchecked checklist entry.
 */
export type CareerMetricKind = 'closed_projects' | 'completed_tasks';
export type CareerMetricOp = '>=' | '<=' | '=';

export interface CareerRequirement {
  label: string;
  kind?: CareerMetricKind;
  op?: CareerMetricOp;
  value?: number;
}

export interface CareerLevel {
  id: string;
  name: string;
  level_index: number;
  requirements: CareerRequirement[];
  created_at: string;
}

export type DocumentSource = 'drive_link' | 'auto_generated' | 'upload';

export interface ProjectDocument {
  id: string;
  project_id: string | null;
  client_id: string | null;
  category: string | null;
  title: string;
  source: DocumentSource;
  external_link: string | null;
  storage_path: string | null;
  share_token: string | null;
  shared_with: string[];
  created_by: string | null;
  created_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  kind: string | null;
  serial: string | null;
  assigned_to: string | null;
  condition: string | null;
  purchased_at: string | null;
  notes: string | null;
}

export interface EquipmentTransfer {
  id: string;
  equipment_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  changed_by: string | null;
  transferred_at: string;
  note: string | null;
}

export type ContentStatus = 'idea' | 'draft' | 'review' | 'published';

export interface ContentPlan {
  id: string;
  channel: string;
  scheduled_at: string | null;
  topic: string;
  owner_id: string | null;
  status: ContentStatus;
  body: string | null;
  created_by: string | null;
  created_at: string;
}

export type NotificationChannel = 'in_app' | 'email' | 'telegram';

export interface NotificationPreference {
  user_id: string;
  channel: NotificationChannel;
  event_kind: string;
  enabled: boolean;
}

export interface DayLog {
  id: string;
  employee_id: string;
  day: string;
  hours: number;
  project_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type FeedSourceKind = 'trend' | 'opportunity' | 'partner';

export interface MiraiFeedPost {
  id: string;
  source_url: string;
  source_kind: FeedSourceKind;
  summary: string | null;
  deadline_at: string | null;
  fetched_at: string;
  posted_announcement_id: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  cover_url: string | null;
  is_featured: boolean;
  mirai_generated: boolean;
  approved: boolean;
  approved_by: string | null;
  created_by: string | null;
  published_at: string | null;
  read_by: Record<string, boolean>;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  recurrence_rule: string | null;
  location: string | null;
  meet_url: string | null;
  organizer_id: string | null;
  attendees: string[];
  external_emails: string[];
  project_id: string | null;
  created_at: string;
}

export type LeaveKind = 'annual' | 'sick' | 'unpaid' | 'parental' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  kind: LeaveKind;
  starts_at: string;
  ends_at: string;
  days: number;
  status: LeaveStatus;
  approver_id: string | null;
  approved_at: string | null;
  calendar_event_id: string | null;
  note: string | null;
  created_at: string;
}

export type OkrScope = 'company' | 'personal';

export interface Okr {
  id: string;
  scope: OkrScope;
  employee_id: string | null;
  period: string;
  objective: string;
  owner_id: string | null;
  created_at: string;
}

export interface KeyResult {
  id: string;
  okr_id: string;
  title: string;
  metric_type: string | null;
  current_value: number;
  target_value: number;
  unit: string | null;
  updated_at: string;
}

export interface Salary {
  id: string;
  employee_id: string;
  amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  components: Record<string, unknown>;
  created_at: string;
}

export interface PerformanceReview {
  id: string;
  employee_id: string;
  year: number;
  score: number;
  ratings: Record<string, number>;
  reviewer_id: string | null;
  summary: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  category: string;
  name: string;
  body: string | null;
  variables: string[];
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProjectPnl {
  project_id: string;
  project_name: string;
  income: number;
  expenses: number;
  outsource: number;
  net: number;
}

export interface CashForecastRow {
  id: string;
  generated_at: string;
  horizon_days: 30 | 60 | 90;
  projected_balance: number;
  confidence_low: number | null;
  confidence_high: number | null;
}

export interface UserPresence {
  user_id: string;
  status: PresenceStatus;
  last_heartbeat_at: string;
  current_page: string | null;
  session_type: 'desktop' | 'mobile';
}

export interface ActivityLogEntry {
  id: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  action: string;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

// Minimal Database surface for supabase-js generic typing.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      roles: { Row: Role; Insert: Partial<Role>; Update: Partial<Role> };
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project> };
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> };
      incomes: { Row: Income; Insert: Partial<Income>; Update: Partial<Income> };
      expenses: { Row: Expense; Insert: Partial<Expense>; Update: Partial<Expense> };
      receivables: {
        Row: Receivable;
        Insert: Partial<Receivable>;
        Update: Partial<Receivable>;
      };
      outsource_items: {
        Row: OutsourceItem;
        Insert: Partial<OutsourceItem>;
        Update: Partial<OutsourceItem>;
      };
      clients: { Row: Client; Insert: Partial<Client>; Update: Partial<Client> };
      client_interactions: {
        Row: ClientInteraction;
        Insert: Partial<ClientInteraction>;
        Update: Partial<ClientInteraction>;
      };
      client_stage_history: {
        Row: ClientStageHistory;
        Insert: Partial<ClientStageHistory>;
        Update: never;
      };
      user_presence: { Row: UserPresence; Insert: Partial<UserPresence>; Update: Partial<UserPresence> };
      activity_log: {
        Row: ActivityLogEntry;
        Insert: Partial<ActivityLogEntry>;
        Update: Partial<ActivityLogEntry>;
      };
      task_status_history: {
        Row: {
          id: string;
          task_id: string;
          from_status: TaskStatus | null;
          to_status: TaskStatus;
          changed_by: string | null;
          changed_at: string;
        };
        Insert: { task_id: string; from_status?: TaskStatus | null; to_status: TaskStatus };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      set_client_stage: {
        Args: { p_client_id: string; p_to_stage: ClientPipelineStage; p_lost_reason?: string | null };
        Returns: void;
      };
      mark_receivable_paid: {
        Args: { p_receivable_id: string; p_delta: number };
        Returns: Receivable;
      };
      update_outsource_status: {
        Args: { p_item_id: string; p_status: OutsourceStatus };
        Returns: OutsourceItem;
      };
    };
    Enums: {
      task_status: TaskStatus;
      project_status: ProjectStatus;
      client_pipeline_stage: ClientPipelineStage;
      presence_status: PresenceStatus;
      mirai_persona: MiraiPersona;
    };
  };
}
