-- Disposable minimal schema fixture for the Razorpay atomic finalization migration.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text NOT NULL UNIQUE,
 user_id uuid, service_request_id uuid, total numeric NOT NULL, currency text NOT NULL DEFAULT 'INR',
 status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.service_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, service_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, service_id uuid NOT NULL,
 service_price_id uuid, quantity int NOT NULL DEFAULT 1, unit_price numeric NOT NULL,
 line_total numeric NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, gateway text NOT NULL,
 gateway_payment_id text, gateway_order_id text, amount numeric NOT NULL,
 currency text NOT NULL DEFAULT 'INR', status text NOT NULL DEFAULT 'created',
 paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL,
 event_type text NOT NULL, data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, user_id uuid NOT NULL,
 amount numeric NOT NULL, currency text NOT NULL DEFAULT 'INR', upi_id text NOT NULL,
 transaction_ref text NOT NULL, payee_name_claimed text, screenshot_path text NOT NULL,
 screenshot_sha256 text NOT NULL, mime_type text NOT NULL, file_size_bytes int NOT NULL,
 status text NOT NULL DEFAULT 'pending', verification_notes text, submitted_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz, verified_by uuid
);
CREATE TABLE public.entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, service_id uuid NOT NULL,
 order_id uuid, status text NOT NULL DEFAULT 'active', starts_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX entitlements_user_service_order_uidx ON public.entitlements(user_id,service_id,order_id);
