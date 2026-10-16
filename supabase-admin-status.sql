-- Run once in the SQL Editor of the Supabase project used by this website.
-- Existing Auth accounts are mapped at the end: admin@cg5.com = Admin,
-- user@cg5.com = read-only User.

create table if not exists public.cg5_user_roles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null check (role in ('admin', 'user')),
    created_at timestamptz not null default now()
);

alter table public.cg5_user_roles enable row level security;
drop policy if exists "Users can read their own CG-5 role" on public.cg5_user_roles;
create policy "Users can read their own CG-5 role"
    on public.cg5_user_roles for select to authenticated
    using (user_id = (select auth.uid()));
grant select on public.cg5_user_roles to authenticated;

create or replace function public.cg5_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.cg5_user_roles r
        where r.user_id = (select auth.uid())
          and r.role = 'admin'
    );
$$;
revoke all on function public.cg5_is_admin() from public, anon;
grant execute on function public.cg5_is_admin() to authenticated;

create table if not exists public.admin_personnel_status (
    id uuid primary key default gen_random_uuid(),
    serial text not null unique,
    rank_fullname text not null,
    designation text not null default '',
    status text not null default 'Available',
    desk text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.admin_leave_monitoring (
    id uuid primary key default gen_random_uuid(),
    personnel_id uuid not null
        references public.admin_personnel_status(id) on delete cascade,
    start_date date not null,
    end_date date not null,
    reason text not null default '',
    status text not null default 'Pending'
        check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    created_at timestamptz not null default now(),
    constraint admin_leave_monitoring_valid_dates
        check (end_date >= start_date)
);

-- Shared, single current duty roster. Users can read it; only Admin can replace it.
create table if not exists public.duty_rotation_state (
    id smallint primary key check (id = 1),
    config jsonb not null default '{}'::jsonb,
    roster jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null
);

create index if not exists admin_leave_monitoring_personnel_dates_idx
    on public.admin_leave_monitoring (personnel_id, start_date, end_date);

create or replace view public.admin_personnel_current as
select
    p.id,
    p.serial,
    p.rank_fullname,
    p.designation,
    p.status as base_status,
    case
        when exists (
            select 1
            from public.admin_leave_monitoring l
            where l.personnel_id = p.id
              and l.status = 'Approved'
              and current_date between l.start_date and l.end_date
        ) then 'On Leave'
        else p.status
    end as status,
    p.desk,
    p.created_at,
    p.updated_at
from public.admin_personnel_status p;

-- Replace any old policies so authenticated Users can read but only Admin
-- can insert, update, or delete in duty and admin tables.
do $$
declare
    table_name text;
    existing_policy text;
begin
    foreach table_name in array array[
        'duty_personnel',
        'duty_exemptions',
        'duty_special_assignments',
        'admin_personnel_status',
        'admin_leave_monitoring',
        'duty_rotation_state'
    ] loop
        if to_regclass(format('public.%I', table_name)) is null then
            raise exception 'Required table public.% is missing', table_name;
        end if;

        execute format('alter table public.%I enable row level security', table_name);

        for existing_policy in
            select p.policyname
            from pg_policies p
            where p.schemaname = 'public'
              and p.tablename = table_name
        loop
            execute format('drop policy %I on public.%I', existing_policy, table_name);
        end loop;

        execute format(
            'create policy %I on public.%I for select to authenticated using (true)',
            table_name || '_signed_in_read', table_name
        );
        execute format(
            'create policy %I on public.%I for all to authenticated using (public.cg5_is_admin()) with check (public.cg5_is_admin())',
            table_name || '_admin_manage', table_name
        );
        execute format(
            'grant select, insert, update, delete on public.%I to authenticated',
            table_name
        );
    end loop;
end;
$$;

grant select on public.admin_personnel_current to authenticated;

-- Assign roles to the two existing Supabase Auth accounts.
do $$
begin
    if (
        select count(*)
        from auth.users
        where lower(email) in ('admin@cg5.com', 'user@cg5.com')
    ) <> 2 then
        raise exception 'Both admin@cg5.com and user@cg5.com must already exist in Supabase Authentication.';
    end if;
end;
$$;

insert into public.cg5_user_roles (user_id, role)
select id,
       case lower(email)
           when 'admin@cg5.com' then 'admin'
           when 'user@cg5.com' then 'user'
       end
from auth.users
where lower(email) in ('admin@cg5.com', 'user@cg5.com')
on conflict (user_id) do update set role = excluded.role;

notify pgrst, 'reload schema';
