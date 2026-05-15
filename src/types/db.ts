/**
 * Hand-written DB types (canonical names from PRD §3.2).
 * Keep in lockstep with supabase/migrations/0001_init_schema.sql.
 * Regenerate via `supabase gen types typescript` once a project is linked.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

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

export type InteractionType = 'call' | 'email' | 'meeting' | 'whatsapp' | 'other';

export type OutsourceStatus = 'order' | 'in_progress' | 'delivered' | 'paid';

export type ReceivableStatus = 'open' | 'partial' | 'paid' | 'overdue';

export type DocumentSource = 'drive_link' | 'auto_generated' | 'upload';

export type OKRScope = 'company' | 'personal';

export type LeaveStatus = 'pending' | 'approved' | 'denied';

export type ContentStatus = 'idea' | 'draft' | 'review' | 'published';

export type FeedSourceKind = 'trend' | 'opportunity';

// ── Auth / Identity ──────────────────────────────────────────────────────────

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
  created_at: string;
}

export interface Role {
  id: string;
  key: RoleKey;
  level: number;
  name: string;
  is_admin: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role_id: string;
  invited_by: string | null;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

// ── Projects ─────────────────────────────────────────────────────────────────

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

export interface Template {
  id: string;
  category: string;
  name: string;
  body: string | null;
  variables: Record<string, unknown>;
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RetrospectiveSurvey {
  id: string;
  project_id: string | null;
  client_id: string | null;
  share_token: string | null;
  sent_at: string | null;
  responded_at: string | null;
  nps_score: number | null;
  ratings: Record<string, unknown> | null;
  comment: string | null;
}

export interface CloseoutChecklist {
  id: string;
  project_id: string;
  items: unknown[];
  completed_at: string | null;
}

export interface PortfolioWorkflow {
  id: string;
  project_id: string;
  selected_awards: string[];
  website_published_at: string | null;
  press_release_sent: boolean;
  applications: unknown[];
}

export interface SystemAward {
  id: string;
  name: string;
  organizer: string | null;
  deadline_month: number | null;
  url: string | null;
  criteria: string | null;
}

// ── Tasks ────────────────────────────────────────────────────────────────────

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

export interface TaskStatusHistory {
  id: string;
  task_id: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  changed_by: string | null;
  changed_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  mentions: string[];
  created_at: string;
}

// ── Clients / CRM ─────────────────────────────────────────────────────────────

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
  ai_icp_calculated_at: string | null;
  created_by: string | null;
  created_at: string;
}

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

// ── Finance ──────────────────────────────────────────────────────────────────

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

export interface RecurringExpense {
  id: string;
  label: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_run_at: string;
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

export interface CashForecast {
  id: string;
  generated_at: string;
  horizon_days: 30 | 60 | 90;
  projected_balance: number;
  confidence_low: number | null;
  confidence_high: number | null;
  generated_by: string | null;
}

// ── Team ─────────────────────────────────────────────────────────────────────

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

export interface LeaveRequest {
  id: string;
  employee_id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  days: number;
  status: LeaveStatus;
  approver_id: string | null;
  note: string | null;
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

export interface CareerLevel {
  id: string;
  name: string;
  level_index: number;
  requirements: Record<string, unknown>;
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

// ── Communication ─────────────────────────────────────────────────────────────

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

export interface Notification {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  event_kind: string;
  in_app: boolean;
  email: boolean;
  telegram: boolean;
}

export interface ContentPlan {
  id: string;
  channel: string;
  scheduled_at: string | null;
  topic: string;
  owner_id: string | null;
  status: ContentStatus;
  body: string | null;
  created_at: string;
}

// ── AI / MIRAI ────────────────────────────────────────────────────────────────

export interface MiraiConversation {
  id: string;
  user_id: string;
  persona: MiraiPersona;
  started_at: string;
  last_message_at: string | null;
  archived_at: string | null;
}

export interface MiraiMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  tools_used: unknown[];
  created_at: string;
}

export interface MiraiUsageLog {
  id: string;
  user_id: string;
  period_yyyymm: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  persona?: string;
}

export interface MiraiFeedback {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  message_index: number | null;
  vote: 'up' | 'down';
  created_at: string;
}

export interface MiraiFeedPost {
  id: string;
  source_url: string;
  source_kind: FeedSourceKind;
  summary: string | null;
  deadline_at: string | null;
  fetched_at: string;
  posted_announcement_id: string | null;
}

export interface KnowledgeBase {
  id: string;
  source_pdf: string;
  chunk_index: number;
  content: string;
  /** FTS index column (migration 0028 replaced vector embedding with tsvector). */
  content_tsv: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

