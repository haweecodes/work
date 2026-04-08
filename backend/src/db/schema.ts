import { pgTable, text, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  avatar_url:    text('avatar_url'),
  created_at:    timestamp('created_at').defaultNow(),
});

export const workspaces = pgTable('workspaces', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  slug:        text('slug').notNull().unique(),
  owner_id:    text('owner_id').notNull().references(() => users.id),
  invite_code: text('invite_code').unique(),
  created_at:  timestamp('created_at').defaultNow(),
});

export const workspace_members = pgTable('workspace_members', {
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id:      text('user_id').notNull().references(() => users.id),
  role:         text('role').default('member'),
  joined_at:    timestamp('joined_at').defaultNow(),
}, (t) => [primaryKey({ columns: [t.workspace_id, t.user_id] })]);

export const channels = pgTable('channels', {
  id:           text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  name:         text('name').notNull(),
  description:  text('description'),
  is_private:   integer('is_private').default(0),
  is_archived:  integer('is_archived').default(0),
  created_by:   text('created_by').references(() => users.id),
  created_at:   timestamp('created_at').defaultNow(),
});

export const channel_members = pgTable('channel_members', {
  channel_id: text('channel_id').notNull().references(() => channels.id),
  user_id:    text('user_id').notNull().references(() => users.id),
  joined_at:  timestamp('joined_at').defaultNow(),
}, (t) => [primaryKey({ columns: [t.channel_id, t.user_id] })]);

export const dm_threads = pgTable('dm_threads', {
  id:           text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  created_at:   timestamp('created_at').defaultNow(),
});

export const dm_participants = pgTable('dm_participants', {
  thread_id: text('thread_id').notNull().references(() => dm_threads.id),
  user_id:   text('user_id').notNull().references(() => users.id),
}, (t) => [primaryKey({ columns: [t.thread_id, t.user_id] })]);

export const boards = pgTable('boards', {
  id:            text('id').primaryKey(),
  workspace_id:  text('workspace_id').notNull().references(() => workspaces.id),
  name:          text('name').notNull(),
  project_key:   text('project_key').notNull(),
  task_sequence: integer('task_sequence').default(0),
  created_at:    timestamp('created_at').defaultNow(),
});

export const columns = pgTable('columns', {
  id:         text('id').primaryKey(),
  board_id:   text('board_id').notNull().references(() => boards.id),
  title:      text('title').notNull(),
  position:   integer('position').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

export const tasks = pgTable('tasks', {
  id:                text('id').primaryKey(),
  board_id:          text('board_id').notNull().references(() => boards.id),
  column_id:         text('column_id').notNull().references(() => columns.id),
  title:             text('title').notNull(),
  description:       text('description'),
  priority:          text('priority').default('medium'),
  due_date:          timestamp('due_date'),
  created_by:        text('created_by').notNull().references(() => users.id),
  linked_message_id: text('linked_message_id'),
  parent_task_id:    text('parent_task_id'),
  position:          integer('position').notNull(),
  task_number:       integer('task_number'),
  task_key:          text('task_key'),
  created_at:        timestamp('created_at').defaultNow(),
});

export const messages = pgTable('messages', {
  id:                text('id').primaryKey(),
  channel_id:        text('channel_id').references(() => channels.id),
  dm_thread_id:      text('dm_thread_id').references(() => dm_threads.id),
  sender_id:         text('sender_id').notNull().references(() => users.id),
  content:           text('content').notNull(),
  linked_task_id:    text('linked_task_id').references(() => tasks.id),
  parent_message_id: text('parent_message_id'),
  shared_message_id: text('shared_message_id'),
  is_system:         integer('is_system').default(0),
  created_at:        timestamp('created_at').defaultNow(),
});

export const task_assignees = pgTable('task_assignees', {
  task_id: text('task_id').notNull().references(() => tasks.id),
  user_id: text('user_id').notNull().references(() => users.id),
}, (t) => [primaryKey({ columns: [t.task_id, t.user_id] })]);

export const notifications = pgTable('notifications', {
  id:             text('id').primaryKey(),
  user_id:        text('user_id').notNull().references(() => users.id),
  type:           text('type').notNull(),
  reference_id:   text('reference_id'),
  reference_type: text('reference_type'),
  message:        text('message'),
  is_read:        integer('is_read').default(0),
  created_at:     timestamp('created_at').defaultNow(),
});

export const message_reactions = pgTable('message_reactions', {
  message_id: text('message_id').notNull().references(() => messages.id),
  user_id:    text('user_id').notNull().references(() => users.id),
  emoji:      text('emoji').notNull(),
  created_at: timestamp('created_at').defaultNow(),
}, (t) => [primaryKey({ columns: [t.message_id, t.user_id, t.emoji] })]);
