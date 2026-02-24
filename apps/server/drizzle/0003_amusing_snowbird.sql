CREATE TABLE "auto_reply_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"trigger_type" varchar(50) NOT NULL,
	"trigger_config" jsonb NOT NULL,
	"reply_content" text NOT NULL,
	"reply_type" varchar(20) DEFAULT 'text',
	"menu_options" jsonb,
	"match_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inspector_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"grade" varchar(20) NOT NULL,
	"categories" jsonb,
	"strengths" text,
	"weaknesses" text,
	"suggestions" text,
	"status" varchar(50) DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"filters" jsonb NOT NULL,
	"color" varchar(20),
	"customer_count" integer DEFAULT 0,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"parent_id" uuid,
	"leader_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true,
	"trigger_type" varchar(50) NOT NULL,
	"threshold_minutes" integer NOT NULL,
	"action" varchar(50) NOT NULL,
	"action_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"page_title" varchar(500),
	"referrer" text,
	"duration" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "proactive_chat_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true,
	"trigger_type" varchar(50) NOT NULL,
	"trigger_config" jsonb NOT NULL,
	"message" text NOT NULL,
	"display_delay" integer DEFAULT 0,
	"max_show_count" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"conditions" jsonb NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"amount" integer DEFAULT 0,
	"currency" varchar(10) DEFAULT 'CNY',
	"interval" varchar(20) DEFAULT 'monthly',
	"external_id" varchar(255),
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"end_date" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"seats" integer DEFAULT 0,
	"conversations" integer DEFAULT 0,
	"messages" integer DEFAULT 0,
	"leads" integer DEFAULT 0,
	"storage_mb" integer DEFAULT 0,
	"api_calls" integer DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"trigger_event" varchar(100) NOT NULL,
	"trigger_data" jsonb,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"steps_executed" integer DEFAULT 0,
	"steps_total" integer DEFAULT 0,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'starter';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "agent_last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "grade" varchar(20);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "source_page_url" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "source_keyword" varchar(255);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "has_lead" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "detected_contact" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "is_invalid" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "queue_position" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "queue_entered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "pre_chat_form" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_by" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "max_seats" integer DEFAULT 3;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "max_conversations_per_month" integer DEFAULT 100;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "max_leads" integer DEFAULT 200;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "max_knowledge_bases" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "max_storage_mb" integer DEFAULT 500;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "features" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "widget_config" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarding_completed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "online_status" varchar(20) DEFAULT 'offline';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "max_concurrent_chats" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_online_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD COLUMN "current_page_title" varchar(500);--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_inspections" ADD CONSTRAINT "conversation_inspections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_inspections" ADD CONSTRAINT "conversation_inspections_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_inspections" ADD CONSTRAINT "conversation_inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_segments" ADD CONSTRAINT "customer_segments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_chat_rules" ADD CONSTRAINT "proactive_chat_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspections_org_idx" ON "conversation_inspections" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "inspections_conv_idx" ON "conversation_inspections" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "customer_segments_org_idx" ON "customer_segments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "departments_org_idx" ON "departments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "escalation_rules_org_active_idx" ON "escalation_rules" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE INDEX "page_views_session_created_idx" ON "page_views" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "page_views_org_created_idx" ON "page_views" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_org_period_idx" ON "usage_records" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_org_idx" ON "workflow_runs" USING btree ("org_id","started_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_org_action_idx" ON "audit_logs" USING btree ("org_id","action");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blacklist_org_type_value_uniq" ON "blacklist" USING btree ("org_id","type","value");--> statement-breakpoint
CREATE INDEX "campaigns_org_status_idx" ON "campaigns" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "canned_responses_org_idx" ON "canned_responses" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_org_platform_name_uniq" ON "channels" USING btree ("org_id","platform","name");--> statement-breakpoint
CREATE INDEX "conversations_org_status_idx" ON "conversations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "conversations_org_channel_idx" ON "conversations" USING btree ("org_id","channel_id");--> statement-breakpoint
CREATE INDEX "conversations_customer_idx" ON "conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "conversations_org_agent_idx" ON "conversations" USING btree ("org_id","agent_id");--> statement-breakpoint
CREATE INDEX "conversations_org_created_idx" ON "conversations" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_org_stage_idx" ON "customers" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "customers_org_updated_idx" ON "customers" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "deals_org_stage_idx" ON "deals" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "deals_org_customer_idx" ON "deals" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "document_chunks_doc_idx" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "documents_kb_idx" ON "documents" USING btree ("kb_id");--> statement-breakpoint
CREATE INDEX "faqs_kb_active_idx" ON "faqs" USING btree ("kb_id","is_active");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "knowledge_bases_org_idx" ON "knowledge_bases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "leads_org_status_idx" ON "leads" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "leads_org_source_idx" ON "leads" USING btree ("org_id","source_platform");--> statement-breakpoint
CREATE INDEX "leads_org_assigned_idx" ON "leads" USING btree ("org_id","assigned_to");--> statement-breakpoint
CREATE INDEX "leads_org_created_idx" ON "leads" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "memories_customer_idx" ON "memories" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "memories_org_idx" ON "memories" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_content_search_idx" ON "messages" USING btree ("conversation_id","sender_type");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "offline_consultations_org_status_idx" ON "offline_consultations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "roles_org_idx" ON "roles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "teams_org_idx" ON "teams" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_idx" ON "ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_org_status_idx" ON "tickets" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "tickets_org_priority_idx" ON "tickets" USING btree ("org_id","priority");--> statement-breakpoint
CREATE INDEX "tickets_org_assignee_idx" ON "tickets" USING btree ("org_id","assignee_id");--> statement-breakpoint
CREATE INDEX "users_org_status_idx" ON "users" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "visitor_sessions_org_online_idx" ON "visitor_sessions" USING btree ("org_id","is_online");--> statement-breakpoint
CREATE INDEX "visitor_sessions_org_active_idx" ON "visitor_sessions" USING btree ("org_id","last_active_at");--> statement-breakpoint
CREATE INDEX "webhooks_org_active_idx" ON "webhooks" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE INDEX "workflows_org_active_trigger_idx" ON "workflows" USING btree ("org_id","is_active","trigger_type");