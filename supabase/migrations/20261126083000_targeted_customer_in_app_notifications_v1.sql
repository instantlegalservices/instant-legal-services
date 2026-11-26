-- Targeted Production Phase 1: customer in-app notifications for service-request status events.
-- Deliberately excludes payments, complaints, government tasks, professionals, associates,
-- SMS, email, push, and any external delivery provider.

CREATE TABLE public.ils_notification_customer_projection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_event_code text NOT NULL CHECK (source_event_code = 'SERVICE_REQUEST'),
  notification_event_code text NOT NULL CHECK (notification_event_code = 'ASSISTANCE_UPDATE'),
  channel text NOT NULL DEFAULT 'IN_APP' CHECK (channel = 'IN_APP'),
  status text NOT NULL DEFAULT 'DELIVERED' CHECK (status = 'DELIVERED'),
  safe_title text NOT NULL CHECK (length(safe_title) <= 120),
  safe_message text NOT NULL CHECK (length(safe_message) <= 500),
  dedupe_key text NOT NULL UNIQUE,
  source_record_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ils_notification_customer_projection_user_created_idx
  ON public.ils_notification_customer_projection (user_id, created_at DESC);

ALTER TABLE public.ils_notification_customer_projection ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ils_notification_customer_projection FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.ils_notification_customer_projection TO authenticated;
GRANT ALL ON TABLE public.ils_notification_customer_projection TO service_role;

CREATE POLICY ils_notification_customer_projection_owner_select
  ON public.ils_notification_customer_projection
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.ils_notification_phase1_service_request_event_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_status text := lower(coalesce(NEW.status, ''));
  v_status_label text;
  v_previous_status text;
  v_dedupe_key text;
  v_title text;
  v_message text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    v_previous_status := coalesce(OLD.status, '<null>');
    v_title := 'Service request update';
    v_message := 'Your service request status is now: ';
  ELSE
    v_previous_status := '<insert>';
    v_title := 'Service request received';
    v_message := 'We have received your service request. Current status: ';
  END IF;

  v_status_label := CASE v_status
    WHEN 'pending' THEN 'Pending'
    WHEN 'paid' THEN 'Payment received'
    WHEN 'processing' THEN 'In progress'
    WHEN 'in_progress' THEN 'In progress'
    WHEN 'completed' THEN 'Completed'
    WHEN 'cancelled' THEN 'Cancelled'
    WHEN 'rejected' THEN 'Action required'
    ELSE 'Updated'
  END;

  v_dedupe_key :=
    'service-request:' || NEW.id::text || ':' ||
    v_previous_status || '>' || coalesce(NEW.status, '<null>') || ':' ||
    pg_catalog.txid_current()::text;

  INSERT INTO public.ils_notification_customer_projection (
    user_id,
    source_event_code,
    notification_event_code,
    channel,
    status,
    safe_title,
    safe_message,
    dedupe_key,
    source_record_id,
    created_at,
    delivered_at
  )
  VALUES (
    NEW.user_id,
    'SERVICE_REQUEST',
    'ASSISTANCE_UPDATE',
    'IN_APP',
    'DELIVERED',
    v_title,
    v_message || v_status_label || '.',
    v_dedupe_key,
    NEW.id,
    now(),
    now()
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Notification failures must never block the customer's service-request write.
    RAISE WARNING 'ILS phase-1 notification skipped for service_request %: %',
      NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ils_notification_phase1_service_request_event_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_ils_notification_phase1_service_request_v1
AFTER INSERT OR UPDATE OF status ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.ils_notification_phase1_service_request_event_v1();