// ── OKR ──────────────────────────────────────────────────────────────────────

export interface OKR {
  id: string;
  scope: OKRScope;
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

// ── System ───────────────────────────────────────────────────────────────────

export interface SystemSetting {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  resource: string | null;
  ip: string | null;
  user_agent: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

// ── Presence + Focus ──────────────────────────────────────────────────────────

export interface UserPresence {
  user_id: string;
  status: PresenceStatus;
  last_heartbeat_at: string;
  current_page: string | null;
  session_type: 'desktop' | 'mobile';
  /** Joined from profiles via useTeamPresence (REQ-PRESENCE-03). */
  profiles?: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

export interface FocusSession {
  id: string;
  user_id: string;
  started_at: string;
  planned_minutes: number;
  completed_at: string | null;
  interrupted: boolean;
  mascot_stage: number;
}

// ── Activity ──────────────────────────────────────────────────────────────────

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
  /** Joined from profiles when using useActivityFeed (PRD §6.1 avatar requirement). */
  profiles?: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

// ── Minimal Database surface for supabase-js generic typing ──────────────────

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      roles: { Row: Role; Insert: Partial<Role>; Update: Partial<Role> };
      invitations: { Row: Invitation; Insert: Partial<Invitation>; Update: Partial<Invitation> };
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project> };
      project_documents: { Row: ProjectDocument; Insert: Partial<ProjectDocument>; Update: Partial<ProjectDocument> };
      templates: { Row: Template; Insert: Partial<Template>; Update: Partial<Template> };
      retrospective_surveys: { Row: RetrospectiveSurvey; Insert: Partial<RetrospectiveSurvey>; Update: Partial<RetrospectiveSurvey> };
      closeout_checklists: { Row: CloseoutChecklist; Insert: Partial<CloseoutChecklist>; Update: Partial<CloseoutChecklist> };
      portfolio_workflows: { Row: PortfolioWorkflow; Insert: Partial<PortfolioWorkflow>; Update: Partial<PortfolioWorkflow> };
      system_awards: { Row: SystemAward; Insert: Partial<SystemAward>; Update: Partial<SystemAward> };
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> };
      task_status_history: {
        Row: TaskStatusHistory;
        Insert: Omit<TaskStatusHistory, 'id' | 'changed_at'>;
        Update: never;
      };
      task_comments: { Row: TaskComment; Insert: Omit<TaskComment, 'id' | 'created_at'>; Update: Partial<Pick<TaskComment, 'body'>> };
      clients: { Row: Client; Insert: Partial<Client>; Update: Partial<Client> };
      client_interactions: { Row: ClientInteraction; Insert: Partial<ClientInteraction>; Update: Partial<ClientInteraction> };
      client_stage_history: { Row: ClientStageHistory; Insert: Partial<ClientStageHistory>; Update: never };
      incomes: { Row: Income; Insert: Partial<Income>; Update: Partial<Income> };
      expenses: { Row: Expense; Insert: Partial<Expense>; Update: Partial<Expense> };
      recurring_expenses: { Row: RecurringExpense; Insert: Partial<RecurringExpense>; Update: Partial<RecurringExpense> };
      outsource_items: { Row: OutsourceItem; Insert: Partial<OutsourceItem>; Update: Partial<OutsourceItem> };
      receivables: { Row: Receivable; Insert: Partial<Receivable>; Update: Partial<Receivable> };
      cash_forecasts: { Row: CashForecast; Insert: Partial<CashForecast>; Update: never };
      salaries: { Row: Salary; Insert: Partial<Salary>; Update: Partial<Salary> };
      leave_requests: { Row: LeaveRequest; Insert: Partial<LeaveRequest>; Update: Partial<LeaveRequest> };
      performance_reviews: { Row: PerformanceReview; Insert: Partial<PerformanceReview>; Update: Partial<PerformanceReview> };
      career_levels: { Row: CareerLevel; Insert: Partial<CareerLevel>; Update: Partial<CareerLevel> };
      equipment: { Row: Equipment; Insert: Partial<Equipment>; Update: Partial<Equipment> };
      announcements: { Row: Announcement; Insert: Partial<Announcement>; Update: Partial<Announcement> };
      calendar_events: { Row: CalendarEvent; Insert: Partial<CalendarEvent>; Update: Partial<CalendarEvent> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
      notification_preferences: { Row: NotificationPreference; Insert: Partial<NotificationPreference>; Update: Partial<NotificationPreference> };
      content_plans: { Row: ContentPlan; Insert: Partial<ContentPlan>; Update: Partial<ContentPlan> };
      mirai_conversations: { Row: MiraiConversation; Insert: Partial<MiraiConversation>; Update: Partial<MiraiConversation> };
      mirai_messages: { Row: MiraiMessage; Insert: Partial<MiraiMessage>; Update: Partial<MiraiMessage> };
      mirai_usage_log: { Row: MiraiUsageLog; Insert: Partial<MiraiUsageLog>; Update: Partial<MiraiUsageLog> };
      mirai_feedback: { Row: MiraiFeedback; Insert: Partial<MiraiFeedback>; Update: never };
      mirai_feed_posts: { Row: MiraiFeedPost; Insert: Partial<MiraiFeedPost>; Update: Partial<MiraiFeedPost> };
      knowledge_base: { Row: KnowledgeBase; Insert: Partial<KnowledgeBase>; Update: Partial<KnowledgeBase> };
      okrs: { Row: OKR; Insert: Partial<OKR>; Update: Partial<OKR> };
      key_results: { Row: KeyResult; Insert: Partial<KeyResult>; Update: Partial<KeyResult> };
      system_settings: { Row: SystemSetting; Insert: Partial<SystemSetting>; Update: Partial<SystemSetting> };
      audit_log: { Row: AuditLog; Insert: Partial<AuditLog>; Update: never };
      activity_log: { Row: ActivityLogEntry; Insert: Partial<ActivityLogEntry>; Update: Partial<ActivityLogEntry> };
      user_presence: { Row: UserPresence; Insert: Partial<UserPresence>; Update: Partial<UserPresence> };
      focus_sessions: { Row: FocusSession; Insert: Partial<FocusSession>; Update: Partial<FocusSession> };
    };
    Views: {
      outsource_user_view: {
        Row: Pick<OutsourceItem, 'id' | 'project_id' | 'work_title' | 'contact_person' | 'deadline' | 'status' | 'responsible_user_id'>;
      };
      /** PRD §3 — all project columns for admins (incl. future financial fields). */
      projects_admin_view: { Row: Project };
      /** PRD §3 — project columns excluding financial fields for non-admins. */
      projects_user_view: {
        Row: Pick<Project, 'id' | 'name' | 'client_id' | 'phases' | 'requires_expertise' | 'expertise_deadline' | 'deadline' | 'start_date' | 'status' | 'created_by' | 'created_at' | 'archived_at'>;
      };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      set_client_stage: {
        Args: { p_client_id: string; p_to_stage: ClientPipelineStage; p_lost_reason?: string | null };
        Returns: void;
      };
      ensure_profile: {
        Args: { p_id: string; p_email: string };
        Returns: Profile[];
      };
      match_knowledge_base: {
        Args: { query_text: string; match_count: number };
        Returns: Array<{ source_pdf: string; chunk_index: number; content: string }>;
      };
    };
    Enums: {
      task_status: TaskStatus;
      project_status: ProjectStatus;
      client_pipeline_stage: ClientPipelineStage;
      presence_status: PresenceStatus;
      mirai_persona: MiraiPersona;
      outsource_status: OutsourceStatus;
      receivable_status: ReceivableStatus;
      document_source: DocumentSource;
      okr_scope: OKRScope;
      leave_status: LeaveStatus;
      content_status: ContentStatus;
      feed_source_kind: FeedSourceKind;
    };
  };
}
