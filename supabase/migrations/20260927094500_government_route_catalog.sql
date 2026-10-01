create table if not exists public.ils_government_route_catalog (
  id uuid primary key default gen_random_uuid(),
  service_code text unique not null,
  title text not null,
  description text,
  authority text,
  official_url text not null,
  official_domain text not null,
  first_action text,
  tracking_supported boolean not null default false,
  free_self_fill boolean not null default true,
  guided_fee numeric(10,2),
  assistant_chargeable boolean not null default true,
  source_url text not null,
  source_checked_at timestamptz not null default now(),
  verification_status text not null default 'source-checked' check (verification_status in ('source-checked','verified','pending','retired')),
  active boolean not null default true,
  last_http_status integer,
  last_final_url text,
  last_redirect_count integer,
  last_verified_at timestamptz,
  verification_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ils_government_route_catalog enable row level security;

drop policy if exists "gov_route_catalog_public_active_select" on public.ils_government_route_catalog;
create policy "gov_route_catalog_public_active_select"
on public.ils_government_route_catalog
for select to anon, authenticated
using (active = true);

drop policy if exists "gov_route_catalog_admin_all" on public.ils_government_route_catalog;
create policy "gov_route_catalog_admin_all"
on public.ils_government_route_catalog
for all to authenticated
using (public.ils_is_admin())
with check (public.ils_is_admin());

grant select on public.ils_government_route_catalog to anon, authenticated;
grant all on public.ils_government_route_catalog to authenticated;

insert into public.ils_government_route_catalog
(service_code,title,description,authority,official_url,official_domain,first_action,tracking_supported,free_self_fill,guided_fee,assistant_chargeable,source_url,verification_status,active)
values
('cyber-financial-fraud','Cyber / Online Financial Fraud','Report online and financial cyber crime through the Government of India portal.','Ministry of Home Affairs / I4C','https://www.cybercrime.gov.in/Webform/Index.aspx','cybercrime.gov.in','Use the relevant cyber-crime reporting option; for financial fraud, 1930 is the immediate reporting helpline.',true,true,19,true,'https://www.cybercrime.gov.in/Accept.aspx','source-checked',true),
('consumer-grievance','Consumer Grievance','Register and track a consumer grievance through National Consumer Helpline.','Department of Consumer Affairs, Government of India','https://consumerhelpline.gov.in/','consumerhelpline.gov.in','Register/sign in and lodge the grievance with supporting documents.',true,true,19,true,'https://consumerhelpline.gov.in/public/about','source-checked',true),
('rbi-complaint','Banking / RBI Complaint','Complaint route for eligible RBI-regulated entities through RBI CMS.','Reserve Bank of India','https://cms.rbi.org.in/','cms.rbi.org.in','Use RBI Complaint Management System after the regulated-entity complaint route where applicable.',true,true,19,true,'https://cms.rbi.org.in/','source-checked',true),
('cpgrams','Central Government Grievance','Central public grievance route for eligible Government of India grievances.','Government of India','https://pgportal.gov.in/Home/LodgeGrievance','pgportal.gov.in','Register/sign in and lodge the grievance with the relevant department.',true,true,19,true,'https://pgportal.gov.in/Home/LodgeGrievance','source-checked',true),
('digital-police','Police / FIR / Citizen Services','Official police citizen-service discovery route linking to state police portals.','Ministry of Home Affairs / NCRB','https://digitalpolice.gov.in/','digitalpolice.gov.in','Select the relevant state police citizen service or complaint route.',false,true,19,true,'https://digitalpolice.gov.in/','source-checked',true),
('gst-helpdesk','GST Help / Complaint','Official GST self-service/helpdesk route for GST issues.','Goods and Services Tax Network','https://selfservice.gstsystem.in/','selfservice.gstsystem.in','Create or track a GST helpdesk issue using the official service.',true,true,19,true,'https://selfservice.gstsystem.in/','source-checked',true),
('epfo-grievance','EPFO Grievance','Official EPFO grievance route for provident-fund related issues.','Employees’ Provident Fund Organisation','https://epfigms.gov.in/','epfigms.gov.in','Register the grievance with the relevant PF/member/employer details.',true,true,19,true,'https://epfigms.gov.in/','source-checked',true),
('income-tax','Income Tax e-Filing','Official Income Tax e-Filing portal for eligible tax services and grievances.','Income Tax Department, Government of India','https://www.incometax.gov.in/','incometax.gov.in','Sign in and select the applicable e-Filing service/help route.',true,true,19,true,'https://www.incometax.gov.in/iec/foportal/','source-checked',true),
('traffic-echallan','Traffic / eChallan','Official e-Challan web route for traffic challan services.','Ministry of Road Transport & Highways / NIC','https://echallan.parivahan.gov.in/index/accused-challan','echallan.parivahan.gov.in','Use the official challan lookup/service and enter the requested vehicle or challan details.',true,true,19,true,'https://echallan.parivahan.gov.in/www/user-manual.pdf','source-checked',true),
('ecourts-case-status','Court / Case Status','Official eCourts services for CNR, case number, party, advocate and other case-status searches.','E-Committee, Supreme Court of India / eCourts','https://services.ecourts.gov.in/ecourtindia_v6/','services.ecourts.gov.in','Use CNR or Case Status search options and complete the official captcha.',true,true,19,true,'https://services.ecourts.gov.in/ecourtindia_v6/casestatus/','source-checked',true)
on conflict(service_code) do update set
title=excluded.title,description=excluded.description,authority=excluded.authority,official_url=excluded.official_url,official_domain=excluded.official_domain,
first_action=excluded.first_action,tracking_supported=excluded.tracking_supported,source_url=excluded.source_url,
verification_status=excluded.verification_status,active=excluded.active,updated_at=now();

alter table public.ils_government_route_catalog alter column source_checked_at set default now();