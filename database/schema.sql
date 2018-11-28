begin;
drop schema public cascade;
create schema public;
create table users (
  uid serial primary key,
  salt text,
  hash text,
  nick text unique,
  email text unique,
  since timestamp not null default current_timestamp,
  score integer not null default 0,
  level integer not null default 0
);

create unlogged table session (
  token text primary key,
  session jsonb not null default '{}'::jsonb,
  since timestamp not null default current_timestamp,
  expire timestamp
);

create unlogged table github_state (
  state text primary key,
  expire timestamp not null default current_timestamp + '1 day'
);

create table source (
  sid serial primary key,
  identifier text unique not null
);

create table problem (
  pid serial primary key,
  sid integer references source(sid),
  spid integer,
  title text not null,
  description text,
  input text,
  output text,
  sinput text,
  soutput text,
  hint text,
  available boolean not null default false,
  score integer not null default 0,
  level integer not null default 0
);

create table status (
  stid integer primary key,
  status text not null
);

create table config (
  level_requirements integer ARRAY,
  lang_assoc jsonb ARRAY,
  github_client_id text,
  github_client_secret text
);

insert into status (stid, status) values
  (0, 'Pending'), (1, 'Judging'), (2, 'Aborted'), (3, 'Accepted'),
  (4, 'Compile Error'), (5, 'Runtime Error'), (6, 'Time Limit Exceeded'),
  (7, 'Memory Limit Exceeded'), (8, 'Other Error');

create table submission (
  suid serial primary key,
  pid integer references problem not null,
  uid integer references users not null,
  lid text not null,
  code text,
  stid integer references status,
  extra text,
  since timestamp not null default current_timestamp
);

commit;
