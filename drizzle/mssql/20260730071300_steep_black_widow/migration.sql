CREATE TABLE [api_keys] (
	[id] uniqueidentifier CONSTRAINT [api_keys_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[key_hash] nvarchar(128) NOT NULL,
	[key_prefix] nvarchar(64) NOT NULL,
	[name] nvarchar(255),
	[role] nvarchar(16) NOT NULL CONSTRAINT [api_keys_role_default] DEFAULT ('viewer'),
	[permissions] nvarchar(max) NOT NULL CONSTRAINT [api_keys_permissions_default] DEFAULT (N'[]'),
	[last_used_at] datetimeoffset(7),
	[expires_at] datetimeoffset(7),
	[rotated_at] datetimeoffset(7),
	[is_active] bit NOT NULL CONSTRAINT [api_keys_is_active_default] DEFAULT ((1)),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [api_keys_created_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [api_keys_pkey] PRIMARY KEY([id]),
	CONSTRAINT [api_keys_key_hash_key] UNIQUE([key_hash]),
	CONSTRAINT [api_keys_permissions_json_check] CHECK (isjson([api_keys].[permissions]) = 1),
	CONSTRAINT [api_keys_role_check] CHECK ([api_keys].[role] in (N'viewer', N'coworker', N'admin'))
);
--> statement-breakpoint
CREATE TABLE [canvas] (
	[id] uniqueidentifier CONSTRAINT [canvas_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[name] nvarchar(255) NOT NULL,
	[slug] nvarchar(450) NOT NULL,
	[content] nvarchar(max) NOT NULL CONSTRAINT [canvas_content_default] DEFAULT (''),
	[sections] nvarchar(max) CONSTRAINT [canvas_sections_default] DEFAULT (N'[]'),
	[metadata] nvarchar(max) CONSTRAINT [canvas_metadata_default] DEFAULT (N'{}'),
	[sort_order] int NOT NULL CONSTRAINT [canvas_sort_order_default] DEFAULT ((0)),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [canvas_created_at_default] DEFAULT (sysdatetimeoffset()),
	[updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [canvas_updated_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [canvas_pkey] PRIMARY KEY([id]),
	CONSTRAINT [canvas_sections_json_check] CHECK ([canvas].[sections] is null or isjson([canvas].[sections]) = 1),
	CONSTRAINT [canvas_metadata_json_check] CHECK ([canvas].[metadata] is null or isjson([canvas].[metadata]) = 1)
);
--> statement-breakpoint
CREATE TABLE [mcp_servers] (
	[id] uniqueidentifier CONSTRAINT [mcp_servers_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[publisher_id] uniqueidentifier,
	[name] nvarchar(255) NOT NULL,
	[description] nvarchar(max),
	[tools] nvarchar(max) CONSTRAINT [mcp_servers_tools_default] DEFAULT (N'[]'),
	[resources] nvarchar(max) CONSTRAINT [mcp_servers_resources_default] DEFAULT (N'[]'),
	[transport_type] nvarchar(16),
	[transport_config] nvarchar(max),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [mcp_servers_created_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [mcp_servers_pkey] PRIMARY KEY([id]),
	CONSTRAINT [mcp_servers_tools_json_check] CHECK ([mcp_servers].[tools] is null or isjson([mcp_servers].[tools]) = 1),
	CONSTRAINT [mcp_servers_resources_json_check] CHECK ([mcp_servers].[resources] is null or isjson([mcp_servers].[resources]) = 1),
	CONSTRAINT [mcp_servers_transport_config_json_check] CHECK ([mcp_servers].[transport_config] is null or isjson([mcp_servers].[transport_config]) = 1),
	CONSTRAINT [mcp_servers_transport_type_check] CHECK ([mcp_servers].[transport_type] is null or [mcp_servers].[transport_type] in (N'stdio', N'http', N'sse'))
);
--> statement-breakpoint
CREATE TABLE [memories] (
	[id] uniqueidentifier CONSTRAINT [memories_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[key] nvarchar(450) NOT NULL,
	[value] nvarchar(max) NOT NULL,
	[tags] nvarchar(max) NOT NULL CONSTRAINT [memories_tags_default] DEFAULT (N'[]'),
	[description] nvarchar(max),
	[updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [memories_updated_at_default] DEFAULT (sysdatetimeoffset()),
	[tier] nvarchar(16) NOT NULL CONSTRAINT [memories_tier_default] DEFAULT ('contextual'),
	[parent_key] nvarchar(450),
	[priority] int NOT NULL CONSTRAINT [memories_priority_default] DEFAULT ((50)),
	[access_count] int NOT NULL CONSTRAINT [memories_access_count_default] DEFAULT ((0)),
	[last_accessed_at] datetimeoffset(7),
	[summary] nvarchar(max),
	[source_task_id] nvarchar(255),
	[retention_policy] nvarchar(16),
	[memory_type] nvarchar(16) NOT NULL CONSTRAINT [memories_memory_type_default] DEFAULT ('flat'),
	[status] nvarchar(16),
	[metadata] nvarchar(max) CONSTRAINT [memories_metadata_default] DEFAULT (N'{}'),
	CONSTRAINT [memories_pkey] PRIMARY KEY([id]),
	CONSTRAINT [memories_value_json_check] CHECK (isjson([memories].[value]) = 1),
	CONSTRAINT [memories_tags_json_check] CHECK (isjson([memories].[tags]) = 1),
	CONSTRAINT [memories_metadata_json_check] CHECK ([memories].[metadata] is null or isjson([memories].[metadata]) = 1),
	CONSTRAINT [memories_tier_check] CHECK ([memories].[tier] in (N'working', N'contextual', N'longterm')),
	CONSTRAINT [memories_retention_policy_check] CHECK ([memories].[retention_policy] is null or [memories].[retention_policy] in (N'permanent', N'session', N'auto')),
	CONSTRAINT [memories_memory_type_check] CHECK ([memories].[memory_type] in (N'flat', N'hierarchical')),
	CONSTRAINT [memories_status_check] CHECK ([memories].[status] is null or [memories].[status] in (N'pending', N'running', N'completed', N'failed', N'blocked'))
);
--> statement-breakpoint
CREATE TABLE [playbook_collaborators] (
	[id] uniqueidentifier CONSTRAINT [playbook_collaborators_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[user_id] uniqueidentifier,
	[invited_by] uniqueidentifier NOT NULL,
	[invite_token_hash] nvarchar(128) NOT NULL,
	[invite_expires_at] datetimeoffset(7) NOT NULL,
	[accepted_at] datetimeoffset(7),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [playbook_collaborators_created_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [playbook_collaborators_pkey] PRIMARY KEY([id]),
	CONSTRAINT [playbook_collaborators_invite_token_hash_key] UNIQUE([invite_token_hash])
);
--> statement-breakpoint
CREATE TABLE [playbook_stars] (
	[id] uniqueidentifier CONSTRAINT [playbook_stars_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[user_id] uniqueidentifier NOT NULL,
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [playbook_stars_created_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [playbook_stars_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [playbooks] (
	[id] uniqueidentifier CONSTRAINT [playbooks_id_default] DEFAULT (newid()),
	[user_id] uniqueidentifier NOT NULL,
	[publisher_id] uniqueidentifier,
	[guid] nvarchar(128) NOT NULL,
	[name] nvarchar(255) NOT NULL,
	[description] nvarchar(max),
	[config] nvarchar(max) CONSTRAINT [playbooks_config_default] DEFAULT (N'{}'),
	[visibility] nvarchar(16) NOT NULL CONSTRAINT [playbooks_visibility_default] DEFAULT ('private'),
	[star_count] int NOT NULL CONSTRAINT [playbooks_star_count_default] DEFAULT ((0)),
	[tags] nvarchar(max) NOT NULL CONSTRAINT [playbooks_tags_default] DEFAULT (N'[]'),
	[persona_name] nvarchar(255),
	[persona_system_prompt] nvarchar(max),
	[persona_metadata] nvarchar(max),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [playbooks_created_at_default] DEFAULT (sysdatetimeoffset()),
	[updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [playbooks_updated_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [playbooks_pkey] PRIMARY KEY([id]),
	CONSTRAINT [playbooks_guid_key] UNIQUE([guid]),
	CONSTRAINT [playbooks_visibility_check] CHECK ([playbooks].[visibility] in (N'public', N'private', N'unlisted')),
	CONSTRAINT [playbooks_config_json_check] CHECK ([playbooks].[config] is null or isjson([playbooks].[config]) = 1),
	CONSTRAINT [playbooks_tags_json_check] CHECK (isjson([playbooks].[tags]) = 1),
	CONSTRAINT [playbooks_persona_metadata_json_check] CHECK ([playbooks].[persona_metadata] is null or isjson([playbooks].[persona_metadata]) = 1)
);
--> statement-breakpoint
CREATE TABLE [profiles] (
	[id] uniqueidentifier CONSTRAINT [profiles_id_default] DEFAULT (newid()),
	[auth_user_id] uniqueidentifier,
	[display_name] nvarchar(255) NOT NULL,
	[avatar_svg] nvarchar(max),
	[website_url] nvarchar(2048),
	[description] nvarchar(max),
	[is_verified] bit NOT NULL CONSTRAINT [profiles_is_verified_default] DEFAULT ((0)),
	[is_virtual] bit NOT NULL CONSTRAINT [profiles_is_virtual_default] DEFAULT ((0)),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [profiles_created_at_default] DEFAULT (sysdatetimeoffset()),
	[updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [profiles_updated_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [profiles_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [secrets] (
	[id] uniqueidentifier CONSTRAINT [secrets_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[name] nvarchar(255) NOT NULL,
	[description] nvarchar(max),
	[encrypted_value] nvarchar(max) NOT NULL,
	[iv] nvarchar(255) NOT NULL,
	[auth_tag] nvarchar(255) NOT NULL,
	[category] nvarchar(32) NOT NULL CONSTRAINT [secrets_category_default] DEFAULT ('general'),
	[rotated_at] datetimeoffset(7),
	[expires_at] datetimeoffset(7),
	[last_used_at] datetimeoffset(7),
	[use_count] int NOT NULL CONSTRAINT [secrets_use_count_default] DEFAULT ((0)),
	[allow_api_key_reveal] bit NOT NULL CONSTRAINT [secrets_allow_api_key_reveal_default] DEFAULT ((0)),
	[created_by] nvarchar(255),
	[updated_by] nvarchar(255),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [secrets_created_at_default] DEFAULT (sysdatetimeoffset()),
	[updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [secrets_updated_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [secrets_pkey] PRIMARY KEY([id]),
	CONSTRAINT [secrets_category_check] CHECK ([secrets].[category] in (N'api_key', N'password', N'token', N'certificate', N'connection_string', N'general'))
);
--> statement-breakpoint
CREATE TABLE [skill_attachments] (
	[id] uniqueidentifier CONSTRAINT [skill_attachments_id_default] DEFAULT (newid()),
	[skill_id] uniqueidentifier NOT NULL,
	[filename] nvarchar(512) NOT NULL,
	[file_type] nvarchar(128) NOT NULL,
	[language] nvarchar(128),
	[description] nvarchar(max),
	[content] nvarchar(max) NOT NULL,
	[size_bytes] int NOT NULL,
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [skill_attachments_created_at_default] DEFAULT (sysdatetimeoffset()),
	[updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [skill_attachments_updated_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [skill_attachments_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [skill_versions] (
	[id] uniqueidentifier CONSTRAINT [skill_versions_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[skill_id] uniqueidentifier NOT NULL,
	[name] nvarchar(255) NOT NULL,
	[description] nvarchar(max),
	[content] nvarchar(max),
	[recorded_at] datetimeoffset(7) NOT NULL CONSTRAINT [skill_versions_recorded_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [skill_versions_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [skills] (
	[id] uniqueidentifier CONSTRAINT [skills_id_default] DEFAULT (newid()),
	[playbook_id] uniqueidentifier NOT NULL,
	[publisher_id] uniqueidentifier,
	[name] nvarchar(255) NOT NULL,
	[description] nvarchar(max),
	[content] nvarchar(max),
	[licence] nvarchar(128),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [skills_created_at_default] DEFAULT (sysdatetimeoffset()),
	[priority] int CONSTRAINT [skills_priority_default] DEFAULT ((50)),
	CONSTRAINT [skills_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [user_api_keys] (
	[id] uniqueidentifier CONSTRAINT [user_api_keys_id_default] DEFAULT (newid()),
	[user_id] uniqueidentifier NOT NULL,
	[key_hash] nvarchar(128) NOT NULL,
	[key_prefix] nvarchar(64) NOT NULL,
	[name] nvarchar(255),
	[permissions] nvarchar(max) NOT NULL CONSTRAINT [user_api_keys_permissions_default] DEFAULT (N'[]'),
	[last_used_at] datetimeoffset(7),
	[expires_at] datetimeoffset(7),
	[is_active] bit NOT NULL CONSTRAINT [user_api_keys_is_active_default] DEFAULT ((1)),
	[created_at] datetimeoffset(7) NOT NULL CONSTRAINT [user_api_keys_created_at_default] DEFAULT (sysdatetimeoffset()),
	CONSTRAINT [user_api_keys_pkey] PRIMARY KEY([id]),
	CONSTRAINT [user_api_keys_key_hash_key] UNIQUE([key_hash]),
	CONSTRAINT [user_api_keys_permissions_json_check] CHECK (isjson([user_api_keys].[permissions]) = 1)
);
--> statement-breakpoint
ALTER TABLE [api_keys] ADD CONSTRAINT [api_keys_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [canvas] ADD CONSTRAINT [canvas_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [mcp_servers] ADD CONSTRAINT [mcp_servers_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [memories] ADD CONSTRAINT [memories_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [playbook_collaborators] ADD CONSTRAINT [playbook_collaborators_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [playbook_stars] ADD CONSTRAINT [playbook_stars_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [secrets] ADD CONSTRAINT [secrets_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [skill_attachments] ADD CONSTRAINT [skill_attachments_skill_id_skills_id_fk] FOREIGN KEY ([skill_id]) REFERENCES [skills]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [skill_versions] ADD CONSTRAINT [skill_versions_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]);--> statement-breakpoint
ALTER TABLE [skill_versions] ADD CONSTRAINT [skill_versions_skill_id_skills_id_fk] FOREIGN KEY ([skill_id]) REFERENCES [skills]([id]) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE [skills] ADD CONSTRAINT [skills_playbook_id_playbooks_id_fk] FOREIGN KEY ([playbook_id]) REFERENCES [playbooks]([id]) ON DELETE CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX [canvas_playbook_slug_idx] ON [canvas] ([playbook_id],[slug]);--> statement-breakpoint
CREATE UNIQUE INDEX [memories_playbook_key_idx] ON [memories] ([playbook_id],[key]);--> statement-breakpoint
CREATE UNIQUE INDEX [playbook_collaborators_playbook_user_idx] ON [playbook_collaborators] ([playbook_id],[user_id]) WHERE [user_id] is not null;--> statement-breakpoint
CREATE UNIQUE INDEX [playbook_stars_playbook_user_idx] ON [playbook_stars] ([playbook_id],[user_id]);--> statement-breakpoint
CREATE UNIQUE INDEX [secrets_playbook_name_idx] ON [secrets] ([playbook_id],[name]);